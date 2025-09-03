import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import crypto from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import cron from 'node-cron';
import { findHeaderIndex as _findHeaderIndex, parseDayHeaders as _parseDayHeaders, deriveSegmentsFromCell as _deriveSegmentsFromCell } from './lib/csvParser.mjs';
import { overlapMinutes as _overlapMinutes, hoursUsedAtPure as _hoursUsedAtPure } from './lib/hosCore.mjs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// Pinecone v3: no environment property; index is resolved by name
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pcIndexName = process.env.PINECONE_INDEX_NAME || 'nbrain';
const pcTargetDim = Number(process.env.PINECONE_DIM || 768);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function downProject(vector, targetDim) {
  const n = vector.length;
  if (n === targetDim) return vector;
  const out = new Array(targetDim).fill(0);
  const factor = n / targetDim; // e.g., 1536/768=2, 3072/768=4
  for (let i = 0; i < targetDim; i++) {
    const start = Math.floor(i * factor);
    const end = Math.floor((i + 1) * factor);
    let sum = 0;
    let count = 0;
    for (let j = start; j < Math.min(end, n); j++) { sum += vector[j]; count++; }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

async function getTopSpeedingWithMetrics(limit = 5) {
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (station_code, transporter_id)
        station_code, transporter_id, speeding_event_rate, dcr, swc_pod, created_at
      FROM dsp_driver_weekly_metrics
      ORDER BY station_code, transporter_id, created_at DESC
    )
    SELECT station_code, transporter_id, speeding_event_rate, dcr, swc_pod
    FROM latest
    WHERE speeding_event_rate IS NOT NULL
    ORDER BY speeding_event_rate DESC NULLS LAST
    LIMIT $1;
  `;
  const { rows } = await pool.query(sql, [limit]);
  return rows || [];
}

async function getExecutiveStationSnapshot() {
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (station_code, transporter_id)
        station_code, transporter_id, dcr, swc_pod, cdf_dpmo, created_at
      FROM dsp_driver_weekly_metrics
      ORDER BY station_code, transporter_id, created_at DESC
    )
    SELECT station_code,
           COUNT(DISTINCT transporter_id) AS drivers,
           AVG(dcr) AS avg_dcr,
           AVG(swc_pod) AS avg_swc_pod,
           AVG(cdf_dpmo) AS avg_cdf_dpmo
    FROM latest
    GROUP BY station_code
    ORDER BY station_code;
  `;
  const { rows } = await pool.query(sql);
  return rows || [];
}

function asMarkdownTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${body}`;
}

// API: RAG and actions (as before)
app.post('/rag/query', async (req, res) => {
  try {
    const { query, topK = 8, station = 'ALL', week = '2025-29' } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });

    const qLower = String(query).toLowerCase();
    let dataContextBlocks = [];

    // Lightweight intent detection for DB-backed analytics
    if (qLower.includes('speeding') && (qLower.includes('top') || qLower.includes('highest') || qLower.includes('worst'))) {
      const top = await getTopSpeedingWithMetrics(5);
      if (top.length) {
        const rows = top.map(r => [r.station_code, r.transporter_id, Number(r.speeding_event_rate).toFixed(3), Number(r.dcr).toFixed(3), Number(r.swc_pod).toFixed(3)]);
        const md = [
          '### Data: Top 5 by Speeding Event Rate (latest per driver)',
          asMarkdownTable(['Station', 'Driver (Transporter ID)', 'Speeding rate', 'DCR', 'SWC-POD'], rows)
        ].join('\n');
        dataContextBlocks.push(md);
      }
    }
    if (qLower.includes('executive') && qLower.includes('snapshot') && qLower.includes('station')) {
      const snap = await getExecutiveStationSnapshot();
      if (snap.length) {
        const rows = snap.map(r => [r.station_code, String(r.drivers), Number(r.avg_dcr).toFixed(3), Number(r.avg_swc_pod).toFixed(3), Number(r.avg_cdf_dpmo).toFixed(3)]);
        const md = [
          '### Data: Executive Station Snapshot (latest per driver)',
          asMarkdownTable(['Station', 'Drivers', 'Avg DCR', 'Avg SWC-POD', 'Avg CDF DPMO'], rows)
        ].join('\n');
        dataContextBlocks.push(md);
      }
    }

    // Use 768-compatible embeddings for current index; adapt if different
    const embed = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: query });
    let vector = embed.data[0].embedding;
    if (vector.length !== pcTargetDim) vector = downProject(vector, pcTargetDim);

    const filter = {};
    if (station && station !== 'ALL') filter.station = station;
    if (week) filter.week = week;
    const idx = pinecone.index(pcIndexName);
    const results = await idx.query({ vector, topK, includeMetadata: true, filter });
    const ragBlocks = (results.matches || []).map((m) => `Source:${m.id} Score:${m.score}\n${m.metadata?.text || ''}`).slice(0, topK);

    const allContexts = [...dataContextBlocks, ...ragBlocks];
    const system = `You are a DSP ops analyst. Answer precisely using the provided context. If insufficient, say what is missing. Provide numeric summaries and call out WHC, CDF, DCR, SWC-POD, safety signals when relevant.`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini', temperature: 0.2, max_tokens: 1200,
      messages: [ { role: 'system', content: system }, { role: 'user', content: `Context:\n${allContexts.join('\n\n')}\n\nQuestion: ${query}` } ]
    });
    res.json({ answer: completion.choices?.[0]?.message?.content || '', contexts: allContexts });
  } catch (err) { console.error(err); res.status(500).json({ error: 'rag_error', detail: String(err) }); }
});

// =========================
// Compliance & HOS 60/7 API
// =========================

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function detectWeekLabel(records) {
  for (const row of records.slice(0, 3)) {
    const first = row[0] || '';
    const m = /Week\s+(\d{1,2})/i.exec(first);
    if (m) return `Week ${m[1]}`;
  }
  return undefined;
}

function findHeaderIndex(records) {
  for (let i = 0; i < Math.min(records.length, 20); i++) {
    const row = records[i].map((c) => String(c || '').trim());
    if (row[0] === 'Employee' && row.includes('Total Days')) return i;
  }
  return -1;
}

function parseDayHeaders(headerRow) {
  // Return index -> { label, isDay }
  const map = {};
  headerRow.forEach((h, idx) => {
    const s = String(h || '').trim();
    if (/^[A-Z][a-z]{2}\s*,/.test(s) || /\d{4}/.test(s)) {
      map[idx] = { label: s, isDay: true };
    }
  });
  return map;
}

function deriveSegmentsFromCell(cell, serviceDate, tz) {
  const text = String(cell || '').trim();
  const segments = [];
  if (!text || text === '0') return segments;
  // Simple 10hr patterns or labels → create scheduled block noon-centered if no times
  const hoursMatch = /(\d{1,2}(?:\.\d{1,2})?)/.exec(text);
  let start = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: 8, minute: 0 });
  let end = start.plus({ hours: 10 });
  if (hoursMatch) {
    const hrs = Number(hoursMatch[1]);
    end = start.plus({ hours: isFinite(hrs) ? hrs : 10 });
  }
  segments.push({ duty_type: 'scheduled', start, end, confidence: 0.7 });
  // Pre/Post buffers
  segments.push({ duty_type: 'pretrip', start: start.minus({ minutes: 30 }), end: start, confidence: 0.9 });
  segments.push({ duty_type: 'posttrip', start: end, end: end.plus({ minutes: 15 }), confidence: 0.9 });
  return segments;
}

async function upsertDriver(client, fullName, externalId) {
  const id = fullName.replace(/\s+/g, '_').toUpperCase().slice(0, 50);
  await client.query(
    `INSERT INTO drivers (driver_id, driver_name, driver_status, employment_status, created_at, updated_at)
     VALUES ($1,$2,'active','active', NOW(), NOW())
     ON CONFLICT (driver_id) DO UPDATE SET driver_name=EXCLUDED.driver_name, updated_at=NOW()`,
    [id, fullName]
  );
  if (externalId) {
    await client.query(`UPDATE drivers SET external_employee_id=$1 WHERE driver_id=$2`, [externalId, id]);
  }
  return id;
}

// POST /api/compliance/uploads  (multipart CSV)
app.post('/api/compliance/uploads', upload.array('files'), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'no_files' });
  const results = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const f of files) {
      const digest = sha256(f.buffer);
      const { rows: exists } = await client.query('SELECT id FROM uploads WHERE sha256_digest=$1', [digest]);
      if (exists.length) {
        results.push({ filename: f.originalname, upload_id: exists[0].id, status: 'duplicate' });
        continue;
      }
      const records = csvParse(f.buffer.toString('utf8'), { relaxColumnCount: true });
      const headerIdx = findHeaderIndex(records);
      if (headerIdx < 0) {
        results.push({ filename: f.originalname, error: 'header_not_found' });
        continue;
      }
      const header = records[headerIdx];
      const dayCols = parseDayHeaders(header);
      const weekLabel = detectWeekLabel(records);
      const { rows: ins } = await client.query(
        `INSERT INTO uploads (filename, sha256_digest, source, week_label) VALUES ($1,$2,'timecard_csv',$3) RETURNING id`,
        [f.originalname, digest, weekLabel || null]
      );
      const uploadId = ins[0].id;
      let ingestedRows = 0; let segs = 0;
      for (let r = headerIdx + 1; r < records.length; r++) {
        const row = records[r];
        if (!row || !row.length) continue;
        const employee = String(row[0] || '').trim();
        if (!employee || employee === 'Totaled Scheduled') break;
        const transporter = String(row[1] || '').trim() || null;
        const driverId = await upsertDriver(client, employee, transporter);
        for (const [idx, meta] of Object.entries(dayCols)) {
          if (!meta.isDay) continue;
          const cell = row[Number(idx)];
          const serviceDate = DateTime.fromFormat(String(header[Number(idx)]).replace(/"/g, ''), 'MMM dd, yyyy', { zone: 'America/Los_Angeles' });
          if (!serviceDate.isValid) continue;
          const segCandidates = deriveSegmentsFromCell(cell, serviceDate.toISODate(), 'America/Los_Angeles');
          for (const s of segCandidates) {
            const startUtc = s.start.toUTC();
            const endUtc = s.end.toUTC();
            await client.query(
              `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [driverId, uploadId, s.duty_type, startUtc.toISO(), endUtc.toISO(), JSON.stringify({ row: r, col: Number(idx) }), s.confidence]
            );
            segs++;
          }
        }
        ingestedRows++;
      }
      results.push({ filename: f.originalname, upload_id: uploadId, rows: ingestedRows, segments: segs, status: 'ok' });
    }
    await client.query('COMMIT');
    res.json({ results });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'ingestion_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart.valueOf(), bStart.valueOf());
  const end = Math.min(aEnd.valueOf(), bEnd.valueOf());
  return Math.max(0, Math.floor((end - start) / 60000));
}

function parseTsUTC(ts) {
  if (!ts) return DateTime.invalid('empty');
  if (ts instanceof Date) return DateTime.fromJSDate(ts, { zone: 'utc' });
  const s = String(ts);
  let dt = DateTime.fromISO(s, { zone: 'utc' });
  if (!dt.isValid) dt = DateTime.fromSQL(s, { zone: 'utc' });
  return dt;
}

async function hoursUsedAt(client, driverId, nowUtc) {
  const windowStart = nowUtc.minus({ hours: 168 });
  const { rows } = await client.query(
    `SELECT start_utc, end_utc FROM on_duty_segments WHERE driver_id=$1 AND end_utc > $2 AND start_utc < $3 ORDER BY start_utc`,
    [driverId, windowStart.toISO(), nowUtc.toISO()]
  );
  let minutes = 0;
  for (const row of rows) {
    const s = parseTsUTC(row.start_utc);
    const e = parseTsUTC(row.end_utc);
    minutes += overlapMinutes(s, e, windowStart, nowUtc);
  }
  // Second-job minutes
  const att = await client.query(
    `SELECT COALESCE(MAX(other_employer_minutes_last7d),0) AS m FROM driver_attestations WHERE driver_id=$1 AND effective_utc <= $2`,
    [driverId, nowUtc.toISO()]
  );
  minutes += Number(att.rows[0]?.m || 0);
  return minutes / 60.0;
}

// GET /api/compliance/hos/:driverId/now
app.get('/api/compliance/hos/:driverId/now', async (req, res) => {
  const driverId = req.params.driverId;
  const limitHours = 60; // TODO: station/org toggle to 70
  const client = await pool.connect();
  try {
    const now = DateTime.utc();
    const used = await hoursUsedAt(client, driverId, now);
    const available = Math.max(0, limitHours - used);
    res.json({ driverId, as_of_utc: now.toISO(), hours_used: Number(used.toFixed(2)), hours_available: Number(available.toFixed(2)), limit: limitHours, projected_violation_at_utc: null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'hos_failed' }); }
  finally { client.release(); }
});

// POST /api/compliance/dispatch/check
app.post('/api/compliance/dispatch/check', async (req, res) => {
  const { driverId, plannedMinutes = 0, startUtc, endUtc } = req.body || {};
  if (!driverId || !startUtc || !endUtc) return res.status(400).json({ error: 'missing_params' });
  const client = await pool.connect();
  try {
    const start = DateTime.fromISO(startUtc, { zone: 'utc' });
    const end = DateTime.fromISO(endUtc, { zone: 'utc' });
    const used = await hoursUsedAt(client, driverId, start);
    const limit = 60;
    const availableAtStart = Math.max(0, limit - used);
    if (plannedMinutes > availableAtStart * 60) {
      return res.json({ allowed: false, reason: 'planned_exceeds_available', hoursAvailableAtStart: Number(availableAtStart.toFixed(2)) });
    }
    // Simple projection: assume constant on-duty usage
    return res.json({ allowed: true, hoursAvailableAtStart: Number(availableAtStart.toFixed(2)), projectedViolationAtUtc: null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'dispatch_check_failed' }); }
  finally { client.release(); }
});

// GET /api/compliance/staffing/rollup
app.get('/api/compliance/staffing/rollup', async (req, res) => {
  const { from, to, mode = 'dsp' } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'missing_range' });
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT service_date, routes_assigned, routes_staffed_dsp_only, routes_staffed_inclusive FROM routes_day WHERE service_date BETWEEN $1 AND $2 ORDER BY service_date`,
      [from, to]
    );
    const daily = [];
    let assigned7 = 0, staffed7 = 0;
    for (const r of rows) {
      const assigned = Number(r.routes_assigned || 0);
      const staffed = mode === 'inclusive' ? Number(r.routes_staffed_inclusive || 0) : Number(r.routes_staffed_dsp_only || 0);
      daily.push({ service_date: r.service_date, pass: staffed >= assigned, assigned, staffed });
      assigned7 += assigned; staffed7 += staffed;
    }
    const ratio = assigned7 > 0 ? staffed7 / assigned7 : 1;
    const window_pass = daily.every(d => d.pass) && ratio >= 1.0;
    res.json({ daily, ratio: Number(ratio.toFixed(3)), window_pass });
  } catch (e) { console.error(e); res.status(500).json({ error: 'staffing_rollup_failed' }); }
  finally { client.release(); }
});

// GET /api/compliance/alerts
app.get('/api/compliance/alerts', async (_req, res) => {
  // Minimal implementation: drivers with < 3 hours available now + staffing shortfalls today
  const client = await pool.connect();
  try {
    const now = DateTime.utc();
    const { rows: drivers } = await client.query(`SELECT DISTINCT driver_id FROM on_duty_segments`);
    const hose = [];
    for (const d of drivers) {
      const used = await hoursUsedAt(client, d.driver_id, now);
      const available = 60 - used;
      if (available < 3) hose.push({ type: 'HOS', severity: 'high', driver_id: d.driver_id, rationale: `Only ${available.toFixed(2)} hours available`, earliest_breach_utc: null, recommended_action: 'Reassign or shorten route' });
    }
    const today = now.toISODate();
    const { rows: staff } = await client.query(`SELECT service_date, routes_assigned, routes_staffed_dsp_only FROM routes_day WHERE service_date=$1`, [today]);
    const staffing = [];
    for (const s of staff) {
      if (Number(s.routes_staffed_dsp_only || 0) < Number(s.routes_assigned || 0)) {
        staffing.push({ type: 'STAFFING', severity: 'high', service_date: s.service_date, rationale: 'Routes staffed below assigned', earliest_breach_utc: DateTime.fromISO(`${s.service_date}T12:00:00Z`).toISO(), recommended_action: 'Add drivers or reduce assigned' });
      }
    }
    res.json({ alerts: [...hose, ...staffing] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'alerts_failed' }); }
  finally { client.release(); }
});

// POST /api/compliance/driver-attestation
app.post('/api/compliance/driver-attestation', async (req, res) => {
  const { driverId, otherEmployerMinutesLast7d, effectiveUtc } = req.body || {};
  if (!driverId || otherEmployerMinutesLast7d == null || !effectiveUtc) return res.status(400).json({ error: 'missing_params' });
  try {
    await pool.query(`INSERT INTO driver_attestations (driver_id, other_employer_minutes_last7d, effective_utc) VALUES ($1,$2,$3)`, [driverId, Number(otherEmployerMinutesLast7d), effectiveUtc]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'attestation_failed' }); }
});

// Simple seed endpoint to load example CSVs from repo when running locally
app.post('/api/compliance/seed-examples', async (_req, res) => {
  try {
    const fs = await import('fs/promises');
    const p1 = await fs.readFile(process.cwd() + '/example1.csv');
    const p2 = await fs.readFile(process.cwd() + '/example2.csv');
    const makeFile = (name, buffer) => ({ fieldname: 'files', originalname: name, buffer });
    const reqLike = { files: [makeFile('example1.csv', p1), makeFile('example2.csv', p2)] };
    // Reuse our ingestion logic by calling the handler functionally would require refactor;
    // for brevity, parse again here
    const client = await pool.connect();
    await client.query('BEGIN');
    for (const f of reqLike.files) {
      const digest = sha256(f.buffer);
      const { rows: exists } = await client.query('SELECT id FROM uploads WHERE sha256_digest=$1', [digest]);
      if (exists.length) continue;
      const records = csvParse(f.buffer.toString('utf8'), { relaxColumnCount: true });
      const headerIdx = findHeaderIndex(records);
      if (headerIdx < 0) continue;
      const header = records[headerIdx];
      const dayCols = parseDayHeaders(header);
      const weekLabel = detectWeekLabel(records);
      const { rows: ins } = await client.query(
        `INSERT INTO uploads (filename, sha256_digest, source, week_label) VALUES ($1,$2,'timecard_csv',$3) RETURNING id`,
        [f.originalname, digest, weekLabel || null]
      );
      const uploadId = ins[0].id;
      for (let r = headerIdx + 1; r < records.length; r++) {
        const row = records[r];
        const employee = String(row[0] || '').trim();
        if (!employee || employee === 'Totaled Scheduled') break;
        const transporter = String(row[1] || '').trim() || null;
        const driverId = await upsertDriver(client, employee, transporter);
        for (const [idx, meta] of Object.entries(dayCols)) {
          if (!meta.isDay) continue;
          const cell = row[Number(idx)];
          const serviceDate = DateTime.fromFormat(String(header[Number(idx)]).replace(/"/g, ''), 'MMM dd, yyyy', { zone: 'America/Los_Angeles' });
          if (!serviceDate.isValid) continue;
          const segCandidates = deriveSegmentsFromCell(cell, serviceDate.toISODate(), 'America/Los_Angeles');
          for (const s of segCandidates) {
            const startUtc = s.start.toUTC();
            const endUtc = s.end.toUTC();
            await client.query(
              `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [driverId, uploadId, s.duty_type, startUtc.toISO(), endUtc.toISO(), JSON.stringify({ row: r, col: Number(idx) }), s.confidence]
            );
          }
        }
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'seed_failed' });
  }
});

// Background jobs: simplistic schedules
cron.schedule('0 2 * * *', async () => {
  console.log('[cron] nightly recompute placeholder');
});

// GET /api/compliance/query?q=...
app.get('/api/compliance/query', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing_q' });
  const client = await pool.connect();
  try {
    const now = DateTime.utc();
    const lower = q.toLowerCase();
    // 1) drivers near_limit within=72h
    if (lower.includes('near_limit')) {
      const withinMatch = /within=(\d+)h/.exec(lower);
      const withinH = withinMatch ? Number(withinMatch[1]) : 72;
      const at = now.plus({ hours: withinH });
      const { rows: drivers } = await client.query(`SELECT DISTINCT driver_id FROM on_duty_segments`);
      const list = [];
      for (const d of drivers) {
        const used = await hoursUsedAt(client, d.driver_id, at);
        if (used >= 60 - 0.01) list.push({ driver_id: d.driver_id, projected_hours: Number(used.toFixed(2)) });
      }
      return res.json({ type: 'near_limit', within_hours: withinH, drivers: list.sort((a,b)=>b.projected_hours-a.projected_hours) });
    }
    // 2) drivers with < 3 hours available today
    if (lower.includes('with < 3 hours available') || lower.includes('with <3 hours available')) {
      const { rows: drivers } = await client.query(`SELECT DISTINCT driver_id FROM on_duty_segments`);
      const list = [];
      for (const d of drivers) {
        const used = await hoursUsedAt(client, d.driver_id, now);
        const avail = 60 - used;
        if (avail < 3) list.push({ driver_id: d.driver_id, hours_available: Number(avail.toFixed(2)) });
      }
      return res.json({ type: 'low_available', threshold_hours: 3, drivers: list.sort((a,b)=>a.hours_available-b.hours_available) });
    }
    // 3) staffing failures mode=dsp range=YYYY-MM-DD..YYYY-MM-DD
    if (lower.includes('staffing') && lower.includes('fail')) {
      const mode = /mode=(inclusive|dsp)/.exec(lower)?.[1] || 'dsp';
      const rangeMatch = /range=(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/.exec(lower);
      let from = DateTime.utc().minus({ days: 6 }).toISODate();
      let to = DateTime.utc().toISODate();
      if (rangeMatch) { from = rangeMatch[1]; to = rangeMatch[2]; }
      const { rows } = await client.query(
        `SELECT service_date, routes_assigned, routes_staffed_dsp_only, routes_staffed_inclusive FROM routes_day WHERE service_date BETWEEN $1 AND $2 ORDER BY service_date`,
        [from, to]
      );
      const fails = rows.filter(r => (mode === 'inclusive' ? (Number(r.routes_staffed_inclusive||0) < Number(r.routes_assigned||0)) : (Number(r.routes_staffed_dsp_only||0) < Number(r.routes_assigned||0))));
      return res.json({ type: 'staffing_failures', mode, from, to, days: fails.map(f => ({ service_date: f.service_date, assigned: f.routes_assigned, staffed: mode==='inclusive'?f.routes_staffed_inclusive:f.routes_staffed_dsp_only })) });
    }
    // 4) next roll-off for Driver X
    if (lower.includes('next roll-off for') || lower.includes('next rolloff for')) {
      const name = q.split(/next roll-?off for/i)[1]?.trim() || '';
      let driverId = null;
      if (name) {
        const found = await client.query(`SELECT driver_id FROM drivers WHERE driver_name ILIKE $1 LIMIT 1`, [name]);
        if (found.rows.length) driverId = found.rows[0].driver_id;
      }
      if (!driverId) return res.json({ type: 'next_rolloff', error: 'driver_not_found' });
      const windowStart = now.minus({ hours: 168 }).toISO();
      const { rows } = await client.query(`SELECT start_utc FROM on_duty_segments WHERE driver_id=$1 AND end_utc > $2 AND start_utc < $3 ORDER BY start_utc ASC LIMIT 1`, [driverId, windowStart, now.toISO()]);
      if (!rows.length) return res.json({ type: 'next_rolloff', driver_id: driverId, next_rolloff_at_utc: null });
      const firstStart = DateTime.fromISO(rows[0].start_utc, { zone: 'utc' });
      const eta = firstStart.plus({ hours: 168 });
      return res.json({ type: 'next_rolloff', driver_id: driverId, next_rolloff_at_utc: eta.toISO() });
    }
    // 5) coverage ratio 7 for station A this week
    if (lower.includes('coverageratio7') || (lower.includes('coverage') && lower.includes('ratio'))) {
      const { rows } = await client.query(`SELECT service_date, routes_assigned, routes_staffed_dsp_only FROM routes_day ORDER BY service_date DESC LIMIT 7`);
      let assigned = 0, staffed = 0; const days = [];
      for (const r of rows) {
        const a = Number(r.routes_assigned || 0); const s = Number(r.routes_staffed_dsp_only || 0);
        assigned += a; staffed += s; days.push({ service_date: r.service_date, assigned: a, staffed: s, pass: s >= a });
      }
      const ratio = assigned > 0 ? staffed / assigned : 1;
      const pass = days.every(d=>d.pass) && ratio >= 1;
      return res.json({ type: 'coverage_ratio_7', ratio: Number(ratio.toFixed(3)), pass, days });
    }
    return res.json({ note: 'unrecognized_query' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'query_failed', detail: String(e) }); }
  finally { client.release(); }
});

// ===== HOS 60/7: Import Timecard Report (Position ID based) =====
app.post('/api/hos/import-timecards', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file_required' });
    const buffer = file.buffer;
    let records;
    try {
      records = csvParse(buffer.toString('utf8'), {
        relaxColumnCount: true,
        relaxQuotes: true,
        skipEmptyLines: true,
        bom: true,
        trim: true
      });
    } catch (err) {
      // Fallback: aggressively relax quotes handling
      records = csvParse(buffer.toString('utf8'), {
        relaxColumnCount: true,
        relaxQuotes: true,
        skipEmptyLines: true,
        bom: true,
        trim: true,
        quote: '\u0000' // effectively disable quote processing
      });
    }
    if (!records || !records.length) return res.status(400).json({ error: 'empty_file' });
    const header = records[0].map((h) => String(h || '').replace(/"/g, '').trim());
    const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const iLast = idx('Last Name');
    const iFirst = idx('First Name');
    const iPos = idx('Position ID');
    const iIn = idx('In time');
    const iOut = idx('Out time');
    const iOutType = idx('Out Punch Type');
    if ([iLast,iFirst,iPos,iIn,iOut].some(x => x < 0)) return res.status(400).json({ error: 'missing_columns' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Create uploads row for FK and idempotency with SAVEPOINT to avoid aborting tx
      const digest = sha256(buffer);
      let uploadId;
      await client.query('SAVEPOINT sp_upload');
      try {
        const ins = await client.query(`INSERT INTO uploads (filename, sha256_digest, source, week_label) VALUES ($1,$2,'timecard_csv',NULL) RETURNING id`, [file.originalname || 'Timecard Report.csv', digest]);
        uploadId = ins.rows[0].id;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_upload');
        const sel = await client.query(`SELECT id FROM uploads WHERE sha256_digest=$1`, [digest]);
        uploadId = sel.rows[0]?.id;
      }
      let rowsIngested = 0; let segs = 0; let skipped = 0;
      for (let li = 1; li < records.length; li++) {
        const row = records[li];
        if (!row || !row.length) continue;
        const posId = String(row[iPos] || '').trim();
        const fName = String(row[iFirst] || '').trim();
        const lName = String(row[iLast] || '').trim();
        const inStr = String(row[iIn] || '').trim();
        const outStr = String(row[iOut] || '').trim();
        const outType = iOutType >= 0 ? String(row[iOutType] || '').trim() : '';
        if (outType.toUpperCase() === 'PTO') { skipped++; continue; }
        if (!posId || !inStr || !outStr) { skipped++; continue; }
        // Skip rows where In time and Out time are identical (no duration)
        if (inStr === outStr) { skipped++; continue; }
        const driverId = posId;
        const fullName = `${fName} ${lName}`.trim();
        await client.query('SAVEPOINT sp_row');
        try {
          await client.query(
            `INSERT INTO drivers (driver_id, driver_name, driver_status, employment_status, created_at, updated_at)
             VALUES ($1,$2,'active','active', NOW(), NOW())
             ON CONFLICT (driver_id) DO UPDATE SET driver_name=EXCLUDED.driver_name, updated_at=NOW()`,
            [driverId, fullName || driverId]
          );
        const tz = 'America/Los_Angeles';
        const tryFormats = [
          'M/d/yyyy H:mm','M/d/yyyy h:mm','MM/dd/yyyy HH:mm','MM/dd/yyyy hh:mm',
          'M/d/yyyy hh:mm a','MM/dd/yyyy hh:mm a','M/d/yyyy hh:mm:ss a','MM/dd/yyyy hh:mm:ss a'
        ];
        let start = DateTime.invalid('init');
        for (const fmt of tryFormats) { start = DateTime.fromFormat(inStr, fmt, { zone: tz }); if (start.isValid) break; }
        let end = DateTime.invalid('init');
        for (const fmt of tryFormats) { end = DateTime.fromFormat(outStr, fmt, { zone: tz }); if (end.isValid) break; }
        if (!start.isValid || !end.isValid) { await client.query('ROLLBACK TO SAVEPOINT sp_row'); skipped++; continue; }
        if (start.equals(end)) { await client.query('ROLLBACK TO SAVEPOINT sp_row'); skipped++; continue; }
        const startUtc = start.toUTC();
        const endAdj = end <= start ? end.plus({ days: 1 }) : end;
        const endUtc = endAdj.toUTC();
          await client.query(
            `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
             VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
            [driverId, uploadId, startUtc.toISO(), endUtc.toISO(), JSON.stringify({ src: 'timecard_report', line: li })]
          );
        // If this row indicates an LP (lunch punch marker) in column I (Out Punch Type == 'LP'),
        // create a break segment from this row's end to the next row's start for the same employee
        if (iOutType >= 0 && String(row[iOutType] || '').trim().toUpperCase() === 'LP') {
          // find next row for same Position ID
          for (let j = li + 1; j < records.length; j++) {
            const next = records[j];
            if (!next || !next.length) continue;
            const nextPos = String(next[iPos] || '').trim();
            const nextIn = String(next[iIn] || '').trim();
            if (nextPos !== posId) continue;
            // parse nextIn
            let nextStart = DateTime.invalid('init');
            for (const fmt of tryFormats) { nextStart = DateTime.fromFormat(nextIn, fmt, { zone: tz }); if (nextStart.isValid) break; }
            if (!nextStart.isValid) break;
            const lunchStartUtc = endUtc; // end of current worked row
            const lunchEndUtc = nextStart.toUTC();
            if (lunchEndUtc > lunchStartUtc) {
              await client.query(
                `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
                 VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
                [driverId, uploadId, lunchStartUtc.toISO(), lunchEndUtc.toISO(), JSON.stringify({ from_line: li, to_line: j })]
              );
            }
            break;
          }
        }
        // Always check for lunch breaks: infer lunch when a gap of less than 60 minutes exists to the next row for this driver
        // This runs regardless of LP designation
        for (let j = li + 1; j < records.length; j++) {
          const next = records[j];
          if (!next || !next.length) continue;
          const nextPos = String(next[iPos] || '').trim();
          const nextIn = String(next[iIn] || '').trim();
          if (nextPos !== posId) continue;
          let nextStart = DateTime.invalid('init');
          for (const fmt of tryFormats) { nextStart = DateTime.fromFormat(nextIn, fmt, { zone: tz }); if (nextStart.isValid) break; }
          if (!nextStart.isValid) break;
          // Only if within the same local calendar day
          if (!nextStart.hasSame(endAdj, 'day')) break;
          const gapMin = Math.floor(nextStart.diff(endAdj, 'minutes').minutes);
          // If gap is less than 60 minutes, treat as lunch break
          if (gapMin > 0 && gapMin < 60) {
            const infStartUtc = endUtc;
            const infEndUtc = nextStart.toUTC();
            if (infEndUtc > infStartUtc) {
              // Check if we already created a break segment for LP designation
              const existingBreak = await client.query(
                `SELECT 1 FROM break_segments 
                 WHERE driver_id = $1 AND start_utc = $2 AND end_utc = $3 
                 LIMIT 1`,
                [driverId, infStartUtc.toISO(), infEndUtc.toISO()]
              );
              
              if (existingBreak.rows.length === 0) {
                await client.query(
                  `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
                   VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
                  [driverId, uploadId, infStartUtc.toISO(), infEndUtc.toISO(), JSON.stringify({ inferred: true, reason: 'gap_less_than_60min', from_line: li, to_line: j, gap_minutes: gapMin })]
                );
              }
            }
          }
          break;
        }
          segs++; rowsIngested++;
        } catch (rowErr) {
          await client.query('ROLLBACK TO SAVEPOINT sp_row');
          skipped++;
        }
      }
      await client.query('COMMIT');
      res.json({ ok: true, rows: rowsIngested, segments: segs, skipped, upload_id: uploadId });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'import_timecards_failed', detail: String(e) });
  }
});

// HOS rolling 7-day grid endpoint
app.get('/api/hos/grid', async (req, res) => {
  const endDate = req.query.end || DateTime.now().toISODate();
  const end = DateTime.fromISO(String(endDate), { zone: 'utc' }).endOf('day');
  const endLocal = DateTime.fromISO(String(endDate), { zone: 'America/Los_Angeles' }).endOf('day');
  const viewDays = Math.max(7, Math.min(42, Number.parseInt(String(req.query.days || '7')) || 7));
  const start = end.minus({ days: viewDays - 1 }).startOf('day');
  const client = await pool.connect();
  try {
    // Build day labels and dates in America/Los_Angeles to align with the grid
    const days = Array.from({ length: 7 }).map((_, i) => {
      const dayLocal = endLocal.minus({ days: 6 - i });
      const label = i === 0 ? 'D-6' : i === 6 ? 'D' : `D-${6 - i}`;
      return { label, iso: dayLocal.toISODate(), mmdd: dayLocal.toFormat('MM/dd') };
    });
    // Adjust for variable viewDays
    if (viewDays !== 7) {
      const computed = Array.from({ length: viewDays }).map((_, i) => {
        const dayLocal = endLocal.minus({ days: (viewDays - 1) - i });
        const label = i === viewDays - 1 ? 'D' : `D-${(viewDays - 1) - i}`;
        return { label, iso: dayLocal.toISODate(), mmdd: dayLocal.toFormat('MM/dd') };
      });
      days.splice(0, days.length, ...computed);
    }
    // load distinct drivers that have segments in window OR schedule predictions
    const actualDataEnd = end.minus({ days: 1 }).endOf('day');
    const { rows: drivers } = await client.query(
      `SELECT DISTINCT d.driver_id, d.driver_name
         FROM drivers d
         WHERE EXISTS (
           SELECT 1 FROM on_duty_segments s 
           WHERE s.driver_id = d.driver_id 
           AND s.end_utc > $1 AND s.start_utc < $2
         ) OR EXISTS (
           SELECT 1 FROM schedule_predictions sp
           WHERE sp.driver_id = d.driver_id
           AND sp.schedule_date >= $3::date AND sp.schedule_date <= $4::date
         )`,
      [start.toISO(), actualDataEnd.toISO(), start.toISODate(), end.toISODate()]
    );
    const out = [];
    for (const d of drivers) {
      // Use actualDataEnd from above for actual work data queries
      const wstart = actualDataEnd.minus({ hours: 168 }).toISO();
      const wend = actualDataEnd.toISO();
      // Compute merged (union) intervals inside window, then daily hours and used hours without double counting
      const dailyRes = await client.query(
        `WITH w AS (
            SELECT $1::timestamptz AS wstart, $2::timestamptz AS wend
          ),
          days_local AS (
            SELECT generate_series(
                     date_trunc('day', timezone('America/Los_Angeles', (SELECT wend FROM w))) - interval '${viewDays - 1} days',
                     date_trunc('day', timezone('America/Los_Angeles', (SELECT wend FROM w))),
                     interval '1 day') AS day_local
          ),
          bounds AS (
            SELECT day_local,
                   timezone('UTC', timezone('America/Los_Angeles', day_local::timestamp)) AS day_start_utc,
                   timezone('UTC', timezone('America/Los_Angeles', (day_local + interval '1 day')::timestamp)) AS day_end_utc
              FROM days_local
          )
          SELECT to_char(day_start_utc, 'YYYY-MM-DD') AS day,
                 COALESCE(SUM(CASE WHEN s.start_utc IS NULL OR s.end_utc IS NULL THEN 0
                                   ELSE EXTRACT(EPOCH FROM (LEAST(s.end_utc, b.day_end_utc) - GREATEST(s.start_utc, b.day_start_utc)))/3600.0 END), 0) AS hours
            FROM bounds b
            LEFT JOIN on_duty_segments s ON s.driver_id=$3 AND s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc
           GROUP BY day, b.day_start_utc
           ORDER BY b.day_start_utc;`,
        [wstart, wend, d.driver_id]
      );
      const lunchTotalRes = await client.query(
        `WITH w AS (SELECT $1::timestamptz AS wstart, $2::timestamptz AS wend)
         SELECT COALESCE(SUM(
                  CASE WHEN b.start_utc IS NULL OR b.end_utc IS NULL THEN 0
                       ELSE EXTRACT(EPOCH FROM (LEAST(b.end_utc, w.wend) - GREATEST(b.start_utc, w.wstart)))/60.0 END
                ),0) AS minutes
           FROM break_segments b, w
          WHERE b.driver_id=$3 AND b.end_utc > w.wstart AND b.start_utc < w.wend;`,
        [wstart, wend, d.driver_id]
      );
      const usedRes = await client.query(
        `WITH w AS (SELECT $1::timestamptz AS wstart, $2::timestamptz AS wend),
         segs AS (
           SELECT GREATEST(start_utc, w.wstart) AS s, LEAST(end_utc, w.wend) AS e
             FROM on_duty_segments, w
            WHERE driver_id=$3 AND end_utc > w.wstart AND start_utc < w.wend AND LEAST(end_utc, w.wend) > GREATEST(start_utc, w.wstart)
         ),
         ord AS (
           SELECT s, e, CASE WHEN s > LAG(e) OVER (ORDER BY s) THEN 1 ELSE 0 END AS brk
             FROM segs
         ),
         grp AS (
           SELECT s, e, SUM(brk) OVER (ORDER BY s ROWS UNBOUNDED PRECEDING) AS g
             FROM ord
         ),
         merged AS (
           SELECT MIN(s) AS s, MAX(e) AS e FROM grp GROUP BY g
         )
         SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e - s))/3600.0), 0) AS hours_used FROM merged;`,
        [wstart, wend, d.driver_id]
      );
      const day_hours = dailyRes.rows.map(r => Number(Number(r.hours).toFixed(2)));
      const lunch_total_minutes = Number(Number(lunchTotalRes.rows?.[0]?.minutes || 0).toFixed(0));
      const hours_used_base = Number(Number(usedRes.rows?.[0]?.hours_used || 0).toFixed(2));
      
      // Get schedule predictions for the grid date range
      const scheduleRes = await client.query(
        `SELECT schedule_date, schedule_content, predicted_hours
         FROM schedule_predictions
         WHERE driver_id = $1 
         AND schedule_date >= $2::date - INTERVAL '7 days'
         AND schedule_date <= $2::date + INTERVAL '7 days'
         ORDER BY schedule_date`,
        [d.driver_id, end.toISODate()]
      );
      const scheduleMap = new Map();
      scheduleRes.rows.forEach(s => {
        // Ensure consistent date format (YYYY-MM-DD)
        const scheduleDate = s.schedule_date instanceof Date 
          ? DateTime.fromJSDate(s.schedule_date).toISODate()
          : DateTime.fromISO(s.schedule_date.split('T')[0]).toISODate();
        scheduleMap.set(scheduleDate, {
          content: s.schedule_content,
          hours: Number(s.predicted_hours)
        });
      });
      // Include driver-attested other employer minutes over last 7 days
      const attestRow = await client.query(
        `SELECT other_employer_minutes_last7d
           FROM driver_attestations
          WHERE driver_id=$1 AND effective_utc <= $2
          ORDER BY effective_utc DESC
          LIMIT 1`,
        [d.driver_id, wend]
      );
      const other_minutes = Number(attestRow.rows?.[0]?.other_employer_minutes_last7d || 0);
      const hours_used = Number((hours_used_base + (other_minutes / 60.0)).toFixed(2));
      let hours_available = Number((60 - hours_used).toFixed(2));
      // Policy thresholds (could be pulled from work_hours_policy_profiles)
      const meal_required_by_hour = 6; // require meal by 6th on-duty hour
      const meal_min_minutes = 30;    // 30-min minimum
      const min_rest_hours_between_shifts = 10; // short rest threshold
      const daily_max_hours = 12;     // daily max on-duty threshold
      // Evaluate meal in window (most recent local day): look for any break >= 30m occurring by 6th hour of on-duty
      const mealOkRow = await client.query(
        `WITH day_bounds AS (
           SELECT timezone('UTC', timezone('America/Los_Angeles', date_trunc('day', timezone('America/Los_Angeles', $2::timestamptz))::timestamp)) AS s,
                  timezone('UTC', timezone('America/Los_Angeles', (date_trunc('day', timezone('America/Los_Angeles', $2::timestamptz)) + interval '1 day')::timestamp)) AS e
         ), onday AS (
           SELECT * FROM on_duty_segments, day_bounds db WHERE driver_id=$1 AND end_utc > db.s AND start_utc < db.e
         ), accum AS (
           SELECT SUM(EXTRACT(EPOCH FROM (LEAST(end_utc, db.e) - GREATEST(start_utc, db.s))))/3600.0 AS on_hours
             FROM onday od, day_bounds db
         ), breaks AS (
           SELECT EXTRACT(EPOCH FROM (LEAST(b.end_utc, db.e) - GREATEST(b.start_utc, db.s)))/60.0 AS minutes,
                  (SELECT on_hours FROM accum) AS on_hours
             FROM break_segments b, day_bounds db
            WHERE b.driver_id=$1 AND b.end_utc > db.s AND b.start_utc < db.e
         )
         SELECT COALESCE(MAX(CASE WHEN minutes >= $3 AND on_hours >= $4 THEN 1 ELSE 0 END),0) AS meal_ok FROM breaks;`,
        [d.driver_id, end.toISO(), meal_min_minutes, meal_required_by_hour]
      );
      const meal_ok = Number(mealOkRow.rows?.[0]?.meal_ok || 0) === 1;
      // Short rest: rest between last end on prior day and first start today
      const restRow = await client.query(
        `WITH bounds AS (
           SELECT timezone('UTC', timezone('America/Los_Angeles', date_trunc('day', timezone('America/Los_Angeles', $2::timestamptz))::timestamp)) AS s,
                  timezone('UTC', timezone('America/Los_Angeles', (date_trunc('day', timezone('America/Los_Angeles', $2::timestamptz)) + interval '1 day')::timestamp)) AS e
         ), segs AS (
           SELECT start_utc, end_utc FROM on_duty_segments, bounds b WHERE driver_id=$1 AND end_utc > b.s - interval '1 day' AND start_utc < b.e
         ), prior AS (
           SELECT MAX(end_utc) AS last_end FROM segs, bounds b WHERE end_utc < b.s
         ), today AS (
           SELECT MIN(start_utc) AS first_start FROM segs, bounds b WHERE start_utc >= b.s AND start_utc < b.e
         )
         SELECT EXTRACT(EPOCH FROM (t.first_start - p.last_end))/3600.0 AS rest_hours
           FROM prior p, today t;`,
        [d.driver_id, end.toISO()]
      );
      const rest_hours = Number(restRow.rows?.[0]?.rest_hours || 0);
      // Daily max: sum on-duty hours for the most recent local day
      const dailyRow = await client.query(
        `WITH b AS (
           SELECT timezone('UTC', timezone('America/Los_Angeles', date_trunc('day', timezone('America/Los_Angeles', $2::timestamptz))::timestamp)) AS s,
                  timezone('UTC', timezone('America/Los_Angeles', (date_trunc('day', timezone('America/Los_Angeles', $2::timestamptz)) + interval '1 day')::timestamp)) AS e
         )
         SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(s.end_utc, b.e) - GREATEST(s.start_utc, b.s)))/3600.0),0) AS daily_hours
           FROM on_duty_segments s, b
          WHERE s.driver_id=$1 AND s.end_utc > b.s AND s.start_utc < b.e;`,
        [d.driver_id, end.toISO()]
      );
      const daily_hours = Number(dailyRow.rows?.[0]?.daily_hours || 0);
      // Build window-level status and reasons
      let status = 'OK';
      let detail = '';
      const window_reasons = [];
      if (hours_available < 0) {
        status = 'VIOLATION';
        window_reasons.push({ type: 'HOS_60_7', severity: 'VIOLATION', message: 'Exceeded 60/7 cap', values: { hours_used, hours_available, other_minutes } });
      } else if (hours_available < 2) {
        status = 'AT_RISK';
        window_reasons.push({ type: 'HOS_60_7', severity: 'AT_RISK', message: 'Near 60/7 cap', values: { hours_used, hours_available, other_minutes } });
      }
      // Note: Meal break compliance is checked per-day, not at window level
      // The meal_ok variable only checks the most recent day, so we don't use it for window-level warnings
      if (rest_hours > 0 && rest_hours < min_rest_hours_between_shifts) {
        status = 'VIOLATION';
        window_reasons.push({ type: 'REST', severity: 'VIOLATION', message: `Short rest (${rest_hours.toFixed(2)}h) < ${min_rest_hours_between_shifts}h`, values: { rest_hours }, recommended_action: 'Reassign or delay start to ensure 10h rest' });
      }
      if (daily_hours > daily_max_hours) {
        status = 'VIOLATION';
        window_reasons.push({ type: 'DAILY_MAX', severity: 'VIOLATION', message: `Daily max exceeded (${daily_hours.toFixed(2)}h > ${daily_max_hours}h)`, values: { daily_hours }, recommended_action: 'Early end or split assignment to keep ≤ 12h' });
      }
      // Per-day detailed reasons across the 7-day view
      const perDay = await client.query(
        `WITH w AS (
             SELECT $1::timestamptz AS wstart, $2::timestamptz AS wend
           ),
           days_local AS (
             SELECT generate_series(date_trunc('day', timezone('America/Los_Angeles', (SELECT wend FROM w))) - interval '6 days',
                                     date_trunc('day', timezone('America/Los_Angeles', (SELECT wend FROM w))),
                                     interval '1 day') AS day_local
           ),
           bounds AS (
             SELECT day_local,
                    timezone('UTC', timezone('America/Los_Angeles', day_local::timestamp)) AS day_start_utc,
                    timezone('UTC', timezone('America/Los_Angeles', (day_local + interval '1 day')::timestamp)) AS day_end_utc
               FROM days_local
           ),
           onday AS (
             SELECT b.day_start_utc, b.day_end_utc,
                    COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(s.end_utc, b.day_end_utc) - GREATEST(s.start_utc, b.day_start_utc)))/3600.0),0) AS on_hours,
                    MIN(CASE WHEN s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc THEN GREATEST(s.start_utc, b.day_start_utc) END) AS first_start_utc,
                    MAX(CASE WHEN s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc THEN LEAST(s.end_utc, b.day_end_utc) END) AS last_end_utc
               FROM bounds b
               LEFT JOIN on_duty_segments s ON s.driver_id=$3 AND s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc
              GROUP BY b.day_start_utc, b.day_end_utc
           ),
           brks AS (
             SELECT b.day_start_utc, b.day_end_utc,
                    COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0),0) AS break_minutes,
                    COALESCE(MAX(CASE WHEN EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0 >= $4 THEN 1 ELSE 0 END),0) AS qual_meal_exists,
                    MIN(CASE WHEN EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0 >= $4 THEN br.start_utc END) AS earliest_qual_meal_start,
                    COALESCE(MAX(CASE WHEN (br.source_row_ref ->> 'inferred') = 'true' AND EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0 >= $4 THEN 1 ELSE 0 END),0) AS inferred_meal_exists
               FROM bounds b
               LEFT JOIN break_segments br ON br.driver_id=$3 AND br.end_utc > b.day_start_utc AND br.start_utc < b.day_end_utc
              GROUP BY b.day_start_utc, b.day_end_utc
           ),
           combined AS (
             SELECT b.day_start_utc, b.day_end_utc, od.on_hours, od.first_start_utc, od.last_end_utc,
                    br.break_minutes, br.qual_meal_exists, br.earliest_qual_meal_start, br.inferred_meal_exists
               FROM bounds b
               LEFT JOIN onday od ON od.day_start_utc=b.day_start_utc AND od.day_end_utc=b.day_end_utc
               LEFT JOIN brks br ON br.day_start_utc=b.day_start_utc AND br.day_end_utc=b.day_end_utc
           )
           SELECT to_char(day_start_utc, 'YYYY-MM-DD') AS day,
                  on_hours,
                  first_start_utc,
                  last_end_utc,
                  break_minutes,
                  qual_meal_exists,
                  earliest_qual_meal_start,
                  inferred_meal_exists,
                  EXTRACT(EPOCH FROM (first_start_utc - LAG(last_end_utc) OVER (ORDER BY day_start_utc)))/3600.0 AS rest_before_hours
             FROM combined
            ORDER BY day_start_utc;`,
        [wstart, wend, d.driver_id, meal_min_minutes]
      );
      const dayRows = perDay.rows || [];
      const day_reasons = {};
      // Determine worked vs off strictly from rounded day_hours used in UI
      const workedFlags = day_hours.map(h => Number(h || 0) > 0);
      let consec = 0;
      for (let i = 0; i < dayRows.length; i++) {
        const label = i === 0 ? 'D-6' : i === 6 ? 'D' : `D-${6 - i}`;
        const r = dayRows[i];
        const reasonsForDay = [];
        const onh = Number(day_hours[i] || 0);
        const restBefore = Number(r.rest_before_hours || 0);
        consec = workedFlags[i] ? consec + 1 : 0;
        // Daily max based on the same number shown in the grid
        if (onh > daily_max_hours) {
          reasonsForDay.push({ type: 'DAILY_MAX', severity: 'VIOLATION', message: `Daily max exceeded (${onh.toFixed(2)}h > ${daily_max_hours}h)`, values: { on_hours: onh } });
        }
        // Meal by 6th hour: require qualifying meal before or at first_start + 6h
        if (onh >= meal_required_by_hour) {
          const firstStart = r.first_start_utc ? DateTime.fromISO(String(r.first_start_utc)) : null;
          const earliestQual = r.earliest_qual_meal_start ? DateTime.fromISO(String(r.earliest_qual_meal_start)) : null;
          const qual = Number(r.qual_meal_exists || 0) === 1;
          const inferred = Number(r.inferred_meal_exists || 0) === 1;
          const mealBy6Ok = !!(firstStart && earliestQual && earliestQual <= firstStart.plus({ hours: meal_required_by_hour }));
          
          // Only flag a violation if there's no qualifying meal at all
          if (!qual) {
            // No qualifying meal exists
            reasonsForDay.push({ type: 'MEAL', severity: 'VIOLATION', message: `No ≥${meal_min_minutes}m meal by 6h on-duty`, values: { first_start_utc: r.first_start_utc || null, earliest_meal_utc: r.earliest_qual_meal_start || null } });
          }
          // If a qualifying meal exists (even if taken after 6 hours), they are compliant - no message needed
        }
        // Short rest before day (only matters if there is a worked shift on this day)
        if (workedFlags[i] && restBefore > 0 && restBefore < min_rest_hours_between_shifts) {
          reasonsForDay.push({ type: 'REST', severity: 'VIOLATION', message: `Short rest before shift (${restBefore.toFixed(2)}h < ${min_rest_hours_between_shifts}h)`, values: { rest_before_hours: restBefore } });
        }
        // 5th/6th day exposure
        if (workedFlags[i]) {
          if (consec === 5) {
            reasonsForDay.push({ type: 'CONSECUTIVE_DAYS', severity: 'AT_RISK', message: '5th consecutive work day exposure', values: { consecutive_days: consec } });
          } else if (consec >= 6) {
            reasonsForDay.push({ type: 'CONSECUTIVE_DAYS', severity: 'VIOLATION', message: `${consec}th consecutive work day`, values: { consecutive_days: consec } });
          }
        }
        day_reasons[label] = reasonsForDay;
      }
      // Build schedule data for each day
      const day_schedules = {};
      const projected_hours = [...day_hours]; // Copy actual hours
      
      days.forEach((day, idx) => {
        const schedule = scheduleMap.get(day.iso);
        if (schedule) {
          day_schedules[day.label] = {
            content: schedule.content,
            hours: schedule.hours
          };
          // If this is a future day with no actual hours yet, use predicted hours
          if (projected_hours[idx] === 0) {
            projected_hours[idx] = schedule.hours;
          }
        }
      });
      
      // Calculate projected violations with scheduled hours
      let projected_total = 0;
      let projected_consec = 0;
      const projected_reasons = [];
      
      // Calculate current state
      for (let i = 0; i < 7; i++) {
        if (projected_hours[i] > 0) {
          projected_total += projected_hours[i];
          projected_consec++;
        } else {
          projected_consec = 0;
        }
      }
      
      // Check if future scheduled work will cause issues
      days.forEach((day, idx) => {
        const schedule = scheduleMap.get(day.iso);
        if (schedule && DateTime.fromISO(day.iso) >= DateTime.now().startOf('day')) {
          // This is a future scheduled day
          const projectedDayTotal = projected_total;
          
          // Check 60/7 limit
          if (projectedDayTotal + schedule.hours > 60) {
            projected_reasons.push({
              type: 'PROJECTED_60_7',
              severity: 'AT_RISK',
              message: `Scheduled ${day.mmdd}: ${schedule.content} (${schedule.hours}h) would exceed 60h/7d limit`,
              day: day.label
            });
          }
          
          // Check consecutive days
          if (projected_consec >= 4 && schedule.hours > 0) {
            projected_reasons.push({
              type: 'PROJECTED_CONSECUTIVE',
              severity: 'AT_RISK', 
              message: `Scheduled ${day.mmdd}: Would be ${projected_consec + 1}th consecutive day`,
              day: day.label
            });
          }
        }
      });
      
      // Update status if there are projected risks
      if (projected_reasons.length > 0 && status === 'OK') {
        status = 'AT_RISK';
      }
      
      detail = window_reasons.map(r => r.message).join('; ');
      const total_7d = Number(day_hours.reduce((a,b)=>a + (b||0), 0).toFixed(2));
      out.push({ 
        driver_id: d.driver_id, 
        driver_name: d.driver_name || d.driver_id, 
        day_hours, 
        day_schedules,
        projected_hours,
        projected_reasons,
        lunch_total_minutes, 
        total_7d, 
        hours_used, 
        hours_available, 
        status, 
        detail, 
        reasons: window_reasons, 
        window_reasons, 
        day_reasons 
      });
    }
    out.sort((a,b)=> a.hours_available - b.hours_available);
    res.json({ window: { start: start.toISODate(), end: end.toISODate() }, days, drivers: out });
  } catch (e) { console.error(e); res.status(500).json({ error: 'grid_failed', detail: String(e) }); }
  finally { client.release(); }
});

app.post('/api/violations/:id/ack', async (req, res) => {
  const { id } = req.params; const { user_id = 'system', transporter_id, metric_key } = req.body || {};
  try {
    await pool.query(
      `UPDATE driver_violations SET status='acknowledged', updated_at=NOW()
       WHERE id::text=$1 OR (COALESCE($2,'')<>'' AND transporter_id=$2 AND metric_key=$3)`,
      [id, transporter_id || null, metric_key || null]
    );
    await pool.query(`INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, error_message, started_at, completed_at) VALUES ('amazon_logistics','violation_ack','success',1,NULL,NOW(),NOW())`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'ack_failed' }); }
});

app.post('/api/violations/:id/resolve', async (req, res) => {
  const { id } = req.params; const { user_id = 'system', reason_code='resolved', notes='', transporter_id, metric_key } = req.body || {};
  try {
    await pool.query(
      `UPDATE driver_violations SET status='resolved', updated_at=NOW()
       WHERE id::text=$1 OR (COALESCE($2,'')<>'' AND transporter_id=$2 AND metric_key=$3)`,
      [id, transporter_id || null, metric_key || null]
    );
    await pool.query(`INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, error_message, started_at, completed_at) VALUES ('amazon_logistics','violation_resolve','success',1,NULL,NOW(),NOW())`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'resolve_failed' }); }
});

app.post('/api/violations/:id/escalate', async (req, res) => {
  const { id } = req.params; const { level='L2', user_id='system', transporter_id, metric_key } = req.body || {};
  try {
    await pool.query(
      `UPDATE driver_violations SET status='escalated', updated_at=NOW()
       WHERE id::text=$1 OR (COALESCE($2,'')<>'' AND transporter_id=$2 AND metric_key=$3)`,
      [id, transporter_id || null, metric_key || null]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'escalate_failed' }); }
});

app.post('/api/whc/:driver/:date/note', async (req, res) => {
  const { driver, date } = req.params; const { note='' } = req.body || {};
  try {
    await pool.query(`UPDATE work_hours_audit_daily SET reasons = COALESCE(reasons, ARRAY[]::text[]) || $1 WHERE work_date=$2 AND driver_name=$3`, [note, date, driver]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'note_failed' }); }
});

// =============================
// Enhanced HOS API Endpoints
// =============================

// Import enhanced HOS module
import { 
  checkCompliance, 
  calculateAvailableHours, 
  projectViolation,
  generateRecommendations,
  DutySegment,
  DUTY_STATUS 
} from './lib/hosEnhanced.mjs';

// GET /api/hos/chat - Process natural language queries about HOS
app.post('/api/hos/chat', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query_required' });
  
  const client = await pool.connect();
  try {
    const now = DateTime.now().setZone('America/Los_Angeles');
    const normalizedQuery = query.toLowerCase();
    
    // Analyze query type and respond accordingly
    let response = { answer: '', data: null, suggestions: [], violations: [], recommendations: [] };
    
    // Get current HOS grid data for analysis
    const endDate = now.toISODate();
    const end = DateTime.fromISO(endDate, { zone: 'utc' }).endOf('day');
    const actualDataEnd = end.minus({ days: 1 }).endOf('day');
    const start = end.minus({ days: 6 }).startOf('day');
    
    // Build the same driver data as the grid endpoint
    const { rows: drivers } = await client.query(
      `SELECT DISTINCT d.driver_id, d.driver_name
       FROM drivers d
       WHERE EXISTS (
         SELECT 1 FROM on_duty_segments s 
         WHERE s.driver_id = d.driver_id 
         AND s.end_utc > $1 AND s.start_utc < $2
       ) OR EXISTS (
         SELECT 1 FROM schedule_predictions sp
         WHERE sp.driver_id = d.driver_id
         AND sp.schedule_date >= $3::date AND sp.schedule_date <= $4::date
       )`,
      [start.toISO(), actualDataEnd.toISO(), start.toISODate(), end.toISODate()]
    );
    
    const driverData = [];
    for (const d of drivers) {
      const wstart = actualDataEnd.minus({ hours: 168 }).toISO();
      const wend = actualDataEnd.toISO();
      
      // Get hours used
      const { rows: used } = await client.query(
        `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
           LEAST(end_utc, $2::timestamptz) - GREATEST(start_utc, $1::timestamptz)
         ))/3600.0), 0) AS hours_used 
         FROM on_duty_segments 
         WHERE driver_id = $3 AND end_utc > $1 AND start_utc < $2`,
        [wstart, wend, d.driver_id]
      );
      
      const hours_used = Number(used[0]?.hours_used || 0);
      const hours_available = Math.max(0, 60 - hours_used);
      
      // Check for violations and at-risk status
      let status = 'OK';
      const violations = [];
      const warnings = [];
      
      if (hours_available < 0) {
        status = 'VIOLATION';
        violations.push({
          type: 'HOS_60_7',
          message: `Exceeded 60-hour limit by ${Math.abs(hours_available).toFixed(1)} hours`,
          severity: 'CRITICAL'
        });
      } else if (hours_available < 10) {
        status = 'AT_RISK';
        warnings.push({
          type: 'APPROACHING_LIMIT',
          message: `Only ${hours_available.toFixed(1)} hours available in 7-day window`,
          severity: 'HIGH'
        });
      }
      
      driverData.push({
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        hours_used: hours_used.toFixed(1),
        hours_available: hours_available.toFixed(1),
        status,
        violations,
        warnings
      });
    }
    
    // Process different query types
    if (normalizedQuery.includes('violation') || normalizedQuery.includes('compliant') || normalizedQuery.includes('compliance')) {
      const violationDrivers = driverData.filter(d => d.status === 'VIOLATION');
      const atRiskDrivers = driverData.filter(d => d.status === 'AT_RISK');
      
      if (violationDrivers.length === 0 && atRiskDrivers.length === 0) {
        response.answer = '✅ **All drivers are currently compliant with HOS regulations!**\n\nNo violations or at-risk situations detected.';
      } else {
        let answer = '';
        
        if (violationDrivers.length > 0) {
          answer += `🚫 **${violationDrivers.length} driver${violationDrivers.length > 1 ? 's' : ''} in violation:**\n\n`;
          violationDrivers.forEach(d => {
            answer += `• **${d.driver_name}** - ${d.violations[0].message}\n`;
          });
        }
        
        if (atRiskDrivers.length > 0) {
          if (answer) answer += '\n';
          answer += `⚠️ **${atRiskDrivers.length} driver${atRiskDrivers.length > 1 ? 's' : ''} at risk:**\n\n`;
          atRiskDrivers.forEach(d => {
            answer += `• **${d.driver_name}** - ${d.warnings[0].message}\n`;
          });
        }
        
        response.answer = answer;
        response.violations = violationDrivers;
      }
      
      response.suggestions = [
        'Which drivers are available to work today?',
        'Show me drivers who need a break soon',
        'Who has the most hours available?'
      ];
      
    } else if (normalizedQuery.includes('available') || normalizedQuery.includes('can work') || normalizedQuery.includes('who can drive')) {
      const availableDrivers = driverData
        .filter(d => d.status === 'OK' && Number(d.hours_available) > 8)
        .sort((a, b) => Number(b.hours_available) - Number(a.hours_available));
      
      if (availableDrivers.length === 0) {
        response.answer = '⚠️ **No drivers currently available with sufficient hours.**\n\nAll drivers are either in violation, at risk, or have less than 8 hours available.';
      } else {
        response.answer = `✅ **${availableDrivers.length} drivers available to work:**\n\n`;
        availableDrivers.slice(0, 10).forEach(d => {
          response.answer += `• **${d.driver_name}** - ${d.hours_available} hours available\n`;
        });
        
        if (availableDrivers.length > 10) {
          response.answer += `\n_...and ${availableDrivers.length - 10} more drivers available_`;
        }
      }
      
      response.data = availableDrivers;
      response.suggestions = [
        'Show me current violations',
        'Who needs a rest break?',
        'Which drivers worked the most this week?'
      ];
      
    } else if (normalizedQuery.includes('rule') || normalizedQuery.includes('regulation') || normalizedQuery.includes('60 hour') || normalizedQuery.includes('70 hour')) {
      // Explain HOS rules
      response.answer = '📚 **Hours of Service (HOS) Key Rules:**\n\n';
      
      if (normalizedQuery.includes('60 hour') || normalizedQuery.includes('60/7')) {
        response.answer += '**60-Hour/7-Day Rule:**\n';
        response.answer += '• Drivers cannot drive after 60 hours on duty in 7 consecutive days\n';
        response.answer += '• This is a rolling calculation that looks back 7 days from now\n';
        response.answer += '• Exceeding this limit results in an out-of-service order\n\n';
      }
      
      if (normalizedQuery.includes('70 hour') || normalizedQuery.includes('70/8')) {
        response.answer += '**70-Hour/8-Day Rule:**\n';
        response.answer += '• Drivers cannot drive after 70 hours on duty in 8 consecutive days\n';
        response.answer += '• Used by carriers operating 7 days a week\n';
        response.answer += '• Also a rolling calculation\n\n';
      }
      
      if (normalizedQuery.includes('break') || normalizedQuery.includes('meal') || normalizedQuery.includes('lunch')) {
        response.answer += '**30-Minute Break Rule:**\n';
        response.answer += '• Required after 8 hours of driving time\n';
        response.answer += '• Must be at least 30 consecutive minutes\n';
        response.answer += '• Can be satisfied by any non-driving period\n\n';
      }
      
      if (!normalizedQuery.includes('60') && !normalizedQuery.includes('70') && !normalizedQuery.includes('break')) {
        response.answer += '**Common HOS Rules:**\n';
        response.answer += '• **60/7 Rule:** Max 60 hours on-duty in 7 days\n';
        response.answer += '• **11-Hour Driving:** Max 11 hours driving after 10 hours off\n';
        response.answer += '• **14-Hour Duty:** Cannot drive beyond 14th hour after coming on duty\n';
        response.answer += '• **30-Minute Break:** Required after 8 hours of driving\n';
        response.answer += '• **34-Hour Restart:** Optional reset of weekly hours\n';
      }
      
      response.suggestions = [
        'Show me current violations',
        'Which drivers are near their limits?',
        'What is the 34-hour restart rule?'
      ];
      
    } else if (normalizedQuery.includes('most hours') || normalizedQuery.includes('worked most') || normalizedQuery.includes('busiest')) {
      const busyDrivers = driverData
        .filter(d => Number(d.hours_used) > 0)
        .sort((a, b) => Number(b.hours_used) - Number(a.hours_used));
      
      response.answer = `📊 **Drivers by hours worked (last 7 days):**\n\n`;
      busyDrivers.slice(0, 10).forEach((d, i) => {
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
        response.answer += `${emoji} **${d.driver_name}** - ${d.hours_used} hours (${d.hours_available} available)\n`;
      });
      
      response.data = busyDrivers;
      response.suggestions = [
        'Who needs a break soon?',
        'Show me violations',
        'Which drivers are available?'
      ];
      
    } else if (normalizedQuery.includes('demo') || normalizedQuery.includes('example')) {
      const demoDrivers = driverData.filter(d => d.driver_id.startsWith('DEMO'));
      
      if (demoDrivers.length > 0) {
        response.answer = '🎯 **Demo/Example Drivers for Testing:**\n\n';
        demoDrivers.forEach(d => {
          const statusEmoji = d.status === 'VIOLATION' ? '🚫' : d.status === 'AT_RISK' ? '⚠️' : '✅';
          response.answer += `${statusEmoji} **${d.driver_name}**\n`;
          if (d.violations.length > 0) {
            response.answer += `   └─ ${d.violations[0].message}\n`;
          } else if (d.warnings.length > 0) {
            response.answer += `   └─ ${d.warnings[0].message}\n`;
          } else {
            response.answer += `   └─ Compliant (${d.hours_available} hours available)\n`;
          }
        });
        response.answer += '\n_These are mock drivers for demonstration purposes_';
      }
      
      response.suggestions = [
        'Show all violations',
        'Explain the 60-hour rule',
        'Which real drivers are available?'
      ];
      
    } else {
      // Default response with helpful information
      response.answer = '🚛 **HOS Compliance Assistant**\n\nI can help you with:\n\n';
      response.answer += '• **Compliance Status** - Check violations and at-risk drivers\n';
      response.answer += '• **Driver Availability** - Find who can work\n';
      response.answer += '• **HOS Rules** - Explain regulations\n';
      response.answer += '• **Work History** - See who worked the most\n';
      response.answer += '• **Predictions** - Forecast future violations\n\n';
      response.answer += 'What would you like to know?';
      
      response.suggestions = [
        'Show current HOS violations',
        'Which drivers are available?',
        'Explain the 60-hour rule',
        'Who worked the most this week?'
      ];
    }
    
    res.json(response);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'chat_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

// GET /api/hos/driver/:driverId/status - Get real-time HOS status for a driver
app.get('/api/hos/driver/:driverId/status', async (req, res) => {
  const { driverId } = req.params;
  const client = await pool.connect();
  
  try {
    const now = DateTime.utc();
    const { rows: segments } = await client.query(
      `SELECT start_utc, end_utc, 'ON_DUTY_NOT_DRIVING' as status 
       FROM on_duty_segments 
       WHERE driver_id = $1 AND end_utc > $2 
       ORDER BY start_utc`,
      [driverId, now.minus({ days: 8 }).toISO()]
    );
    
    const dutySegments = segments.map(s => new DutySegment(s.start_utc, s.end_utc, s.status));
    const compliance = checkCompliance(dutySegments, now);
    const availability = calculateAvailableHours(dutySegments, now);
    const recommendations = generateRecommendations(dutySegments, now);
    
    res.json({
      driverId,
      timestamp: now.toISO(),
      compliance: compliance.compliant,
      violations: compliance.violations,
      metrics: compliance.metrics,
      availability,
      recommendations
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'status_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

// POST /api/hos/schedule/analyze - Analyze schedule for violations
app.post('/api/hos/schedule/analyze', async (req, res) => {
  const { schedules, date } = req.body;
  if (!schedules || !Array.isArray(schedules)) {
    return res.status(400).json({ error: 'schedules_required' });
  }
  
  const client = await pool.connect();
  try {
    const analysisDate = date ? DateTime.fromISO(date) : DateTime.now();
    const results = [];
    
    for (const schedule of schedules) {
      const { driverId, shiftStart, shiftEnd } = schedule;
      
      // Get existing segments
      const { rows: segments } = await client.query(
        `SELECT start_utc, end_utc, 'ON_DUTY_NOT_DRIVING' as status 
         FROM on_duty_segments 
         WHERE driver_id = $1 AND end_utc > $2 
         ORDER BY start_utc`,
        [driverId, analysisDate.minus({ days: 8 }).toISO()]
      );
      
      const existingSegments = segments.map(s => new DutySegment(s.start_utc, s.end_utc, s.status));
      const plannedSegment = new DutySegment(shiftStart, shiftEnd, DUTY_STATUS.DRIVING);
      
      const projection = projectViolation(existingSegments, [plannedSegment], analysisDate);
      
      results.push({
        driverId,
        schedule,
        violationPredicted: !!projection.violationTime,
        violationDetails: projection
      });
    }
    
    res.json({ 
      date: analysisDate.toISO(),
      schedules: results,
      totalViolationsPredicted: results.filter(r => r.violationPredicted).length
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'analysis_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

// GET /api/hos/fleet/dashboard - Fleet-wide HOS dashboard data
app.get('/api/hos/fleet/dashboard', async (req, res) => {
  const client = await pool.connect();
  try {
    const now = DateTime.utc();
    const { rows: drivers } = await client.query(
      'SELECT driver_id, driver_name FROM drivers WHERE driver_status = $1',
      ['active']
    );
    
    const fleetStatus = {
      totalDrivers: drivers.length,
      compliant: 0,
      violations: [],
      warnings: [],
      available: 0,
      needingRest: 0
    };
    
    for (const driver of drivers) {
      const { rows: segments } = await client.query(
        `SELECT start_utc, end_utc, 'ON_DUTY_NOT_DRIVING' as status 
         FROM on_duty_segments 
         WHERE driver_id = $1 AND end_utc > $2 
         ORDER BY start_utc`,
        [driver.driver_id, now.minus({ days: 8 }).toISO()]
      );
      
      const dutySegments = segments.map(s => new DutySegment(s.start_utc, s.end_utc, s.status));
      const compliance = checkCompliance(dutySegments, now);
      const availability = calculateAvailableHours(dutySegments, now);
      
      if (compliance.compliant) {
        fleetStatus.compliant++;
      } else {
        fleetStatus.violations.push({
          driver,
          violations: compliance.violations
        });
      }
      
      if (availability.canDrive) {
        fleetStatus.available++;
      } else {
        fleetStatus.needingRest++;
      }
      
      if (availability.weeklyHoursAvailable < 10) {
        fleetStatus.warnings.push({
          driver,
          type: 'LOW_HOURS',
          message: `Only ${availability.weeklyHoursAvailable.toFixed(1)} hours available`
        });
      }
    }
    
    res.json(fleetStatus);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'dashboard_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

// GET /api/hos/violations/analytics - Violation analytics data
app.get('/api/hos/violations/analytics', async (req, res) => {
  const { startDate, endDate, groupBy = 'type' } = req.query;
  const client = await pool.connect();
  
  try {
    const start = startDate ? DateTime.fromISO(startDate) : DateTime.now().minus({ days: 30 });
    const end = endDate ? DateTime.fromISO(endDate) : DateTime.now();
    
    // Get violation history from driver_violations table
    const { rows: violations } = await client.query(
      `SELECT 
        dv.*,
        d.driver_name,
        dv.metric_key as violation_type,
        dv.observed_value,
        dv.threshold_value,
        dv.occurred_at,
        dv.severity
       FROM driver_violations dv
       JOIN drivers d ON d.driver_id = dv.transporter_id
       WHERE dv.occurred_at BETWEEN $1 AND $2
       ORDER BY dv.occurred_at DESC`,
      [start.toISO(), end.toISO()]
    );
    
    // Group violations by type
    const violationsByType = violations.reduce((acc, v) => {
      const type = v.violation_type || 'UNKNOWN';
      if (!acc[type]) {
        acc[type] = { count: 0, cost: 0, drivers: new Set() };
      }
      acc[type].count++;
      acc[type].drivers.add(v.driver_name);
      // Estimate costs based on violation type
      const costMap = {
        'WEEKLY_60_HOUR': 2750,
        'DRIVING_11_HOUR': 2750,
        'ON_DUTY_14_HOUR': 2750,
        'BREAK_30_MINUTE': 1650,
        'REST_10_HOUR': 2750,
      };
      acc[type].cost += costMap[type] || 1100;
      return acc;
    }, {});
    
    // Calculate trends
    const dailyTrends = {};
    violations.forEach(v => {
      const date = DateTime.fromISO(v.occurred_at).toISODate();
      if (!dailyTrends[date]) {
        dailyTrends[date] = 0;
      }
      dailyTrends[date]++;
    });
    
    res.json({
      summary: {
        totalViolations: violations.length,
        totalEstimatedCost: Object.values(violationsByType).reduce((sum, v) => sum + v.cost, 0),
        uniqueDrivers: new Set(violations.map(v => v.transporter_id)).size,
        dateRange: { start: start.toISO(), end: end.toISO() }
      },
      violationsByType: Object.entries(violationsByType).map(([type, data]) => ({
        type,
        count: data.count,
        estimatedCost: data.cost,
        driversAffected: data.drivers.size
      })),
      trends: Object.entries(dailyTrends).map(([date, count]) => ({ date, count })),
      topViolators: violations.slice(0, 10).map(v => ({
        driverName: v.driver_name,
        driverId: v.transporter_id,
        violationType: v.violation_type,
        occurredAt: v.occurred_at,
        severity: v.severity
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'analytics_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

// POST /api/hos/report/generate - Generate compliance report
app.post('/api/hos/report/generate', async (req, res) => {
  const { reportType, startDate, endDate, format = 'json' } = req.body;
  const client = await pool.connect();
  
  try {
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);
    
    // Get all necessary data for the report
    const { rows: drivers } = await client.query(
      'SELECT * FROM drivers WHERE driver_status = $1 ORDER BY driver_name',
      ['active']
    );
    
    const reportData = {
      metadata: {
        reportType,
        generatedAt: DateTime.now().toISO(),
        period: { start: start.toISO(), end: end.toISO() },
        company: 'Your Delivery Company',
        dotNumber: '1234567'
      },
      drivers: [],
      summary: {
        totalDrivers: drivers.length,
        compliantDrivers: 0,
        totalViolations: 0,
        estimatedFines: 0
      }
    };
    
    // Process each driver
    for (const driver of drivers) {
      const { rows: segments } = await client.query(
        `SELECT start_utc, end_utc, 'ON_DUTY_NOT_DRIVING' as status 
         FROM on_duty_segments 
         WHERE driver_id = $1 AND start_utc >= $2 AND end_utc <= $3 
         ORDER BY start_utc`,
        [driver.driver_id, start.toISO(), end.toISO()]
      );
      
      const { rows: violations } = await client.query(
        `SELECT * FROM driver_violations 
         WHERE transporter_id = $1 AND occurred_at BETWEEN $2 AND $3`,
        [driver.driver_id, start.toISO(), end.toISO()]
      );
      
      const driverData = {
        driverId: driver.driver_id,
        driverName: driver.driver_name,
        totalHours: segments.reduce((sum, s) => {
          const duration = DateTime.fromISO(s.end_utc).diff(DateTime.fromISO(s.start_utc), 'hours').hours;
          return sum + duration;
        }, 0),
        violations: violations.length,
        compliant: violations.length === 0,
        segments: segments.length
      };
      
      reportData.drivers.push(driverData);
      if (driverData.compliant) reportData.summary.compliantDrivers++;
      reportData.summary.totalViolations += violations.length;
    }
    
    // Log audit entry
    await client.query(
      `INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, started_at, completed_at) 
       VALUES ('hos_system', 'report_generated', 'success', $1, NOW(), NOW())`,
      [reportData.drivers.length]
    );
    
    res.json(reportData);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'report_generation_failed', detail: String(e) });
  } finally {
    client.release();
  }
});

// Static hosting for built frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => { console.log(`Express server listening on ${port}`); }); 
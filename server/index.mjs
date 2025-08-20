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
  const start = end.minus({ days: 6 }).startOf('day');
  const client = await pool.connect();
  try {
    // load distinct drivers that have segments in window
    const { rows: drivers } = await client.query(
      `SELECT DISTINCT d.driver_id, d.driver_name
         FROM drivers d
         JOIN on_duty_segments s ON s.driver_id=d.driver_id
        WHERE s.end_utc > $1 AND s.start_utc < $2`,
      [start.toISO(), end.toISO()]
    );
    const out = [];
    for (const d of drivers) {
      const wstart = end.minus({ hours: 168 }).toISO();
      const wend = end.toISO();
      // Compute merged (union) intervals inside window, then daily hours and used hours without double counting
      const dailyRes = await client.query(
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
                   (day_local AT TIME ZONE 'America/Los_Angeles') AS day_start_utc,
                   ((day_local + interval '1 day') AT TIME ZONE 'America/Los_Angeles') AS day_end_utc
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
      const lunchRes = await client.query(
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
                   (day_local AT TIME ZONE 'America/Los_Angeles') AS day_start_utc,
                   ((day_local + interval '1 day') AT TIME ZONE 'America/Los_Angeles') AS day_end_utc
              FROM days_local
          )
          SELECT to_char(day_start_utc, 'YYYY-MM-DD') AS day,
                 COALESCE(SUM(CASE WHEN b.start_utc IS NULL OR b.end_utc IS NULL THEN 0
                                   ELSE EXTRACT(EPOCH FROM (LEAST(b.end_utc, bo.day_end_utc) - GREATEST(b.start_utc, bo.day_start_utc)))/60.0 END), 0) AS minutes
            FROM bounds bo
            LEFT JOIN break_segments b ON b.driver_id=$3 AND b.end_utc > bo.day_start_utc AND b.start_utc < bo.day_end_utc
           GROUP BY day, bo.day_start_utc
           ORDER BY bo.day_start_utc;`,
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
      const lunch_minutes = lunchRes.rows.map(r => Number(r.minutes || 0));
      const hours_used = Number(Number(usedRes.rows?.[0]?.hours_used || 0).toFixed(2));
      const hours_available = Number((60 - hours_used).toFixed(2));
      const total_7d = Number(day_hours.reduce((a,b)=>a + (b||0), 0).toFixed(2));
      out.push({ driver_id: d.driver_id, driver_name: d.driver_name || d.driver_id, day_hours, lunch_minutes, total_7d, hours_used, hours_available });
    }
    out.sort((a,b)=> a.hours_available - b.hours_available);
    res.json({ window: { start: start.toISODate(), end: end.toISODate() }, drivers: out });
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
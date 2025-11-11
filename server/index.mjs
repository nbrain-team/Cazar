import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
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
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
          const gapMin = Math.round(nextStart.diff(endAdj, 'minutes').minutes);
          // If gap is between 0 and 180 minutes (3 hours), treat as potential lunch break
          // This captures both short breaks and longer lunch periods
          if (gapMin > 0 && gapMin <= 180) {
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
                  [driverId, uploadId, infStartUtc.toISO(), infEndUtc.toISO(), JSON.stringify({ inferred: true, reason: 'gap_within_3_hours', from_line: li, to_line: j, gap_minutes: gapMin })]
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
                    COALESCE(MAX(CASE WHEN ROUND(EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0) >= $4 THEN 1 ELSE 0 END),0) AS qual_meal_exists,
                    MIN(CASE WHEN ROUND(EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0) >= $4 THEN br.start_utc END) AS earliest_qual_meal_start,
                    COALESCE(MAX(CASE WHEN (br.source_row_ref ->> 'inferred') = 'true' AND ROUND(EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0) >= $4 THEN 1 ELSE 0 END),0) AS inferred_meal_exists,
                    COALESCE(MAX(ROUND(EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0)),0) AS longest_break_minutes
               FROM bounds b
               LEFT JOIN break_segments br ON br.driver_id=$3 AND br.end_utc > b.day_start_utc AND br.start_utc < b.day_end_utc
              GROUP BY b.day_start_utc, b.day_end_utc
           ),
           combined AS (
             SELECT b.day_start_utc, b.day_end_utc, od.on_hours, od.first_start_utc, od.last_end_utc,
                    br.break_minutes, br.qual_meal_exists, br.earliest_qual_meal_start, br.inferred_meal_exists, br.longest_break_minutes
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
                  longest_break_minutes,
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
            const longestBreak = Number(r.longest_break_minutes || 0);
            let message;
            if (longestBreak > 0) {
              // They took a break but it was too short
              message = `Meal break violation: Only took ${Math.round(longestBreak)}min break (need ≥${meal_min_minutes}min)`;
            } else {
              // No break at all
              message = `Meal break violation: No break taken (need ≥${meal_min_minutes}min by 6h on-duty)`;
            }
            reasonsForDay.push({ type: 'MEAL', severity: 'VIOLATION', message, values: { first_start_utc: r.first_start_utc || null, earliest_meal_utc: r.earliest_qual_meal_start || null, longest_break_minutes: longestBreak } });
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
      const projected_reasons = [];
      
      // Check if future scheduled work will cause issues
      days.forEach((day, idx) => {
        const schedule = scheduleMap.get(day.iso);
        if (schedule && DateTime.fromISO(day.iso) >= DateTime.now().startOf('day')) {
          // This is a future scheduled day
          
          // Check 60/7 limit using the actual hours_used calculation
          if (hours_used + schedule.hours > 60) {
            projected_reasons.push({
              type: 'PROJECTED_60_7',
              severity: 'AT_RISK',
              message: `Scheduled ${day.mmdd}: ${schedule.content} (${schedule.hours}h) would exceed 60h/7d limit`,
              day: day.label
            });
          }
          
          // Calculate consecutive days up to and including this scheduled day
          let consecutiveDaysToScheduled = 0;
          let foundBreak = false;
          
          // Count backwards from the scheduled day
          for (let i = idx; i >= 0 && !foundBreak; i--) {
            if (i === idx) {
              // This is the scheduled day itself - count it if it has hours
              if (schedule.hours > 0) {
                consecutiveDaysToScheduled = 1;
              }
            } else if (projected_hours[i] > 0) {
              consecutiveDaysToScheduled++;
            } else {
              // Found a day off before the scheduled day
              foundBreak = true;
            }
          }
          
          // Only warn if this would be 5th or more consecutive day
          if (consecutiveDaysToScheduled >= 5 && schedule.hours > 0) {
            projected_reasons.push({
              type: 'PROJECTED_CONSECUTIVE',
              severity: 'AT_RISK', 
              message: `Scheduled ${day.mmdd}: Would be ${consecutiveDaysToScheduled}th consecutive day`,
              day: day.label
            });
          }
        }
      });
      
      // Check day_reasons for any violations and targeted AT_RISK on current day only
      let hasViolationInDays = false;
      for (const day in day_reasons) {
        const dayReasons = day_reasons[day];
        if (dayReasons.some(r => r.severity === 'VIOLATION')) {
          hasViolationInDays = true;
          // Add the violation to window_reasons so it shows in the summary
          const violation = dayReasons.find(r => r.severity === 'VIOLATION');
          if (violation && !window_reasons.some(wr => wr.type === violation.type)) {
            window_reasons.push(violation);
          }
        }
      }
      
      // Update status based on violations across the window
      if (hasViolationInDays && status !== 'VIOLATION') {
        status = 'VIOLATION';
      }
      
      // Only treat consecutive-days AT_RISK if it applies to the current day (resets after a day off)
      if (status === 'OK') {
        const currentLabel = days[days.length - 1]?.label || 'D';
        const currentDayReasons = day_reasons[currentLabel] || [];
        const atRiskConsecutiveToday = currentDayReasons.some(r => r.type === 'CONSECUTIVE_DAYS' && r.severity === 'AT_RISK');
        if (atRiskConsecutiveToday) {
          status = 'AT_RISK';
        }
      }
      
      // Update status if there are projected risks (future schedule)
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
    // Use fixed date to match the data (Sept 3, 2025)
    const endDate = '2025-09-03';
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
    
    console.log(`Chat: Found ${drivers.length} drivers for date range ${start.toISODate()} to ${end.toISODate()}`);
    
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
      
      // Get daily work history to check consecutive days, including days with zero hours
      const { rows: dailyWork } = await client.query(
        `WITH w AS (
           SELECT $2::timestamptz AS wstart, $3::timestamptz AS wend
         ), days_local AS (
           SELECT generate_series(
                    date_trunc('day', timezone('America/Los_Angeles', (SELECT wstart FROM w))),
                    date_trunc('day', timezone('America/Los_Angeles', (SELECT wend FROM w))),
                    interval '1 day') AS day_local
         ), bounds AS (
           SELECT day_local,
                  timezone('UTC', timezone('America/Los_Angeles', day_local::timestamp)) AS day_start_utc,
                  timezone('UTC', timezone('America/Los_Angeles', (day_local + interval '1 day')::timestamp)) AS day_end_utc
             FROM days_local
         ), daily AS (
           SELECT to_char(b.day_start_utc, 'YYYY-MM-DD') AS work_date,
                  COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(s.end_utc, b.day_end_utc) - GREATEST(s.start_utc, b.day_start_utc)))/3600.0),0) AS hours
             FROM bounds b
             LEFT JOIN on_duty_segments s
               ON s.driver_id = $1
              AND s.end_utc > b.day_start_utc
              AND s.start_utc < b.day_end_utc
            GROUP BY work_date, b.day_start_utc
            ORDER BY b.day_start_utc DESC
         )
         SELECT work_date, hours FROM daily ORDER BY work_date DESC;`,
        [d.driver_id, start.toISO(), actualDataEnd.toISO()]
      );
      
      // Count consecutive days worked
      let consecutiveDays = 0;
      for (const day of dailyWork) {
        if (day.hours > 0) {
          consecutiveDays++;
        } else {
          break; // Found a day off
        }
      }
      
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
      
      // Check consecutive days (5th = AT_RISK, 6th+ = VIOLATION)
      if (consecutiveDays >= 6) {
        status = 'VIOLATION';
        violations.push({
          type: 'CONSECUTIVE_DAYS',
          message: `Working ${consecutiveDays} consecutive days (6+ is a violation)`,
          severity: 'CRITICAL'
        });
      } else if (consecutiveDays === 5) {
        if (status === 'OK') status = 'AT_RISK';
        warnings.push({
          type: 'CONSECUTIVE_DAYS',
          message: `Currently on ${consecutiveDays}th consecutive work day`,
          severity: 'MEDIUM'
        });
      }
      
      driverData.push({
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        hours_used: hours_used.toFixed(1),
        hours_available: hours_available.toFixed(1),
        consecutive_days: consecutiveDays,
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
        response.answer = '# ✅ Full Compliance\n\n**All drivers are currently compliant with HOS regulations!**\n\nNo violations or at-risk situations detected.';
      } else {
        response.answer = `# 📊 HOS Compliance Status\n\n`;
        response.answer += `**${violationDrivers.length + atRiskDrivers.length} drivers** requiring attention\n\n`;
        response.answer += `---\n\n`;
        
        if (violationDrivers.length > 0) {
          response.answer += `## 🚫 VIOLATIONS (${violationDrivers.length} drivers)\n\n`;
          response.answer += `> **Immediate action required** - These drivers cannot drive\n\n`;
          
          // Group by violation type
          const byType = {};
          violationDrivers.forEach(d => {
            d.violations.forEach(v => {
              const type = v.type || 'OTHER';
              if (!byType[type]) byType[type] = [];
              byType[type].push({ driver: d, violation: v });
            });
          });
          
          Object.entries(byType).forEach(([type, items]) => {
            const typeLabel = {
              'WEEKLY_HOURS': '60/7 Hour Violations',
              'MEAL': 'Meal Break Violations',
              'CONSECUTIVE_DAYS': 'Consecutive Days Violations',
              'DAILY_DRIVING': 'Daily Driving Violations',
              'DAILY_DUTY': 'Daily Duty Violations'
            }[type] || 'Other Violations';
            
            response.answer += `### ${typeLabel}\n`;
            items.forEach(({ driver, violation }) => {
              response.answer += `- **${driver.driver_name}**: ${violation.message}\n`;
            });
            response.answer += `\n`;
          });
          
          response.answer += `---\n\n`;
        }
        
        if (atRiskDrivers.length > 0) {
          response.answer += `## ⚠️ AT RISK (${atRiskDrivers.length} drivers)\n\n`;
          response.answer += `> **Proactive action needed** - Schedule adjustments recommended\n\n`;
          
          atRiskDrivers.forEach(d => {
            response.answer += `### ${d.driver_name}\n`;
            response.answer += `- **Warning:** ${d.warnings[0].message}\n`;
            response.answer += `- **Hours Available:** ${d.hours_available}\n\n`;
          });
        }
        
        response.answer += `---\n\n`;
        response.answer += `## 💡 Recommended Actions\n\n`;
        if (violationDrivers.length > 0) {
          response.answer += `1. **Violations:** Remove affected drivers from schedule immediately\n`;
          response.answer += `2. **Compliance:** Ensure required rest/break periods are taken\n`;
        }
        if (atRiskDrivers.length > 0) {
          response.answer += `${violationDrivers.length > 0 ? '3' : '1'}. **Prevention:** Adjust schedules for at-risk drivers\n`;
          response.answer += `${violationDrivers.length > 0 ? '4' : '2'}. **Monitoring:** Track these drivers closely today\n`;
        }
        
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
      
    } else if (normalizedQuery.includes('consecutive') || normalizedQuery.includes('days in a row') || normalizedQuery.includes('days of work in a row') || normalizedQuery.includes('7 days') || normalizedQuery.includes('risk of violating')) {
      console.log(`Chat: Matched consecutive days query. Total drivers: ${driverData.length}`);
      
      // Check for consecutive days violations and risks
      const consecutiveRiskDrivers = driverData.filter(d => 
        d.consecutive_days >= 5 || 
        d.warnings.some(w => w.type === 'CONSECUTIVE_DAYS') ||
        d.violations.some(v => v.type === 'CONSECUTIVE_DAYS')
      );
      
      if (consecutiveRiskDrivers.length === 0) {
        response.answer = '✅ **No drivers at risk of consecutive day violations!**\n\n';
        response.answer += 'All drivers have adequate days off in their schedule.';
      } else {
        response.answer = `# ⚠️ Consecutive Days Analysis\n\n`;
        response.answer += `**${consecutiveRiskDrivers.length} drivers** with consecutive day concerns\n\n`;
        response.answer += `---\n\n`;
        
        // Group drivers by status
        const violations = consecutiveRiskDrivers.filter(d => d.consecutive_days >= 7);
        const atRisk = consecutiveRiskDrivers.filter(d => d.consecutive_days === 6);
        const warnings = consecutiveRiskDrivers.filter(d => d.consecutive_days === 5);
        
        if (violations.length > 0) {
          response.answer += `## 🚫 VIOLATIONS (${violations.length} drivers)\n\n`;
          response.answer += `> **Immediate action required** - These drivers are working 7+ consecutive days\n\n`;
          
          violations.forEach(d => {
            response.answer += `### ${d.driver_name}\n`;
            response.answer += `- **Status:** Day ${d.consecutive_days} (VIOLATION)\n`;
            response.answer += `- **Hours Available:** ${d.hours_available} hours\n`;
            response.answer += `- **Action Required:** Must take immediate day off\n\n`;
          });
          response.answer += `---\n\n`;
        }
        
        if (atRisk.length > 0) {
          response.answer += `## ⚠️ AT RISK (${atRisk.length} drivers)\n\n`;
          response.answer += `> **Critical** - One more day will result in violation\n\n`;
          
          atRisk.forEach(d => {
            response.answer += `### ${d.driver_name}\n`;
            response.answer += `- **Status:** Day 6 (AT RISK)\n`;
            response.answer += `- **Hours Available:** ${d.hours_available} hours\n`;
            response.answer += `- **Action Required:** Schedule day off tomorrow\n\n`;
          });
          response.answer += `---\n\n`;
        }
        
        if (warnings.length > 0) {
          response.answer += `## ⚠️ WARNINGS (${warnings.length} drivers)\n\n`;
          response.answer += `> **Monitor closely** - Approaching consecutive day limits\n\n`;
          
          warnings.forEach(d => {
            response.answer += `### ${d.driver_name}\n`;
            response.answer += `- **Status:** Day 5 (WARNING)\n`;
            response.answer += `- **Hours Available:** ${d.hours_available} hours\n`;
            response.answer += `- **Recommendation:** Plan day off within 2 days\n\n`;
          });
        }
        
        response.answer += `---\n\n`;
        response.answer += `## 💡 Recommendations\n\n`;
        response.answer += `1. **Immediate:** Remove violation drivers from schedule today\n`;
        response.answer += `2. **Tomorrow:** Ensure at-risk drivers get mandatory day off\n`;
        response.answer += `3. **This Week:** Rotate warning drivers to prevent escalation\n`;
        response.answer += `4. **Long-term:** Implement automatic consecutive day tracking in scheduling\n`;
      }
      
      response.data = consecutiveRiskDrivers;
      response.suggestions = [
        'Show all HOS violations',
        'Which drivers are available today?',
        'Explain the consecutive days rule'
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

// =============================
// Smart Agent RAG/MCP Endpoint
// =============================

// Compliance URLs Configuration (stored in-memory for now, could be moved to DB)
let complianceUrls = [
  { url: 'https://www.fmcsa.dot.gov/regulations/hours-of-service', category: 'HOS Regulations', enabled: true },
  { url: 'https://www.osha.gov/', category: 'OSHA Safety', enabled: true },
  { url: 'https://www.dol.gov/agencies/whd', category: 'DOL Wage & Hour', enabled: true }
];

// Helper: Search web via Serper.dev API
async function searchWeb(query, complianceOnly = false) {
  try {
    const serperApiKey = process.env.SERPER_API_KEY || process.env.SERP_API_KEY;
    if (!serperApiKey) {
      console.log('[Web Search] Serper API key not configured');
      return [];
    }
    
    let searchQuery = query;
    if (complianceOnly) {
      const enabledUrls = complianceUrls.filter(u => u.enabled);
      if (enabledUrls.length > 0) {
        const sitesQuery = enabledUrls.map(u => `site:${new URL(u.url).hostname}`).join(' OR ');
        searchQuery = `(${sitesQuery}) ${query}`;
        console.log(`[Web Search] Compliance-only search for: "${searchQuery}"`);
      }
    } else {
      console.log(`[Web Search] General search for: "${searchQuery}"`);
    }
    
    console.log(`[Web Search] Calling Serper.dev API...`);
    
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 5
      })
    });
    
    console.log(`[Web Search] Serper.dev status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Web Search] Serper.dev error response: ${errorText}`);
      throw new Error(`Serper.dev API failed with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[Web Search] Got ${data.organic?.length || 0} results`);
    
    const results = (data.organic || []).slice(0, 5).map(r => ({
      type: 'web',
      title: r.title,
      url: r.link,
      snippet: r.snippet
    }));
    
    console.log(`[Web Search] Returning ${results.length} formatted results`);
    return results;
  } catch (error) {
    console.error('[Web Search] Error:', error.message);
    return [];
  }
}

// Helper: Search Pinecone vector DB
async function searchPinecone(query, topK = 5) {
  try {
    const embed = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: query });
    let vector = embed.data[0].embedding;
    if (vector.length !== pcTargetDim) vector = downProject(vector, pcTargetDim);
    
    const idx = pinecone.index(pcIndexName);
    const results = await idx.query({ vector, topK, includeMetadata: true });
    
    // CRITICAL: Filter out low-relevance results (below 50% similarity)
    // Scores below 0.5 are essentially random and not relevant to the query
    const RELEVANCE_THRESHOLD = 0.50;
    
    const filtered = (results.matches || [])
      .filter(m => {
        const isRelevant = m.score >= RELEVANCE_THRESHOLD;
        if (!isRelevant) {
          console.log(`[Pinecone] Filtering out low-relevance result: ${m.metadata?.title || m.id} (score: ${m.score} < ${RELEVANCE_THRESHOLD})`);
        }
        return isRelevant;
      })
      .map(m => ({
        type: 'pinecone',
        title: m.metadata?.title || m.id,
        snippet: (m.metadata?.text || '').substring(0, 200),
        score: m.score
      }));
    
    console.log(`[Pinecone] After relevance filtering: ${filtered.length} of ${results.matches?.length || 0} results kept (threshold: ${RELEVANCE_THRESHOLD})`);
    return filtered;
  } catch (error) {
    console.error('Pinecone search error:', error);
    return [];
  }
}

// Helper: Search PostgreSQL database
async function searchPostgres(query, pool) {
  try {
    const client = await pool.connect();
    try {
      const qLower = query.toLowerCase();
      const results = { drivers: [], violations: [], statistics: null };
      
      // Detect count/statistics queries
      const isCountQuery = qLower.includes('how many') || qLower.includes('count') || qLower.includes('total');
      const isActiveQuery = qLower.includes('active');
      const isEmployeeQuery = qLower.includes('driver') || qLower.includes('employee') || qLower.includes('worker');
      const isRecentQuery = qLower.includes('recent') || qLower.includes('new') || qLower.includes('hire');
      const isBreakQuery = (qLower.includes('break') || qLower.includes('lunch') || qLower.includes('meal')) && 
                          (qLower.includes('6 hour') || qLower.includes('consecutive') || qLower.includes('without') || qLower.includes('exceed'));
      const isTimecardQuery = qLower.includes('hour') || qLower.includes('timecard') || qLower.includes('worked') || 
                             qLower.includes('clock') || qLower.includes('time logged');
      
      // Handle statistical queries
      if (isCountQuery && isEmployeeQuery) {
        console.log('[DB] Detected count/statistics query about employees');
        
        // Get total counts by status
        const { rows: statusCounts } = await client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE driver_status = 'active') as active_status,
            COUNT(*) FILTER (WHERE driver_status = 'inactive') as inactive_status,
            COUNT(*) FILTER (WHERE employment_status = 'active') as employed_active,
            COUNT(*) FILTER (WHERE employment_status = 'terminated') as employed_terminated
          FROM drivers
        `);
        
        const stats = statusCounts[0];
        results.statistics = {
          total: parseInt(stats.total),
          active_driver_status: parseInt(stats.active_status),
          inactive_driver_status: parseInt(stats.inactive_status),
          active_employment: parseInt(stats.employed_active),
          terminated_employment: parseInt(stats.employed_terminated)
        };
        
        console.log('[DB] Statistics:', results.statistics);
      }
      
      // Handle break violation queries
      if (isBreakQuery) {
        console.log('[DB] Detected break/meal violation query');
        
        // Find drivers who worked 6+ consecutive hours without a break
        const { rows: violations } = await client.query(`
          WITH driver_days AS (
            SELECT 
              driver_id,
              DATE(start_utc) as work_date,
              MIN(start_utc) as day_start,
              MAX(end_utc) as day_end,
              SUM(minutes) as total_minutes
            FROM on_duty_segments
            WHERE duty_type = 'worked'
            GROUP BY driver_id, DATE(start_utc)
            HAVING SUM(minutes) >= 360  -- 6 hours = 360 minutes
          ),
          breaks_by_day AS (
            SELECT 
              driver_id,
              DATE(start_utc) as work_date,
              COUNT(*) as break_count,
              SUM(minutes) as total_break_minutes
            FROM break_segments
            WHERE label ILIKE '%lunch%' OR label ILIKE '%break%' OR label ILIKE '%meal%'
            GROUP BY driver_id, DATE(start_utc)
          )
          SELECT 
            d.driver_id,
            dr.driver_name,
            dd.work_date,
            dd.total_minutes,
            COALESCE(bb.break_count, 0) as break_count,
            COALESCE(bb.total_break_minutes, 0) as break_minutes
          FROM driver_days dd
          JOIN drivers d ON d.driver_id = dd.driver_id
          LEFT JOIN drivers dr ON dr.driver_id = dd.driver_id
          LEFT JOIN breaks_by_day bb ON bb.driver_id = dd.driver_id AND bb.work_date = dd.work_date
          WHERE dd.total_minutes >= 360 AND COALESCE(bb.break_count, 0) = 0
          ORDER BY dd.work_date DESC, dd.total_minutes DESC
          LIMIT 20
        `);
        
        if (violations.length > 0) {
          results.violations = violations;
          console.log(`[DB] Found ${violations.length} break violations`);
        } else {
          results.violations = [];
          console.log('[DB] No break violations found');
        }
      }
      
      // Handle "recent hires" queries
      if (isRecentQuery && (isEmployeeQuery || qLower.includes('hire'))) {
        console.log('[DB] Detected recent hires query');
        const { rows: recentHires } = await client.query(`
          SELECT driver_id, driver_name, hire_date, employment_status, driver_status
          FROM drivers
          WHERE hire_date IS NOT NULL
          ORDER BY hire_date DESC
          LIMIT 10
        `);
        results.drivers = recentHires;
      }
      // Search for specific drivers by name/ID
      else if (!isCountQuery) {
        const { rows: drivers } = await client.query(
          `SELECT driver_id, driver_name, driver_status, employment_status, hire_date 
           FROM drivers 
           WHERE driver_name ILIKE $1 OR driver_id ILIKE $1 LIMIT 5`,
          [`%${query}%`]
        );
        results.drivers = drivers;
      }
      
      // Search violations if query mentions violations/compliance
      if (qLower.includes('violation') || qLower.includes('compliance')) {
        const { rows } = await client.query(
          `SELECT dv.*, d.driver_name FROM driver_violations dv
           JOIN drivers d ON d.driver_id = dv.transporter_id
           ORDER BY dv.occurred_at DESC LIMIT 5`
        );
        results.violations = rows;
      }
      
      // Search timecards if query mentions hours/timecards
      if (isTimecardQuery) {
        console.log('[DB] Detected timecard/hours query');
        
        // Determine date range from query
        let dateFilter = '';
        if (qLower.includes('last week')) {
          dateFilter = "AND t.date >= CURRENT_DATE - INTERVAL '14 days' AND t.date < CURRENT_DATE - INTERVAL '7 days'";
        } else if (qLower.includes('this week') || qLower.includes('current week')) {
          dateFilter = "AND t.date >= CURRENT_DATE - INTERVAL '7 days'";
        } else if (qLower.includes('today')) {
          dateFilter = "AND t.date = CURRENT_DATE";
        } else if (qLower.includes('yesterday')) {
          dateFilter = "AND t.date = CURRENT_DATE - 1";
        } else {
          // Default: last 14 days
          dateFilter = "AND t.date >= CURRENT_DATE - INTERVAL '14 days'";
        }
        
        // Get timecard summary
        const { rows: timecardSummary } = await client.query(`
          SELECT 
            COUNT(*) as entry_count,
            COUNT(DISTINCT t.employee_id) as worker_count,
            SUM(t.total_hours_worked) as total_hours,
            MIN(t.date) as start_date,
            MAX(t.date) as end_date
          FROM timecards t
          WHERE 1=1 ${dateFilter}
        `);
        
        results.timecards = timecardSummary[0];
        console.log(`[DB] Timecard summary:`, results.timecards);
      }
      
      return results;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('PostgreSQL search error:', error);
    return { drivers: [], violations: [], statistics: null };
  }
}

// Import Microsoft, ADP, and Read.AI services
import { searchMicrosoft365 } from './lib/microsoftGraph.mjs';
import { searchADP as searchADPService } from './lib/adpService.mjs';
import { processMeetingTranscript, searchMeetings } from './lib/readAIService.mjs';
import { runSophisticatedAgent, formatAgentResponse } from './lib/sophisticatedAgent.mjs';

// Import Claude 4.5 Email Analytics services
import { generateEmailQuery, formatEmailQueryResults, isEmailQuery } from './lib/claudeEmailService.mjs';
import { syncEmails, initializeEmailAnalytics, getSyncStats } from './lib/emailSyncService.mjs';

// Import Document Service for OneDrive/SharePoint access
import { 
  getUserDrive, 
  listDriveContents, 
  searchDriveContents, 
  getFileMetadata, 
  getFileDownloadUrl,
  listSharePointSites,
  getFoldersByName 
} from './lib/documentService.mjs';

// Import Calendar & Teams Sync Services
import { syncCalendarEvents } from './lib/calendarSyncService.mjs';
import { syncTeamsMessages } from './lib/teamsSyncService.mjs';
import { generateCalendarQuery, formatCalendarResults, isCalendarQuery } from './lib/claudeCalendarService.mjs';
import { generateTeamsQuery, formatTeamsResults, isTeamsQuery } from './lib/claudeTeamsService.mjs';

// Import Anthropic Sophisticated Agent (multi-step reasoning)
import { runAnthropicAgent, formatAgentResponse as formatAnthropicResponse } from './lib/anthropicSophisticatedAgent.mjs';

// POST /api/smart-agent/chat - Main Smart Agent endpoint (Now uses Anthropic Sophisticated Agent)
app.post('/api/smart-agent/chat', async (req, res) => {
  try {
    const { message, clientFilter, enabledDatabases = [], conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message_required' });
    }
    
    console.log(`\n🤖 Smart Agent query: "${message}"`);
    console.log(`   Databases enabled: [${enabledDatabases.join(', ')}]`);
    
    // Use Anthropic Sophisticated Agent for ALL queries (intelligent multi-step reasoning)
    const result = await runAnthropicAgent(
      message,
      conversationHistory,
      process.env.DATABASE_URL
    );
    
    // Format response
    const formattedResponse = formatAnthropicResponse(result);
    
    // Build sources from tool calls
    const sources = result.toolCalls?.map((call, index) => ({
      type: 'tool',
      title: `${call.tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
      snippet: call.result.query_summary || call.result.count || 'Executed'
    })) || [];
    
    console.log(`✨ Completed in ${result.steps} steps using ${result.toolCalls?.length || 0} tools`);
    
    return res.json({
      response: formattedResponse,
      sources: sources.length > 0 ? sources : undefined,
      metadata: {
        steps: result.steps,
        toolsUsed: result.toolCalls?.length || 0,
        model: 'claude-3-5-haiku-20241022',
        mode: 'anthropic-sophisticated'
      },
      conversationHistory: result.conversationHistory || []
    });
    
  } catch (error) {
    console.error('❌ Smart Agent error:', error);
    res.status(500).json({ 
      error: 'smart_agent_failed', 
      detail: error.message 
    });
  }
});

// POST /api/smart-agent/save-training-data - Save conversation for training
app.post('/api/smart-agent/save-training-data', async (req, res) => {
  try {
    const { conversation, feedback, timestamp, databases } = req.body;
    
    console.log('[Training Data] Saving conversation with feedback');
    
    // Create training data object
    const trainingData = {
      timestamp: timestamp || new Date().toISOString(),
      databases_used: databases || [],
      feedback,
      conversation: conversation.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      message_count: conversation.length
    };
    
    // Append to training data file
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const trainingFilePath = path.join(__dirname, '../training_data.jsonl');
    
    // Append as JSONL (one JSON object per line)
    const jsonLine = JSON.stringify(trainingData) + '\n';
    fs.appendFileSync(trainingFilePath, jsonLine);
    
    console.log(`[Training Data] Saved conversation with ${conversation.length} messages`);
    
    res.json({
      success: true,
      message: 'Training data saved successfully'
    });
    
  } catch (error) {
    console.error('[Training Data] Save error:', error);
    res.status(500).json({
      error: 'save_failed',
      message: error.message
    });
  }
});

// GET /api/smart-agent/training-data - View all feedback (for admin use)
app.get('/api/smart-agent/training-data', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const trainingFilePath = path.join(__dirname, '../training_data.jsonl');
    
    // Check if file exists
    if (!fs.existsSync(trainingFilePath)) {
      return res.json({
        count: 0,
        feedbacks: [],
        message: 'No feedback data yet'
      });
    }
    
    // Read file and parse JSONL
    const fileContent = fs.readFileSync(trainingFilePath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(line => line.length > 0);
    const feedbacks = lines.map(line => JSON.parse(line));
    
    res.json({
      count: feedbacks.length,
      feedbacks: feedbacks,
      latest: feedbacks[feedbacks.length - 1]
    });
    
  } catch (error) {
    console.error('[Training Data] Read error:', error);
    res.status(500).json({
      error: 'read_failed',
      message: error.message
    });
  }
});

// Fallback OLD Smart Agent endpoint (commented out - keeping for reference)
/*
app.post('/api/smart-agent/chat-old', async (req, res) => {
  try {
    const { message, clientFilter, enabledDatabases = [], conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message_required' });
    }
    
    console.log(`Smart Agent query: "${message}" with databases: [${enabledDatabases.join(', ')}]`);
    
    // Only run detection if databases aren't explicitly enabled (saves time)
    let isEmailRelated = enabledDatabases.includes('email');
    let isCalendarRelated = false;
    let isTeamsRelated = false;
    
    // If email database is explicitly enabled, also check for calendar/Teams
    if (enabledDatabases.includes('email')) {
      // Run calendar and Teams detection in parallel (email already enabled, no need to detect)
      [isCalendarRelated, isTeamsRelated] = await Promise.all([
        isCalendarQuery(message),
        isTeamsQuery(message)
      ]);
      console.log(`[Smart Agent] Email enabled. Additional detection: calendar=${isCalendarRelated}, teams=${isTeamsRelated}`);
    } else {
      // Only detect if email database should be auto-enabled
      isEmailRelated = await isEmailQuery(message);
      if (isEmailRelated) {
        console.log('[Smart Agent] Auto-enabling email search based on AI detection');
        enabledDatabases.push('email');
        // Also check calendar/Teams
        [isCalendarRelated, isTeamsRelated] = await Promise.all([
          isCalendarQuery(message),
          isTeamsQuery(message)
        ]);
      }
    }
    
    // Auto-enable PostgreSQL for queries about hours, timecards, workers, violations
    const needsDatabase = message.toLowerCase().match(/hours?|timecard|worked|clock|driver|employee|violation|break|lunch/);
    if (needsDatabase && !enabledDatabases.includes('postgres')) {
      console.log('[Smart Agent] Auto-enabling PostgreSQL search for timecard/worker query');
      enabledDatabases.push('postgres');
    }
    
    // Collect context from enabled sources
    const contextSources = [];
    const sources = [];
    
    // Handle email analytics queries with Claude
    if (isEmailRelated && enabledDatabases.includes('email')) {
      try {
        console.log('[Smart Agent] Email query detected - using Claude Email Analytics');
        
        // Generate and execute SQL query using Claude
        const { sql, params, explanation } = await generateEmailQuery(message);
        console.log(`[Smart Agent] Generated SQL: ${sql}`);
        
        const emailResults = await pool.query(sql, params || []);
        console.log(`[Smart Agent] Database returned ${emailResults.rows.length} email results`);
        
        if (emailResults.rows.length > 0) {
          // Format results using Claude with conversation history for follow-ups
          try {
            const formattedResponse = await formatEmailQueryResults(emailResults.rows, message, conversationHistory);
            
            // Add to context
            contextSources.push(`[Email Analytics] ${formattedResponse}`);
            sources.push({
              type: 'email',
              title: 'Email Analytics Results',
              snippet: `${emailResults.rows.length} results found`,
              data: emailResults.rows,
              explanation
            });
            
            console.log(`[Smart Agent] Email Analytics: ${emailResults.rows.length} results formatted successfully`);
          } catch (formatError) {
            // If formatting fails, add raw data summary to context
            console.error('[Smart Agent] Formatting error, using raw data:', formatError.message);
            
            const rawSummary = `Found ${emailResults.rows.length} emails. Recent emails:\n` +
              emailResults.rows.slice(0, 10).map((email, i) => 
                `${i+1}. From: ${email.from_name} | Subject: ${email.subject} | Date: ${new Date(email.received_date).toLocaleDateString()} | Category: ${email.category || 'N/A'} | Priority: ${email.priority || 'N/A'}`
              ).join('\n');
            
            contextSources.push(`[Email Analytics] ${rawSummary}`);
            sources.push({
              type: 'email',
              title: 'Email Data (Raw)',
              snippet: `${emailResults.rows.length} emails found`,
              data: emailResults.rows
            });
          }
        } else {
          console.log('[Smart Agent] No email results found');
          contextSources.push('[Email Analytics] No emails found matching the query criteria.');
        }
        
      } catch (error) {
        console.error('[Smart Agent] Email Analytics error:', error.message);
        console.error('[Smart Agent] Error type:', error.name);
        console.error('[Smart Agent] Full error stack:', error.stack);
        
        // Add minimal error message - don't expose technical details
        contextSources.push(`[Email Analytics] Unable to retrieve email data at this time.`);
      }
    }
    
    // Handle calendar queries with Claude
    if (isCalendarRelated && enabledDatabases.includes('email')) {
      try {
        console.log('[Smart Agent] Calendar query detected - using Claude Calendar Analytics');
        
        // Generate and execute SQL query using Claude
        const { sql, params, explanation } = await generateCalendarQuery(message);
        console.log(`[Smart Agent] Generated Calendar SQL: ${sql}`);
        
        const calendarResults = await pool.query(sql, params || []);
        
        // Format results using Claude
        const formattedResponse = await formatCalendarResults(calendarResults.rows, message);
        
        // Add to context
        contextSources.push(`[Calendar] ${formattedResponse}`);
        sources.push({
          type: 'calendar',
          title: 'Calendar Events',
          snippet: `${calendarResults.rows.length} events found`,
          data: calendarResults.rows,
          explanation
        });
        
        console.log(`[Smart Agent] Calendar: ${calendarResults.rows.length} results`);
        
      } catch (error) {
        console.error('[Smart Agent] Calendar error:', error.message);
        contextSources.push(`[Calendar] Error: ${error.message}`);
      }
    }
    
    // Handle Teams queries with Claude
    if (isTeamsRelated && enabledDatabases.includes('email')) {
      try {
        console.log('[Smart Agent] Teams query detected - using Claude Teams Analytics');
        
        // Generate and execute SQL query using Claude
        const { sql, params, explanation } = await generateTeamsQuery(message);
        console.log(`[Smart Agent] Generated Teams SQL: ${sql}`);
        
        const teamsResults = await pool.query(sql, params || []);
        
        // Format results using Claude
        const formattedResponse = await formatTeamsResults(teamsResults.rows, message);
        
        // Add to context
        contextSources.push(`[Teams] ${formattedResponse}`);
        sources.push({
          type: 'teams',
          title: 'Teams Messages',
          snippet: `${teamsResults.rows.length} messages found`,
          data: teamsResults.rows,
          explanation
        });
        
        console.log(`[Smart Agent] Teams: ${teamsResults.rows.length} results`);
        
      } catch (error) {
        console.error('[Smart Agent] Teams error:', error.message);
        contextSources.push(`[Teams] Error: ${error.message}`);
      }
    }
    
    // Search Pinecone if enabled
    if (enabledDatabases.includes('pinecone')) {
      try {
        console.log(`[Smart Agent] Searching Pinecone for: "${message}"`);
        const pineconeResults = await searchPinecone(message, 5);
        console.log(`[Smart Agent] Pinecone returned ${pineconeResults.length} results`);
        
        if (pineconeResults.length > 0) {
          pineconeResults.forEach(r => {
            console.log(`[Smart Agent] Pinecone result: ${r.title} (score: ${r.score})`);
            contextSources.push(`[Pinecone] ${r.title}: ${r.snippet}`);
            sources.push(r);
          });
        }
      } catch (error) {
        console.error('[Smart Agent] Pinecone search error:', error.message);
        // Don't add Pinecone to sources if it's failing - better to have no results than wrong results
        console.log('[Smart Agent] Skipping Pinecone results due to error');
      }
    }
    
    // Search Web if enabled (prioritize compliance URLs)
    // Skip web search for internal employee/payroll queries - those should only use ADP
    const isInternalQuery = message.toLowerCase().includes('employee') || 
                           message.toLowerCase().includes('hire') ||
                           message.toLowerCase().includes('payroll') ||
                           message.toLowerCase().includes('staff') ||
                           message.toLowerCase().includes('worker');
    
    if (enabledDatabases.includes('web') && !isInternalQuery) {
      try {
        console.log('[Smart Agent] Running web search for compliance/regulatory content...');
        const webResults = await searchWeb(message, true);
        webResults.forEach(r => {
          contextSources.push(`[Web] ${r.title}: ${r.snippet}`);
          sources.push(r);
        });
      } catch (error) {
        console.error('Web search error:', error.message);
      }
    } else if (isInternalQuery) {
      console.log('[Smart Agent] Skipping web search - internal employee/payroll query should use ADP only');
    }
    
    // Search PostgreSQL if enabled
    if (enabledDatabases.includes('postgres')) {
      try {
        const pgResults = await searchPostgres(message, pool);
        
        // Add statistics if available
        if (pgResults.statistics) {
          const stats = pgResults.statistics;
          const statsText = `[Database Statistics] Total employees/drivers: ${stats.total}. ` +
            `Active (driver_status): ${stats.active_driver_status}. ` +
            `Inactive (driver_status): ${stats.inactive_driver_status}. ` +
            `Active (employment_status): ${stats.active_employment}. ` +
            `Terminated (employment_status): ${stats.terminated_employment}.`;
          
          contextSources.push(statsText);
          sources.push({
            type: 'database',
            title: 'Employee Statistics',
            snippet: `Total: ${stats.total} | Active: ${stats.active_driver_status} | From ADP + existing data`
          });
          console.log('[Smart Agent] Added database statistics to context');
        }
        
        // Add timecard data to context if available
        if (pgResults.timecards) {
          const tc = pgResults.timecards;
          const totalHours = parseFloat(tc.total_hours || 0).toFixed(1);
          const startDate = tc.start_date ? new Date(tc.start_date).toLocaleDateString() : 'N/A';
          const endDate = tc.end_date ? new Date(tc.end_date).toLocaleDateString() : 'N/A';
          
          const timecardText = `[Database Timecards] ${tc.worker_count} workers logged ${totalHours} total hours across ${tc.entry_count} timecard entries from ${startDate} to ${endDate}.`;
          contextSources.push(timecardText);
          sources.push({
            type: 'database',
            title: 'Timecard Summary',
            snippet: `${tc.worker_count} workers, ${totalHours} hours total (${startDate} - ${endDate})`
          });
          console.log('[Smart Agent] Added timecard data to context');
        }
        
        if (pgResults.drivers.length > 0) {
          const driversList = pgResults.drivers.map(d => 
            `${d.driver_name} (ID: ${d.driver_id}, Status: ${d.driver_status}, Employment: ${d.employment_status}${d.hire_date ? ', Hired: ' + new Date(d.hire_date).toLocaleDateString() : ''})`
          ).join('; ');
          contextSources.push(`[Database] Found ${pgResults.drivers.length} matching drivers: ${driversList}`);
          
          pgResults.drivers.forEach(d => {
            sources.push({
              type: 'database',
              title: `Driver: ${d.driver_name}`,
              snippet: `ID: ${d.driver_id}, Status: ${d.driver_status}, Employment: ${d.employment_status}`
            });
          });
        }
        if (pgResults.violations.length > 0) {
          // Check if these are break violations or compliance violations
          const firstViolation = pgResults.violations[0];
          if (firstViolation.work_date && firstViolation.total_minutes) {
            // Break violations
            const violationsList = pgResults.violations.map(v => 
              `${v.driver_name || v.driver_id} on ${new Date(v.work_date).toLocaleDateString()}: worked ${(v.total_minutes / 60).toFixed(1)} hours with ${v.break_count} breaks (${v.break_minutes} mins)`
            ).join('; ');
            contextSources.push(`[Database Break Violations] Found ${pgResults.violations.length} drivers who worked 6+ hours without proper breaks: ${violationsList}`);
            
            pgResults.violations.forEach(v => {
              sources.push({
                type: 'database',
                title: `Break Violation: ${v.driver_name || v.driver_id}`,
                snippet: `Worked ${(v.total_minutes / 60).toFixed(1)} hours on ${new Date(v.work_date).toLocaleDateString()} with no lunch break`
              });
            });
          } else {
            // Regular compliance violations
            contextSources.push(`[Database] Found ${pgResults.violations.length} recent violations`);
            sources.push({
              type: 'database',
              title: 'Recent Violations',
              snippet: `${pgResults.violations.length} compliance violations found in system`
            });
          }
        }
        
        // Also search meeting transcripts (ignore if table doesn't exist yet)
        try {
          const meetingResults = await searchMeetings(pool, message, { limit: 5 });
          if (meetingResults.length > 0) {
            contextSources.push(`[Meetings] Found ${meetingResults.length} relevant meeting transcripts`);
            meetingResults.forEach(m => {
              sources.push({
                type: 'meeting',
                title: `Meeting: ${m.title}`,
                snippet: m.summary?.substring(0, 200) || 'Meeting transcript available'
              });
            });
          }
        } catch (meetingErr) {
          // Ignore if meeting table doesn't exist yet
          if (!meetingErr.message.includes('does not exist')) {
            console.error('Meeting search error:', meetingErr.message);
          }
        }
      } catch (error) {
        console.error('PostgreSQL search error:', error.message);
      }
    }
    
    // Microsoft 365 direct queries DISABLED - All data synced to PostgreSQL
    // Emails, calendar, and Teams messages are synced to PostgreSQL for faster, pre-analyzed queries
    if (enabledDatabases.includes('microsoft') || enabledDatabases.includes('email')) {
      console.log('[Smart Agent] Microsoft 365 direct queries disabled - all data synced to PostgreSQL');
      // Note: Real-time Graph API calls removed. All Microsoft data is now:
      // - Synced to PostgreSQL (email_analytics, calendar_events, teams_messages)
      // - Pre-analyzed by Claude
      // - Queried via SQL for better performance
      
      // Skip the Graph API search - data is already in PostgreSQL
      // Old Graph API code commented out - now using PostgreSQL synced data instead
    }
    
    // Search ADP if enabled
    if (enabledDatabases.includes('adp')) {
      try {
        console.log(`[Smart Agent] Searching ADP for: "${message}"`);
        const adpResults = await searchADPService(message);
        console.log(`[Smart Agent] ADP returned ${adpResults.length} results`);
        
        adpResults.forEach(r => {
          console.log(`[Smart Agent] ADP result: [${r.type}] ${r.title}`);
          contextSources.push(`[ADP - ${r.type}] ${r.title}: ${r.snippet}`);
          sources.push({
            type: 'adp',
            title: r.title,
            snippet: r.snippet
          });
        });
        
        if (adpResults.length === 0) {
          console.log('[Smart Agent] ADP search returned 0 results - NOT adding to sources (user preference)');
        }
      } catch (error) {
        console.error('[Smart Agent] ADP search error:', error.message, error.stack);
        sources.push({
          type: 'adp',
          title: 'ADP Connection',
          snippet: `Certificate authentication configured. ${error.message}`
        });
      }
    }
    
    // Build conversation context
    const conversationContext = conversationHistory.slice(-5).map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');
    
    // Generate response using Claude (Anthropic)
    let response;
    
    try {
      const systemPrompt = `You are an intelligent operations assistant with access to multiple data sources including:
- Internal knowledge base (Pinecone vector database)
- Company operations database (PostgreSQL)
- Web search for compliance regulations
- Microsoft 365 (emails, calendar, teams)
- ADP Payroll system

Your role is to:
1. Provide accurate, well-formatted answers using ONLY the data provided in context below
2. Cite sources clearly for all information
3. Format responses in clean Markdown with tables where appropriate
4. Be conversational but professional
5. If information is not available in the context, clearly state that you don't have access to that data
6. Focus on operations, compliance, payroll, and logistics topics

**CRITICAL: NEVER generate mock, fake, or example data. If you don't have the real data from the context below, say so explicitly. Do NOT make up names, dates, or any other information.**

Context from search:
${contextSources.join('\n\n')}

Previous conversation:
${conversationContext}`;

      // Use Anthropic Claude instead of OpenAI
      const completion = await anthropic.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 4096,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          { role: 'user', content: message }
        ]
      });
      
      response = completion.content[0].text || 'I apologize, but I could not generate a response.';
      
    } catch (aiError) {
      console.error('Claude API error:', aiError.message);
      
      // Provide helpful response even without AI
      if (sources.length > 0) {
        response = `# Search Results for: "${message}"\n\n`;
        response += `I found ${sources.length} relevant sources, but the AI service is temporarily unavailable.\n\n`;
        response += `## Sources Found:\n\n`;
        sources.forEach((s, i) => {
          response += `${i + 1}. **${s.title}**\n`;
          if (s.snippet) response += `   ${s.snippet}\n`;
          response += `\n`;
        });
        response += `\n*Note: AI analysis unavailable. ${aiError.message.includes('credit') ? 'Please check Anthropic API credits.' : 'Please try again later.'}*`;
      } else {
        response = `# Service Temporarily Unavailable\n\n`;
        response += `The AI service is currently unavailable. ${aiError.message.includes('credit') ? '**Please check Anthropic API credits.**' : 'Please try again in a moment.'}\n\n`;
        response += `**Your question:** ${message}\n\n`;
        response += `I'll be able to provide intelligent answers once the service is restored.`;
      }
    }
    
    // Log summary of what sources were used
    const sourceSummary = sources.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {});
    console.log(`[Smart Agent] Response generated with ${sources.length} total sources:`, sourceSummary);
    console.log(`[Smart Agent] Context had ${contextSources.length} items for AI`);
    
    res.json({
      response,
      sources: sources.length > 0 ? sources : undefined
    });
    
  } catch (error) {
    console.error('Smart Agent error:', error);
    res.status(500).json({ 
      error: 'smart_agent_failed', 
      detail: error.message 
    });
  }
});
*/
// End of OLD Smart Agent code

// POST /api/smart-agent/advanced - Sophisticated Multi-Step Agent (OLD - OpenAI based)
app.post('/api/smart-agent/advanced', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message_required' });
    }
    
    console.log(`\n🧠 [Sophisticated Agent] Query: "${message}"`);
    console.log(`📜 Conversation history: ${conversationHistory.length} messages`);
    
    // Run the sophisticated agent with multi-step reasoning
    const result = await runSophisticatedAgent(
      message,
      conversationHistory,
      process.env.DATABASE_URL
    );
    
    // Format the response for user display
    const formattedResponse = formatAgentResponse(result);
    
    // Build sources from tool calls
    const sources = result.toolCalls.map((call, index) => ({
      type: 'tool',
      title: `Step ${index + 1}: ${call.tool.replace(/_/g, ' ').toUpperCase()}`,
      snippet: call.result.success ? 
        `${call.result.rowCount || call.result.count || 'Completed'} - ${call.args.explanation || call.args.operation || ''}` : 
        `Error: ${call.result.error}`
    }));
    
    // Add reasoning transparency
    if (result.reasoning && result.reasoning.length > 0) {
      sources.push({
        type: 'reasoning',
        title: `Multi-Step Analysis (${result.steps} steps)`,
        snippet: `Used ${result.toolCalls.length} tools to analyze your question comprehensively`
      });
    }
    
    console.log(`\n✨ [Sophisticated Agent] Completed in ${result.steps} steps`);
    console.log(`📊 Tools used: ${result.toolCalls.length}`);
    
    res.json({
      response: formattedResponse,
      sources: sources.length > 0 ? sources : undefined,
      metadata: {
        steps: result.steps,
        toolsUsed: result.toolCalls.length,
        model: 'gpt-4-turbo (function-calling)',
        mode: 'sophisticated'
      },
      conversationHistory: result.conversationHistory
    });
    
  } catch (error) {
    console.error('Sophisticated Agent error:', error);
    res.status(500).json({ 
      error: 'sophisticated_agent_failed', 
      detail: error.message 
    });
  }
});

// POST /auth/readai/callback - Read.AI webhook endpoint
app.post('/auth/readai/callback', async (req, res) => {
  try {
    console.log('📝 Read.AI webhook received');
    
    const webhookData = req.body;
    
    // Validate webhook data
    if (!webhookData || (!webhookData.meeting_id && !webhookData.id)) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }
    
    // Process asynchronously (don't make webhook wait)
    processMeetingTranscript(pool, webhookData)
      .then(result => {
        console.log('✅ Meeting processed:', result);
      })
      .catch(error => {
        console.error('❌ Meeting processing error:', error);
      });
    
    // Immediately respond to webhook
    res.status(200).json({ 
      success: true, 
      message: 'Webhook received, processing meeting transcript' 
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'webhook_processing_failed' });
  }
});

// GET /api/meetings/search - Search meetings
app.get('/api/meetings/search', async (req, res) => {
  try {
    const { q, start_date, end_date, topic, participant, limit } = req.query;
    
    const results = await searchMeetings(pool, q, {
      start_date,
      end_date,
      topic,
      participant,
      limit: parseInt(limit) || 10
    });
    
    res.json({ meetings: results });
  } catch (error) {
    console.error('Meeting search error:', error);
    res.status(500).json({ error: 'search_failed' });
  }
});

// GET /api/smart-agent/env-check - Check environment variables (diagnostic)
app.get('/api/smart-agent/env-check', (req, res) => {
  const envCheck = {
    openai_key_prefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 15) + '...' : 'NOT SET',
    openai_key_suffix: process.env.OPENAI_API_KEY ? '...' + process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 10) : 'NOT SET',
    openai_key_length: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    pinecone_key_set: !!process.env.PINECONE_API_KEY,
    pinecone_index: process.env.PINECONE_INDEX_NAME,
    microsoft_client_id: process.env.MICROSOFT_CLIENT_ID ? process.env.MICROSOFT_CLIENT_ID.substring(0, 8) + '...' : 'NOT SET',
    database_url_set: !!process.env.DATABASE_URL,
    serp_key_set: !!process.env.SERP_API_KEY
  };
  res.json(envCheck);
});

// GET /api/smart-agent/compliance-urls - Get compliance URL configuration
app.get('/api/smart-agent/compliance-urls', (req, res) => {
  res.json({ urls: complianceUrls });
});

// POST /api/smart-agent/compliance-urls - Update compliance URLs
app.post('/api/smart-agent/compliance-urls', (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls_array_required' });
  }
  
  complianceUrls = urls.map(u => ({
    url: u.url,
    category: u.category || 'General',
    enabled: u.enabled !== false
  }));
  
  res.json({ ok: true, urls: complianceUrls });
});

// =============================
// Admin User Management API
// =============================
import bcrypt from 'bcrypt';

// GET /api/admin/users - List all users
app.get('/api/admin/users', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.name as full_name,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login,
        COALESCE(
          json_agg(
            CASE WHEN p.enabled THEN p.data_source ELSE NULL END
          ) FILTER (WHERE p.enabled IS TRUE),
          '[]'
        ) as permissions
      FROM users u
      LEFT JOIN user_data_source_permissions p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ users: rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'failed_to_fetch_users' });
  }
});

// POST /api/admin/users - Create new user
app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, email, full_name, password, role, permissions = [] } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, and password required' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create user
      const { rows } = await client.query(
        `INSERT INTO users (username, email, name, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [username, email, full_name || null, passwordHash, role || 'user']
      );
      
      const userId = rows[0].id;
      
      // Add permissions
      for (const dataSource of permissions) {
        await client.query(
          `INSERT INTO user_data_source_permissions (user_id, data_source, enabled)
           VALUES ($1, $2, true)`,
          [userId, dataSource]
        );
      }
      
      // Log audit
      await client.query(
        `INSERT INTO user_audit_log (admin_user_id, target_user_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [userId, userId, 'create_user', JSON.stringify({ username, email, role, permissions })]
      );
      
      await client.query('COMMIT');
      
      res.json({ success: true, user_id: userId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'failed_to_create_user', detail: error.message });
  }
});

// PUT /api/admin/users/:userId/permissions - Update user permissions
app.put('/api/admin/users/:userId/permissions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions = [] } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing permissions
      await client.query(
        'DELETE FROM user_data_source_permissions WHERE user_id = $1',
        [userId]
      );
      
      // Add new permissions
      for (const dataSource of permissions) {
        await client.query(
          `INSERT INTO user_data_source_permissions (user_id, data_source, enabled)
           VALUES ($1, $2, true)`,
          [userId, dataSource]
        );
      }
      
      await client.query('COMMIT');
      
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: 'failed_to_update_permissions' });
  }
});

// DELETE /api/admin/users/:userId - Delete user
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    await pool.query('DELETE FROM users WHERE id = $1 AND role != $2', [userId, 'admin']);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'failed_to_delete_user' });
  }
});

// ===== EMAIL ANALYTICS API ENDPOINTS (Claude 4.5 Powered) =====

// Global sync status tracker
let currentSyncStatus = {
  inProgress: false,
  startTime: null,
  currentDay: 0,
  totalDays: 0,
  processed: 0,
  lastUpdate: null
};

// POST /api/email-analytics/sync - Manually trigger email sync
app.post('/api/email-analytics/sync', async (req, res) => {
  try {
    const { hoursBack = 720, maxPerMailbox = 500, background = false } = req.body; // 30 days default
    
    // Check if sync already in progress
    if (currentSyncStatus.inProgress) {
      return res.json({
        message: 'Sync already in progress',
        status: currentSyncStatus
      });
    }
    
    console.log(`[API] Starting email sync: ${hoursBack} hours back`);
    
    // If background mode, start sync and return immediately
    if (background) {
      currentSyncStatus = {
        inProgress: true,
        startTime: new Date().toISOString(),
        currentDay: 0,
        totalDays: Math.ceil(hoursBack / 24),
        processed: 0,
        lastUpdate: new Date().toISOString(),
        logs: []
      };
      
      // Run sync in background with detailed logging
      (async () => {
        try {
          console.log('[Background Sync] Starting email sync...');
          currentSyncStatus.logs.push('Sync started');
          
          const result = await syncEmails({ hoursBack, maxPerMailbox });
          
          console.log('[Background Sync] Sync completed:', result);
          currentSyncStatus.inProgress = false;
          currentSyncStatus.completed = true;
          currentSyncStatus.result = result;
          currentSyncStatus.lastUpdate = new Date().toISOString();
          currentSyncStatus.logs.push(`Completed: ${result.processed} processed`);
        } catch (error) {
          console.error('[Background Sync] Sync error:', error);
          currentSyncStatus.inProgress = false;
          currentSyncStatus.error = error.message;
          currentSyncStatus.errorStack = error.stack;
          currentSyncStatus.lastUpdate = new Date().toISOString();
          currentSyncStatus.logs.push(`Error: ${error.message}`);
        }
      })();
      
      return res.json({
        message: 'Sync started in background',
        status: currentSyncStatus,
        check_status_at: '/api/email-analytics/sync-status'
      });
    }
    
    // Normal sync - wait for completion
    const result = await syncEmails({ hoursBack, maxPerMailbox });
    
    res.json(result);
  } catch (error) {
    console.error('[API] Email sync error:', error);
    res.status(500).json({ error: 'email_sync_failed', message: error.message });
  }
});

// GET /api/email-analytics/sync-status - Check sync progress
app.get('/api/email-analytics/sync-status', async (req, res) => {
  res.json(currentSyncStatus);
});

// GET /api/email-analytics/test-date-range - Test fetching specific date range
app.get('/api/email-analytics/test-date-range', async (req, res) => {
  try {
    const { daysBack = 30 } = req.query;
    
    const endDate = new Date();
    const startDate = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000));
    
    console.log(`[Test] Fetching emails from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    const { fetchEmailsByDateRange } = await import('./lib/emailFetchService.mjs');
    const emails = await fetchEmailsByDateRange(startDate, endDate, { maxPerMailbox: 100 });
    
    // Group by date
    const byDate = {};
    emails.forEach(email => {
      const date = new Date(email.receivedDateTime).toLocaleDateString();
      byDate[date] = (byDate[date] || 0) + 1;
    });
    
    const sortedDates = Object.keys(byDate).sort();
    
    res.json({
      success: true,
      totalEmails: emails.length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        daysRequested: daysBack
      },
      actualRange: {
        oldest: emails.length > 0 ? emails[emails.length - 1].receivedDateTime : null,
        newest: emails.length > 0 ? emails[0].receivedDateTime : null
      },
      emailsByDate: byDate,
      dateList: sortedDates,
      sampleEmails: emails.slice(0, 5).map(e => ({
        date: e.receivedDateTime,
        from: e.from?.emailAddress?.address,
        subject: e.subject
      }))
    });
  } catch (error) {
    console.error('[Test] Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// GET /api/email-analytics/stats - Get email analytics statistics
app.get('/api/email-analytics/stats', async (req, res) => {
  try {
    const stats = await getSyncStats();
    res.json({ stats });
  } catch (error) {
    console.error('[API] Stats error:', error);
    res.status(500).json({ error: 'stats_failed', message: error.message });
  }
});

// POST /api/email-analytics/query - Query email analytics with natural language
app.post('/api/email-analytics/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query_required' });
    }
    
    console.log(`[API] Email query: "${query}"`);
    
    // Generate SQL query using Claude
    const { sql, params, explanation, result_type } = await generateEmailQuery(query);
    
    console.log(`[API] Generated SQL: ${sql}`);
    
    // Execute query
    const result = await pool.query(sql, params || []);
    
    // Format results using Claude (no conversation history in direct API call)
    const formattedResponse = await formatEmailQueryResults(result.rows, query, []);
    
    res.json({
      response: formattedResponse,
      data: result.rows,
      result_type,
      explanation,
      query_executed: sql
    });
    
  } catch (error) {
    console.error('[API] Email query error:', error);
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

// GET /api/email-analytics/unanswered - Get unanswered requests
app.get('/api/email-analytics/unanswered', async (req, res) => {
  try {
    const { hours = 48 } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM unanswered_requests
      WHERE hours_waiting >= $1
      ORDER BY hours_waiting DESC
      LIMIT 100
    `, [hours]);
    
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('[API] Unanswered requests error:', error);
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

// GET /api/email-analytics/driver-requests - Get driver requests summary
app.get('/api/email-analytics/driver-requests', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM driver_requests_summary ORDER BY last_request_date DESC LIMIT 100');
    res.json({ driver_requests: result.rows });
  } catch (error) {
    console.error('[API] Driver requests error:', error);
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

// GET /api/email-analytics/response-metrics - Get response time metrics
app.get('/api/email-analytics/response-metrics', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM response_metrics
      WHERE day >= CURRENT_DATE - $1
      ORDER BY day DESC, responded_by
    `, [days]);
    
    res.json({ metrics: result.rows });
  } catch (error) {
    console.error('[API] Response metrics error:', error);
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

// GET /api/email-analytics/category-volume - Get email volume by category
app.get('/api/email-analytics/category-volume', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM email_volume_by_category
      WHERE day >= CURRENT_DATE - $1
      ORDER BY day DESC, category
    `, [days]);
    
    res.json({ volume: result.rows });
  } catch (error) {
    console.error('[API] Category volume error:', error);
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

// POST /api/email-analytics/initialize - Initialize email analytics database
app.post('/api/email-analytics/initialize', async (req, res) => {
  try {
    const success = await initializeEmailAnalytics();
    
    if (success) {
      res.json({ success: true, message: 'Email analytics database initialized' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to initialize database' });
    }
  } catch (error) {
    console.error('[API] Initialize error:', error);
    res.status(500).json({ error: 'init_failed', message: error.message });
  }
});

// ============================================================================
// CALENDAR & TEAMS SYNC API
// ============================================================================

// POST /api/calendar/sync - Sync calendar events from Microsoft 365
app.post('/api/calendar/sync', async (req, res) => {
  try {
    const { daysBack = 30, daysForward = 90, maxPerUser = 200 } = req.body;
    
    console.log(`[API] Starting calendar sync: ${daysBack} days back, ${daysForward} days forward`);
    
    const stats = await syncCalendarEvents(pool, {
      daysBack,
      daysForward,
      maxPerUser,
      analyzeWithClaude: true
    });
    
    res.json({
      success: true,
      stats,
      message: `Synced ${stats.eventsAdded + stats.eventsUpdated} calendar events (${stats.eventsAdded} new, ${stats.eventsUpdated} updated)`
    });
    
  } catch (error) {
    console.error('[API] Calendar sync error:', error);
    res.status(500).json({ error: 'calendar_sync_failed', message: error.message });
  }
});

// POST /api/teams/sync - Sync Teams messages from Microsoft 365
app.post('/api/teams/sync', async (req, res) => {
  try {
    const { daysBack = 30, maxPerChannel = 100 } = req.body;
    
    console.log(`[API] Starting Teams sync: ${daysBack} days back`);
    
    const stats = await syncTeamsMessages(pool, {
      daysBack,
      maxPerChannel,
      analyzeWithClaude: true
    });
    
    res.json({
      success: true,
      stats,
      message: `Synced ${stats.messagesAdded + stats.messagesUpdated} Teams messages (${stats.messagesAdded} new, ${stats.messagesUpdated} updated)`
    });
    
  } catch (error) {
    console.error('[API] Teams sync error:', error);
    res.status(500).json({ error: 'teams_sync_failed', message: error.message });
  }
});

// POST /api/calendar-teams/sync-all - Sync both calendar and Teams
app.post('/api/calendar-teams/sync-all', async (req, res) => {
  try {
    const { 
      daysBack = 30, 
      daysForward = 90,
      maxPerUser = 200,
      maxPerChannel = 100
    } = req.body;
    
    console.log('[API] Starting full calendar & Teams sync');
    
    // Run both syncs in parallel
    const [calendarStats, teamsStats] = await Promise.all([
      syncCalendarEvents(pool, { daysBack, daysForward, maxPerUser, analyzeWithClaude: true }),
      syncTeamsMessages(pool, { daysBack, maxPerChannel, analyzeWithClaude: true })
    ]);
    
    res.json({
      success: true,
      calendar: calendarStats,
      teams: teamsStats,
      message: `Synced ${calendarStats.eventsAdded + calendarStats.eventsUpdated} calendar events and ${teamsStats.messagesAdded + teamsStats.messagesUpdated} Teams messages`
    });
    
  } catch (error) {
    console.error('[API] Full sync error:', error);
    res.status(500).json({ error: 'full_sync_failed', message: error.message });
  }
});

// POST /api/calendar/query - Query calendar with natural language
app.post('/api/calendar/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query_required' });
    }
    
    console.log(`[API] Calendar query: "${query}"`);
    
    const { sql, params, explanation } = await generateCalendarQuery(query);
    const result = await pool.query(sql, params || []);
    const formatted = await formatCalendarResults(result.rows, query);
    
    res.json({
      response: formatted,
      data: result.rows,
      explanation,
      query_executed: sql
    });
    
  } catch (error) {
    console.error('[API] Calendar query error:', error);
    res.status(500).json({ error: 'calendar_query_failed', message: error.message });
  }
});

// POST /api/teams/query - Query Teams with natural language
app.post('/api/teams/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query_required' });
    }
    
    console.log(`[API] Teams query: "${query}"`);
    
    const { sql, params, explanation } = await generateTeamsQuery(query);
    const result = await pool.query(sql, params || []);
    const formatted = await formatTeamsResults(result.rows, query);
    
    res.json({
      response: formatted,
      data: result.rows,
      explanation,
      query_executed: sql
    });
    
  } catch (error) {
    console.error('[API] Teams query error:', error);
    res.status(500).json({ error: 'teams_query_failed', message: error.message });
  }
});

// ============================================================================
// DOCUMENT ACCESS API - OneDrive & SharePoint
// ============================================================================

// GET /api/documents/drive/:email - Get user's OneDrive info
app.get('/api/documents/drive/:email', async (req, res) => {
  try {
    const userEmail = req.params.email;
    const driveInfo = await getUserDrive(userEmail);
    res.json(driveInfo);
  } catch (error) {
    console.error('[API] Get drive error:', error);
    res.status(500).json({ error: 'get_drive_failed', message: error.message });
  }
});

// GET /api/documents/list/:email - List OneDrive contents
app.get('/api/documents/list/:email', async (req, res) => {
  try {
    const userEmail = req.params.email;
    const { path = 'root', limit = 50 } = req.query;
    const contents = await listDriveContents(userEmail, path, parseInt(limit));
    res.json(contents);
  } catch (error) {
    console.error('[API] List contents error:', error);
    res.status(500).json({ error: 'list_contents_failed', message: error.message });
  }
});

// GET /api/documents/search/:email - Search OneDrive
app.get('/api/documents/search/:email', async (req, res) => {
  try {
    const userEmail = req.params.email;
    const { q, limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'missing_query', message: 'Query parameter "q" is required' });
    }
    
    const results = await searchDriveContents(userEmail, q, parseInt(limit));
    res.json(results);
  } catch (error) {
    console.error('[API] Search error:', error);
    res.status(500).json({ error: 'search_failed', message: error.message });
  }
});

// GET /api/documents/file/:email/:fileId - Get file metadata
app.get('/api/documents/file/:email/:fileId', async (req, res) => {
  try {
    const { email: userEmail, fileId } = req.params;
    const metadata = await getFileMetadata(userEmail, fileId);
    res.json(metadata);
  } catch (error) {
    console.error('[API] Get file metadata error:', error);
    res.status(500).json({ error: 'get_metadata_failed', message: error.message });
  }
});

// GET /api/documents/download/:email/:fileId - Get file download URL
app.get('/api/documents/download/:email/:fileId', async (req, res) => {
  try {
    const { email: userEmail, fileId } = req.params;
    const downloadInfo = await getFileDownloadUrl(userEmail, fileId);
    res.json(downloadInfo);
  } catch (error) {
    console.error('[API] Get download URL error:', error);
    res.status(500).json({ error: 'get_download_failed', message: error.message });
  }
});

// GET /api/documents/sharepoint - List SharePoint sites
app.get('/api/documents/sharepoint', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const sites = await listSharePointSites(parseInt(limit));
    res.json(sites);
  } catch (error) {
    console.error('[API] List SharePoint sites error:', error);
    res.status(500).json({ error: 'list_sharepoint_failed', message: error.message });
  }
});

// GET /api/documents/folders/:email - Get specific folders by name
app.get('/api/documents/folders/:email', async (req, res) => {
  try {
    const userEmail = req.params.email;
    const { names } = req.query;
    
    if (!names) {
      return res.status(400).json({ error: 'missing_names', message: 'Query parameter "names" is required (comma-separated folder names)' });
    }
    
    const folderNames = names.split(',').map(n => n.trim());
    const folders = await getFoldersByName(userEmail, folderNames);
    res.json(folders);
  } catch (error) {
    console.error('[API] Get folders error:', error);
    res.status(500).json({ error: 'get_folders_failed', message: error.message });
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
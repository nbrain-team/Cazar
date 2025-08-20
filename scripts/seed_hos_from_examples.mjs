import fs from 'fs/promises';
import crypto from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import pg from 'pg';
import { DateTime } from 'luxon';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function findHeaderIndex(records) {
  for (let i = 0; i < Math.min(records.length, 20); i++) {
    const row = records[i].map((c) => String(c || '').trim());
    if (row[0] === 'Employee' && row.includes('Total Days')) return i;
  }
  return -1;
}

function parseDayHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const s = String(h || '').trim();
    if (/^[A-Z][a-z]{2}\s\d{2},\s\d{4}$/.test(s)) {
      map[idx] = { label: s, isDay: true };
    }
  });
  return map;
}

function detectWeekLabel(records) {
  for (const row of records.slice(0, 3)) {
    const first = String(row[0] || '');
    const m = /Week\s+(\d{1,2})/i.exec(first);
    if (m) return `Week ${m[1]}`;
  }
  return undefined;
}

function deriveSegmentsFromCell(cell, serviceDate, tz) {
  const text = String(cell || '').trim();
  const segments = [];
  if (!text || text === '0') return segments;
  const hasTimeRange = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(text);
  let start, end;
  if (hasTimeRange) {
    const [_, a, b] = hasTimeRange;
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    start = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: ah, minute: am });
    end = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: bh, minute: bm });
    if (end <= start) end = end.plus({ days: 1 });
  } else {
    const hoursMatch = /(\d{1,2}(?:\.\d{1,2})?)/.exec(text);
    const hrs = hoursMatch ? Number(hoursMatch[1]) : 10;
    start = DateTime.fromISO(serviceDate, { zone: tz }).set({ hour: 8, minute: 0 });
    end = start.plus({ hours: isFinite(hrs) ? hrs : 10 });
  }
  segments.push({ duty_type: 'scheduled', start, end, confidence: 0.7 });
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

async function processCsv(client, filepath) {
  const buffer = await fs.readFile(filepath);
  const digest = sha256(buffer);
  const exists = await client.query('SELECT id FROM uploads WHERE sha256_digest=$1', [digest]);
  if (exists.rows.length) {
    console.log(`Skip duplicate ${filepath}`);
    return { uploadId: exists.rows[0].id, ingestedRows: 0, segments: 0, routesDays: 0 };
  }
  const records = csvParse(buffer.toString('utf8'), { relaxColumnCount: true });
  const headerIdx = findHeaderIndex(records);
  if (headerIdx < 0) throw new Error('header_not_found');
  const header = records[headerIdx];
  const dayCols = parseDayHeaders(header);
  const weekLabel = detectWeekLabel(records);
  const ins = await client.query(
    `INSERT INTO uploads (filename, sha256_digest, source, week_label) VALUES ($1,$2,'timecard_csv',$3) RETURNING id` ,
    [filepath.split('/').pop(), digest, weekLabel || null]
  );
  const uploadId = ins.rows[0].id;
  let ingestedRows = 0; let segs = 0; let routesDays = 0;
  // Find Totaled Scheduled row to derive staffing per day
  let totalsRow = null;
  for (let r = headerIdx + 1; r < records.length; r++) {
    const row0 = String(records[r][0] || '').trim();
    if (row0 === 'Totaled Scheduled') { totalsRow = records[r]; break; }
  }
  if (totalsRow) {
    for (const [idx, meta] of Object.entries(dayCols)) {
      if (!meta.isDay) continue;
      const n = Number(String(totalsRow[Number(idx)] || '').replace(/,/g, ''));
      const d = DateTime.fromFormat(String(header[Number(idx)]).replace(/"/g, ''), 'MMM dd, yyyy').toISODate();
      if (!isNaN(n) && d) {
        await client.query(
          `INSERT INTO routes_day (service_date, station_id, routes_assigned, routes_staffed_dsp_only, routes_staffed_inclusive, source, upload_id)
           VALUES ($1,$2,$3,$4,$5,'import',$6)`,
          [d, null, null, n, n, uploadId]
        );
        routesDays++;
      }
    }
  }
  for (let r = headerIdx + 1; r < records.length; r++) {
    const row = records[r];
    const employee = String(row[0] || '').trim();
    if (!employee) continue;
    if (employee === 'Totaled Scheduled') break;
    const transporter = String(row[1] || '').trim() || null;
    const driverId = await upsertDriver(client, employee, transporter);
    for (const [idx, meta] of Object.entries(dayCols)) {
      if (!meta.isDay) continue;
      const cell = row[Number(idx)];
      if (!cell) continue;
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
  console.log(`Ingested ${filepath}: rows=${ingestedRows}, segments=${segs}, routes_day=${routesDays}`);
  return { uploadId, ingestedRows, segments: segs, routesDays };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL required'); process.exit(1); }
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const files = ['example1.csv', 'example2.csv'];
    for (const f of files) {
      const p = new URL('file://' + process.cwd() + '/' + f).pathname;
      await processCsv(client, p);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();



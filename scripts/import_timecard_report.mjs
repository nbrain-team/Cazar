import fs from 'fs/promises';
import crypto from 'crypto';
import pg from 'pg';
import { parse as csvParse } from 'csv-parse/sync';
import { DateTime } from 'luxon';

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const filePath = process.argv[2];
  if (!dbUrl) { console.error('DATABASE_URL required'); process.exit(1); }
  if (!filePath) { console.error('Usage: node scripts/import_timecard_report.mjs "Timecard Report.csv"'); process.exit(1); }
  const buffer = await fs.readFile(filePath);
  let records;
  try {
    records = csvParse(buffer.toString('utf8'), { relaxColumnCount: true, relaxQuotes: true, skipEmptyLines: true, bom: true, trim: true });
  } catch (e) {
    records = csvParse(buffer.toString('utf8'), { relaxColumnCount: true, relaxQuotes: true, skipEmptyLines: true, bom: true, trim: true, quote: '\u0000' });
  }
  if (!records || !records.length) { console.error('Empty CSV'); process.exit(1); }
  const header = records[0].map(h => String(h || '').replace(/"/g,'').trim());
  const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iLast = idx('Last Name');
  const iFirst = idx('First Name');
  const iPos = idx('Position ID');
  const iIn = idx('In time');
  const iOut = idx('Out time');
  if ([iLast,iFirst,iPos,iIn,iOut].some(x => x < 0)) { console.error('Missing required columns'); process.exit(1); }

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const digest = sha256(buffer);
    let uploadId;
    await client.query('SAVEPOINT sp_upload');
    try {
      const ins = await client.query(`INSERT INTO uploads (filename, sha256_digest, source, week_label) VALUES ($1,$2,'timecard_csv',NULL) RETURNING id`, [filePath.split('/').pop(), digest]);
      uploadId = ins.rows[0].id;
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT sp_upload');
      const sel = await client.query(`SELECT id FROM uploads WHERE sha256_digest=$1`, [digest]);
      uploadId = sel.rows[0]?.id;
    }
    let rowsIngested = 0, segs = 0, skipped = 0;
    for (let li = 1; li < records.length; li++) {
      const row = records[li];
      if (!row || !row.length) continue;
      const posId = String(row[iPos] || '').trim();
      const fName = String(row[iFirst] || '').trim();
      const lName = String(row[iLast] || '').trim();
      const inStr = String(row[iIn] || '').trim();
      const outStr = String(row[iOut] || '').trim();
      if (!posId || !inStr || !outStr) { skipped++; continue; }
      const driverId = posId; const fullName = `${fName} ${lName}`.trim();
      await client.query('SAVEPOINT sp_row');
      try {
        await client.query(
          `INSERT INTO drivers (driver_id, driver_name, driver_status, employment_status, created_at, updated_at)
           VALUES ($1,$2,'active','active', NOW(), NOW())
           ON CONFLICT (driver_id) DO UPDATE SET driver_name=EXCLUDED.driver_name, updated_at=NOW()`,
          [driverId, fullName || driverId]
        );
        const tz = 'America/Los_Angeles';
        let start = DateTime.fromFormat(inStr, 'MM/dd/yyyy hh:mm:ss a', { zone: tz });
        if (!start.isValid) start = DateTime.fromFormat(inStr, 'MM/dd/yyyy hh:mm a', { zone: tz });
        let end = DateTime.fromFormat(outStr, 'MM/dd/yyyy hh:mm:ss a', { zone: tz });
        if (!end.isValid) end = DateTime.fromFormat(outStr, 'MM/dd/yyyy hh:mm a', { zone: tz });
        if (!start.isValid || !end.isValid) { await client.query('ROLLBACK TO SAVEPOINT sp_row'); skipped++; continue; }
        const startUtc = start.toUTC(); const endAdj = end <= start ? end.plus({ days: 1 }) : end; const endUtc = endAdj.toUTC();
        await client.query(
          `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
           VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
          [driverId, uploadId, startUtc.toISO(), endUtc.toISO(), JSON.stringify({ src: 'timecard_report', line: li })]
        );
        segs++; rowsIngested++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_row');
        skipped++;
      }
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, rows: rowsIngested, segments: segs, skipped, upload_id: uploadId }));
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



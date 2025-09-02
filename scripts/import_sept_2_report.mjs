import fs from 'fs/promises';
import crypto from 'crypto';
import pg from 'pg';
import { parse as csvParse } from 'csv-parse/sync';
import { DateTime } from 'luxon';

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

async function main() {
  // Use the live database URL from render.yaml
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node scripts/import_sept_2_report.mjs "sept-2-report.csv"'); process.exit(1); }
  
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
  const iOutType = idx('Out Punch Type');
  if ([iLast,iFirst,iPos,iIn,iOut].some(x => x < 0)) { console.error('Missing required columns'); process.exit(1); }

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create upload record
    const digest = sha256(buffer);
    const filename = filePath.split('/').pop();
    let uploadId;
    
    // Always create a new upload record for tracking
    const ins = await client.query(
      `INSERT INTO uploads (filename, sha256_digest, source, week_label) VALUES ($1,$2,'timecard_csv','sept-2-update') RETURNING id`, 
      [filename, digest]
    );
    uploadId = ins.rows[0].id;
    
    let rowsIngested = 0, segs = 0, skipped = 0, duplicates = 0;
    
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
        // Update or insert driver
        await client.query(
          `INSERT INTO drivers (driver_id, driver_name, driver_status, employment_status, created_at, updated_at)
           VALUES ($1,$2,'active','active', NOW(), NOW())
           ON CONFLICT (driver_id) DO UPDATE SET driver_name=EXCLUDED.driver_name, updated_at=NOW()`,
          [driverId, fullName || driverId]
        );
        
        // Parse dates
        const tz = 'America/Los_Angeles';
        const tryFormats = ['M/d/yyyy H:mm','M/d/yyyy h:mm','MM/dd/yyyy HH:mm','MM/dd/yyyy hh:mm','M/d/yyyy hh:mm a','MM/dd/yyyy hh:mm a','M/d/yyyy hh:mm:ss a','MM/dd/yyyy hh:mm:ss a'];
        let start = DateTime.invalid('init'); 
        for (const fmt of tryFormats) { 
          start = DateTime.fromFormat(inStr, fmt, { zone: tz }); 
          if (start.isValid) break; 
        }
        let end = DateTime.invalid('init'); 
        for (const fmt of tryFormats) { 
          end = DateTime.fromFormat(outStr, fmt, { zone: tz }); 
          if (end.isValid) break; 
        }
        
        if (!start.isValid || !end.isValid) { 
          await client.query('ROLLBACK TO SAVEPOINT sp_row'); 
          skipped++; 
          continue; 
        }
        
        const startUtc = start.toUTC(); 
        const endAdj = end <= start ? end.plus({ days: 1 }) : end; 
        const endUtc = endAdj.toUTC();
        
        // Check for duplicate entry
        const dupCheck = await client.query(
          `SELECT id FROM on_duty_segments 
           WHERE driver_id = $1 
           AND start_utc = $2 
           AND end_utc = $3 
           AND duty_type = 'worked'`,
          [driverId, startUtc.toISO(), endUtc.toISO()]
        );
        
        if (dupCheck.rows.length > 0) {
          // Duplicate found, skip this entry
          await client.query('ROLLBACK TO SAVEPOINT sp_row');
          duplicates++;
          continue;
        }
        
        // Insert new segment
        await client.query(
          `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
           VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
          [driverId, uploadId, startUtc.toISO(), endUtc.toISO(), JSON.stringify({ src: 'sept-2-report', line: li })]
        );
        segs++; 
        rowsIngested++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_row');
        console.error(`Error on line ${li}:`, e.message);
        skipped++;
      }
    }
    
    await client.query('COMMIT');
    console.log(JSON.stringify({ 
      ok: true, 
      rows: rowsIngested, 
      segments: segs, 
      skipped, 
      duplicates,
      upload_id: uploadId,
      total_processed: records.length - 1
    }));
    
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();

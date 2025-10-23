#!/usr/bin/env node
import fs from 'fs';
import pg from 'pg';
import { DateTime } from 'luxon';

const dbUrl = process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub";

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

async function importTimecards(csvPath) {
  console.log(`\n📋 Importing historical timecards from: ${csvPath}\n`);
  
  const pool = new pg.Pool({ 
    connectionString: dbUrl, 
    ssl: { rejectUnauthorized: false } 
  });
  
  const client = await pool.connect();
  
  try {
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = fileContent.split('\n').filter(l => l.trim());
    
    console.log(`📄 Total lines: ${lines.length}`);
    
    // Skip header
    const dataLines = lines.slice(1);
    console.log(`📊 Data rows: ${dataLines.length}\n`);
    
    let inserted = 0, updated = 0, skipped = 0;
    let batchCount = 0;
    const batchSize = 100;
    
    // Start first batch
    await client.query('BEGIN');
    
    for (let i = 0; i < dataLines.length; i++) {
      try {
        const values = parseCSVLine(dataLines[i]);
        
        // CSV columns: Company Code, Last Name, First Name, Position ID, Worked Department, 
        //              Clock In ID, Clock Out ID, State, In time, Out time, Out Punch Type, Hours, Pay Code
        const lastName = values[1];
        const firstName = values[2];
        const positionId = values[3];
        const inTimeStr = values[8];
        const outTimeStr = values[9];
        const hoursStr = values[11];
        
        // Skip if missing critical data
        if (!inTimeStr || !outTimeStr || !hoursStr) {
          skipped++;
          continue;
        }
        
        // Parse times (format: "MM/DD/YYYY HH:MM:SS AM/PM")
        const inTime = DateTime.fromFormat(inTimeStr, 'MM/dd/yyyy hh:mm:ss a', { zone: 'America/New_York' });
        const outTime = DateTime.fromFormat(outTimeStr, 'MM/dd/yyyy hh:mm:ss a', { zone: 'America/New_York' });
        
        if (!inTime.isValid || !outTime.isValid) {
          skipped++;
          continue;
        }
        
        const hours = parseFloat(hoursStr);
        const date = inTime.toISODate();
        const driverName = `${lastName}, ${firstName}`;
        
        // Find or create driver in database by name
        let driverResult = await client.query(
          `SELECT driver_id FROM drivers WHERE driver_name = $1 LIMIT 1`,
          [driverName]
        );
        
        let employeeId;
        if (driverResult.rows.length > 0) {
          employeeId = driverResult.rows[0].driver_id;
        } else {
          // Create driver if not found
          employeeId = `CSV-${positionId}`;
          await client.query(
            `INSERT INTO drivers (driver_id, driver_name, driver_status, created_at, updated_at)
             VALUES ($1, $2, 'active', NOW(), NOW())
             ON CONFLICT (driver_id) DO NOTHING`,
            [employeeId, driverName]
          );
        }
        
        // Create unique timecard ID
        const timecardId = `${employeeId}-${date}-${i}`;
        
        // Insert timecard
        const result = await client.query(
          `INSERT INTO timecards (
            timecard_id,
            employee_id,
            clock_in_time,
            clock_out_time,
            total_hours_worked,
            date,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (timecard_id)
          DO UPDATE SET
            clock_out_time = EXCLUDED.clock_out_time,
            total_hours_worked = EXCLUDED.total_hours_worked,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted`,
          [timecardId, employeeId, inTime.toJSDate(), outTime.toJSDate(), hours, date]
        );
        
        if (result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
        
        batchCount++;
        
        // Commit in batches to avoid long transactions
        if (batchCount >= batchSize) {
          await client.query('COMMIT');
          console.log(`  ✅ Committed batch (total: ${inserted + updated})`);
          await client.query('BEGIN');
          batchCount = 0;
        }
      } catch (err) {
        // Log first 5 errors to understand what's failing
        if (skipped < 5) {
          console.error(`  ⚠️  Error on line ${i + 2}: ${err.message}`);
        }
        skipped++;
      }
    }
    
    // Commit final batch
    if (batchCount > 0) {
      await client.query('COMMIT');
    }
    
    console.log(`\n📊 Import Summary:`);
    console.log(`   ✅ Inserted: ${inserted}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ⚠️  Skipped: ${skipped}`);
    console.log(`\n✅ Historical timecards imported successfully!\n`);
    
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors
    }
    console.error(`\n❌ Import failed: ${err.message}`);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run import
const csvPath = process.argv[2] || 'Timecard Report.csv';
importTimecards(csvPath).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


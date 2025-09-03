import fs from 'fs/promises';
import pg from 'pg';
import { parse as csvParse } from 'csv-parse/sync';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node scripts/import_schedule_predictions.mjs "sept3-schedule.csv"'); process.exit(1); }
  
  console.log('📅 Importing schedule predictions...');
  const buffer = await fs.readFile(filePath);
  const records = csvParse(buffer.toString('utf8'), { 
    relaxColumnCount: true, 
    relaxQuotes: true, 
    skipEmptyLines: true, 
    bom: true, 
    trim: true 
  });
  
  if (!records || records.length < 2) { 
    console.error('Empty or invalid CSV'); 
    process.exit(1); 
  }
  
  const header = records[0];
  console.log('Header:', header);
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create schedule_predictions table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_predictions (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        driver_id VARCHAR(50) REFERENCES drivers(driver_id),
        schedule_date DATE NOT NULL,
        schedule_content TEXT,
        predicted_hours DECIMAL(4,2),
        source VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(driver_id, schedule_date)
      )
    `);
    
    // Get existing drivers for name matching
    const driversResult = await client.query('SELECT driver_id, driver_name FROM drivers');
    const drivers = driversResult.rows;
    
    // Create name lookup map
    const driverLookup = new Map();
    drivers.forEach(d => {
      const parts = d.driver_name.toLowerCase().split(' ');
      const firstName = parts[0] || '';
      const lastName = parts[parts.length - 1] || '';
      
      // Store multiple lookup keys
      driverLookup.set(`${firstName} ${lastName}`, d.driver_id);
      driverLookup.set(`${lastName} ${firstName}`, d.driver_id);
      driverLookup.set(`${firstName},${lastName}`, d.driver_id);
      driverLookup.set(`${lastName},${firstName}`, d.driver_id);
    });
    
    console.log(`Found ${drivers.length} drivers in database`);
    
    let processed = 0;
    let matched = 0;
    let unmatched = [];
    
    // Process each row
    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      if (!row || row.length < 3) continue;
      
      const firstName = String(row[0] || '').trim();
      const lastName = String(row[1] || '').trim();
      
      if (!firstName || !lastName) continue;
      
      // Try to match driver
      const lookupKeys = [
        `${firstName.toLowerCase()} ${lastName.toLowerCase()}`,
        `${lastName.toLowerCase()} ${firstName.toLowerCase()}`,
        `${firstName.toLowerCase()},${lastName.toLowerCase()}`,
        `${lastName.toLowerCase()},${firstName.toLowerCase()}`
      ];
      
      let driverId = null;
      for (const key of lookupKeys) {
        if (driverLookup.has(key)) {
          driverId = driverLookup.get(key);
          break;
        }
      }
      
      if (!driverId) {
        // Try partial match
        const searchName = `${firstName} ${lastName}`.toLowerCase();
        const matchedDriver = drivers.find(d => 
          d.driver_name.toLowerCase().includes(firstName.toLowerCase()) && 
          d.driver_name.toLowerCase().includes(lastName.toLowerCase())
        );
        if (matchedDriver) {
          driverId = matchedDriver.driver_id;
        }
      }
      
      if (!driverId) {
        unmatched.push(`${firstName} ${lastName}`);
        continue;
      }
      
      matched++;
      
      // Process schedule dates (columns 2-5)
      for (let col = 2; col < Math.min(6, row.length); col++) {
        const dateStr = header[col];
        const content = String(row[col] || '').trim();
        
        if (!content || !dateStr) continue;
        
        // Parse date from header
        const scheduleDate = DateTime.fromFormat(dateStr, 'MMM dd, yyyy', { zone: 'America/Los_Angeles' });
        if (!scheduleDate.isValid) {
          console.warn(`Invalid date format: ${dateStr}`);
          continue;
        }
        
        // Estimate hours based on content
        let predictedHours = 4; // Default minimum
        
        // Look for explicit hour indicators
        const hourMatch = content.match(/(\d+)\s*hr/i);
        if (hourMatch) {
          predictedHours = parseInt(hourMatch[1]);
        } else if (content.toLowerCase().includes('10hr')) {
          predictedHours = 10;
        } else if (content.toLowerCase().includes('8hr')) {
          predictedHours = 8;
        } else if (content.toLowerCase().includes('mod')) {
          predictedHours = 10; // MOD shifts are typically longer
        } else if (content.includes(',')) {
          // Multiple shifts in a day
          const shifts = content.split(',').length;
          predictedHours = Math.max(4 * shifts, 8); // Assume minimum 4hr per shift, max 8hr for multiple
        }
        
        // Insert or update schedule prediction
        await client.query(`
          INSERT INTO schedule_predictions (driver_id, schedule_date, schedule_content, predicted_hours, source)
          VALUES ($1, $2, $3, $4, 'sept3-schedule')
          ON CONFLICT (driver_id, schedule_date) 
          DO UPDATE SET 
            schedule_content = EXCLUDED.schedule_content,
            predicted_hours = EXCLUDED.predicted_hours,
            source = EXCLUDED.source,
            created_at = NOW()
        `, [driverId, scheduleDate.toFormat('yyyy-MM-dd'), content, predictedHours]);
        
        processed++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('\n✅ Schedule import completed!');
    console.log(`   Drivers matched: ${matched}`);
    console.log(`   Schedule entries created: ${processed}`);
    console.log(`   Unmatched drivers: ${unmatched.length}`);
    
    if (unmatched.length > 0) {
      console.log('\n⚠️  Unmatched drivers (not in database):');
      unmatched.slice(0, 10).forEach(name => console.log(`   - ${name}`));
      if (unmatched.length > 10) {
        console.log(`   ... and ${unmatched.length - 10} more`);
      }
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

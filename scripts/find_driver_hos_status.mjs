import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const searchName = process.argv[2] || 'Jesse Cunningham';
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Searching for driver: ${searchName}\n`);
    
    // Search for driver by name
    const driverResult = await client.query(
      `SELECT driver_id, driver_name 
       FROM drivers 
       WHERE driver_name ILIKE $1
       ORDER BY driver_name`,
      [`%${searchName}%`]
    );
    
    if (driverResult.rows.length === 0) {
      console.log('No matching drivers found!');
      return;
    }
    
    console.log('Found drivers:');
    for (const driver of driverResult.rows) {
      console.log(`  ${driver.driver_id}: ${driver.driver_name}`);
      
      // Get recent work segments
      const segmentsResult = await client.query(
        `SELECT 
           start_utc,
           end_utc,
           timezone('America/Los_Angeles', start_utc) as start_local,
           timezone('America/Los_Angeles', end_utc) as end_local,
           EXTRACT(EPOCH FROM (end_utc - start_utc)) / 3600 as hours
         FROM on_duty_segments
         WHERE driver_id = $1
         AND start_utc >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY start_utc DESC
         LIMIT 10`,
        [driver.driver_id]
      );
      
      console.log('\n  Recent work segments:');
      for (const seg of segmentsResult.rows) {
        const start = DateTime.fromJSDate(seg.start_local);
        const end = DateTime.fromJSDate(seg.end_local);
        console.log(`    ${start.toFormat('MM/dd HH:mm')} - ${end.toFormat('HH:mm')} (${Number(seg.hours).toFixed(2)}h)`);
      }
      
      // Get recent breaks
      const breaksResult = await client.query(
        `SELECT 
           label,
           start_utc,
           end_utc,
           timezone('America/Los_Angeles', start_utc) as start_local,
           timezone('America/Los_Angeles', end_utc) as end_local,
           EXTRACT(EPOCH FROM (end_utc - start_utc)) / 60 as minutes,
           source_row_ref
         FROM break_segments
         WHERE driver_id = $1
         AND start_utc >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY start_utc DESC
         LIMIT 10`,
        [driver.driver_id]
      );
      
      console.log('\n  Recent breaks:');
      for (const brk of breaksResult.rows) {
        const start = DateTime.fromJSDate(brk.start_local);
        const end = DateTime.fromJSDate(brk.end_local);
        const source = brk.source_row_ref ? (typeof brk.source_row_ref === 'string' ? JSON.parse(brk.source_row_ref) : brk.source_row_ref) : null;
        const inferred = source && source.inferred ? ' (inferred)' : '';
        console.log(`    ${brk.label}: ${start.toFormat('MM/dd HH:mm')} - ${end.toFormat('HH:mm')} (${Number(brk.minutes).toFixed(0)}min)${inferred}`);
      }
      
      console.log('\n');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.release();
    await pool.end();
  }
}

main().catch(console.error);

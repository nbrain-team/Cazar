import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const driverId = process.argv[2] || 'LSW001202';
  const checkDate = process.argv[3] || '2025-09-01';
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Debugging times for driver ${driverId} on ${checkDate}\n`);
    
    // Check on_duty_segments for this day
    console.log('📋 On-duty segments:');
    const segResult = await client.query(`
      SELECT 
        id,
        start_utc,
        end_utc,
        timezone('America/Los_Angeles', start_utc) as start_local,
        timezone('America/Los_Angeles', end_utc) as end_local,
        EXTRACT(EPOCH FROM (end_utc - start_utc)) / 3600.0 as hours
      FROM on_duty_segments
      WHERE driver_id = $1
        AND start_utc::date = $2::date
      ORDER BY start_utc
    `, [driverId, checkDate]);
    
    segResult.rows.forEach(seg => {
      console.log(`  ID: ${seg.id}`);
      console.log(`    UTC: ${seg.start_utc} to ${seg.end_utc}`);
      console.log(`    Local: ${seg.start_local} to ${seg.end_local}`);
      console.log(`    Duration: ${Number(seg.hours).toFixed(2)}h\n`);
    });
    
    // Check break segments for this day
    console.log('🍽️  Break segments:');
    const breakResult = await client.query(`
      SELECT 
        id,
        label,
        start_utc,
        end_utc,
        timezone('America/Los_Angeles', start_utc) as start_local,
        timezone('America/Los_Angeles', end_utc) as end_local,
        EXTRACT(EPOCH FROM (end_utc - start_utc)) / 60.0 as minutes,
        source_row_ref
      FROM break_segments
      WHERE driver_id = $1
        AND start_utc::date = $2::date
      ORDER BY start_utc
    `, [driverId, checkDate]);
    
    if (breakResult.rows.length === 0) {
      console.log('  No breaks on this date\n');
    } else {
      breakResult.rows.forEach(brk => {
        console.log(`  ${brk.label}:`);
        console.log(`    UTC: ${brk.start_utc} to ${brk.end_utc}`);
        console.log(`    Local: ${brk.start_local} to ${brk.end_local}`);
        console.log(`    Duration: ${Number(brk.minutes).toFixed(0)}min\n`);
      });
    }
    
    // Run the daily calculation query
    console.log('📊 Daily calculation (with timezone handling):');
    const dailyResult = await client.query(`
      WITH bounds AS (
        SELECT 
          ($1::date AT TIME ZONE 'America/Los_Angeles') AS day_start_utc,
          (($1::date + interval '1 day') AT TIME ZONE 'America/Los_Angeles') AS day_end_utc
      )
      SELECT 
        b.day_start_utc,
        b.day_end_utc,
        COUNT(s.*) as segment_count,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (
            LEAST(s.end_utc, b.day_end_utc) - GREATEST(s.start_utc, b.day_start_utc)
          ))
        ) / 3600.0, 0) AS total_hours
      FROM bounds b
      LEFT JOIN on_duty_segments s ON 
        s.driver_id = $2 AND
        s.end_utc > b.day_start_utc AND 
        s.start_utc < b.day_end_utc
      GROUP BY b.day_start_utc, b.day_end_utc
    `, [checkDate, driverId]);
    
    const calc = dailyResult.rows[0];
    console.log(`  Day boundaries (UTC): ${calc.day_start_utc} to ${calc.day_end_utc}`);
    console.log(`  Segments overlapping this day: ${calc.segment_count}`);
    console.log(`  Total hours calculated: ${Number(calc.total_hours).toFixed(2)}h`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

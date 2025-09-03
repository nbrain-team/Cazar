import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const driverId = process.argv[2] || 'LSW001202';
  const checkDate = process.argv[3] || '2025-09-01';
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Debugging meal logic for driver ${driverId} on ${checkDate}\n`);
    
    // Parameters from server/index.mjs
    const tz = 'America/Los_Angeles';
    const meal_min_minutes = 30;
    const meal_required_by_hour = 6;
    
    // Get the day boundaries
    const day_start = DateTime.fromISO(checkDate, { zone: tz }).startOf('day');
    const day_end = day_start.plus({ days: 1 });
    const day_start_utc = day_start.toUTC();
    const day_end_utc = day_end.toUTC();
    
    console.log('Day boundaries:');
    console.log(`  Local: ${day_start.toISO()} to ${day_end.toISO()}`);
    console.log(`  UTC: ${day_start_utc.toISO()} to ${day_end_utc.toISO()}\n`);
    
    // Get all work segments for this day
    const segResult = await client.query(`
      SELECT 
        start_utc,
        end_utc,
        EXTRACT(EPOCH FROM (end_utc - start_utc)) / 3600 as hours
      FROM on_duty_segments
      WHERE driver_id = $1
      AND start_utc < $3
      AND end_utc > $2
      ORDER BY start_utc`,
      [driverId, day_start_utc.toISO(), day_end_utc.toISO()]
    );
    
    console.log('Work segments for the day:');
    let first_start_utc = null;
    let total_hours = 0;
    
    for (const seg of segResult.rows) {
      const start = DateTime.fromISO(seg.start_utc);
      const end = DateTime.fromISO(seg.end_utc);
      
      // Calculate overlap with the day
      const overlap_start = DateTime.max(start, day_start_utc);
      const overlap_end = DateTime.min(end, day_end_utc);
      const overlap_hours = overlap_end.diff(overlap_start, 'hours').hours;
      
      if (!first_start_utc || start < first_start_utc) {
        first_start_utc = start;
      }
      
      total_hours += overlap_hours;
      
      console.log(`  ${start.toISO()} - ${end.toISO()} (${Number(seg.hours).toFixed(2)}h, overlap: ${overlap_hours.toFixed(2)}h)`);
    }
    
    console.log(`\nTotal hours worked: ${total_hours.toFixed(2)}`);
    console.log(`First start UTC: ${first_start_utc ? first_start_utc.toISO() : 'N/A'}`);
    
    // Get qualifying meal breaks (>= 30 minutes)
    const breakResult = await client.query(`
      SELECT 
        label,
        start_utc,
        end_utc,
        EXTRACT(EPOCH FROM (end_utc - start_utc)) / 60 as minutes
      FROM break_segments
      WHERE driver_id = $1
      AND start_utc >= $2
      AND end_utc <= $3
      AND EXTRACT(EPOCH FROM (end_utc - start_utc)) / 60 >= $4
      ORDER BY start_utc`,
      [driverId, day_start_utc.toISO(), day_end_utc.toISO(), meal_min_minutes]
    );
    
    console.log(`\nQualifying meal breaks (>= ${meal_min_minutes} minutes):`);
    let earliest_qual_meal_start = null;
    
    for (const brk of breakResult.rows) {
      const start = DateTime.fromISO(brk.start_utc);
      const end = DateTime.fromISO(brk.end_utc);
      
      if (!earliest_qual_meal_start || start < earliest_qual_meal_start) {
        earliest_qual_meal_start = start;
      }
      
      console.log(`  ${brk.label}: ${start.toISO()} - ${end.toISO()} (${Number(brk.minutes).toFixed(0)}min)`);
    }
    
    // Check meal compliance
    console.log('\nMeal compliance check:');
    console.log(`  Hours worked: ${total_hours.toFixed(2)}`);
    console.log(`  Meal required after: ${meal_required_by_hour} hours`);
    console.log(`  Meal required: ${total_hours >= meal_required_by_hour ? 'YES' : 'NO'}`);
    
    if (total_hours >= meal_required_by_hour) {
      console.log(`  Qualifying meal exists: ${breakResult.rows.length > 0 ? 'YES' : 'NO'}`);
      
      if (breakResult.rows.length > 0 && first_start_utc && earliest_qual_meal_start) {
        const meal_deadline = first_start_utc.plus({ hours: meal_required_by_hour });
        const meal_on_time = earliest_qual_meal_start <= meal_deadline;
        
        console.log(`  First start: ${first_start_utc.toISO()}`);
        console.log(`  Meal deadline: ${meal_deadline.toISO()}`);
        console.log(`  Earliest meal: ${earliest_qual_meal_start.toISO()}`);
        console.log(`  Meal on time: ${meal_on_time ? 'YES' : 'NO'}`);
      }
    }
    
    // Show the actual query used in the server
    console.log('\n📊 Running server query for this day:');
    const serverResult = await client.query(`
      WITH day_calc AS (
        SELECT 
          $2::date AS day_local,
          ($2::date AT TIME ZONE $3) AS day_start_utc,
          (($2::date + interval '1 day') AT TIME ZONE $3) AS day_end_utc
      )
      SELECT 
        ROUND(SUM(
          EXTRACT(EPOCH FROM (
            LEAST(o.end_utc, dc.day_end_utc) - 
            GREATEST(o.start_utc, dc.day_start_utc)
          )) / 3600
        )::numeric, 2) AS hours,
        MIN(o.start_utc) FILTER (WHERE o.start_utc >= dc.day_start_utc) AS first_start_utc,
        EXISTS (
          SELECT 1 FROM break_segments b
          WHERE b.driver_id = $1
          AND b.start_utc >= dc.day_start_utc
          AND b.end_utc <= dc.day_end_utc
          AND EXTRACT(EPOCH FROM (b.end_utc - b.start_utc)) / 60 >= $4
        ) AS qual_meal_exists,
        MIN(b.start_utc) AS earliest_qual_meal_start
      FROM day_calc dc
      CROSS JOIN on_duty_segments o
      LEFT JOIN break_segments b ON 
        b.driver_id = o.driver_id 
        AND b.start_utc >= dc.day_start_utc
        AND b.end_utc <= dc.day_end_utc
        AND EXTRACT(EPOCH FROM (b.end_utc - b.start_utc)) / 60 >= $4
      WHERE o.driver_id = $1
      AND o.start_utc < dc.day_end_utc
      AND o.end_utc > dc.day_start_utc
      GROUP BY dc.day_start_utc, dc.day_end_utc`,
      [driverId, checkDate, tz, meal_min_minutes]
    );
    
    const r = serverResult.rows[0];
    console.log('Server query results:');
    console.log(`  hours: ${r.hours}`);
    console.log(`  first_start_utc: ${r.first_start_utc}`);
    console.log(`  qual_meal_exists: ${r.qual_meal_exists}`);
    console.log(`  earliest_qual_meal_start: ${r.earliest_qual_meal_start}`);
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.release();
    await pool.end();
  }
}

main().catch(console.error);

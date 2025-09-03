import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const driverId = process.argv[2] || 'LSW001202';
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Checking daily violations for driver: ${driverId}\n`);
    
    // Get driver info
    const driverResult = await client.query(
      'SELECT driver_id, driver_name FROM drivers WHERE driver_id = $1',
      [driverId]
    );
    
    if (driverResult.rows.length === 0) {
      console.log('Driver not found!');
      return;
    }
    
    const driver = driverResult.rows[0];
    console.log(`Driver: ${driver.driver_name} (${driver.driver_id})\n`);
    
    // Run the same logic as the HOS grid endpoint for this driver
    const meal_min_minutes = 30;
    const meal_required_by_hour = 6;
    
    const result = await client.query(`
      WITH days_local AS (
        SELECT generate_series(
          date_trunc('day', timezone('America/Los_Angeles', NOW())) - interval '6 days',
          date_trunc('day', timezone('America/Los_Angeles', NOW())),
          interval '1 day'
        ) AS day_local
      ),
      bounds AS (
        SELECT day_local,
               (day_local AT TIME ZONE 'America/Los_Angeles') AS day_start_utc,
               ((day_local + interval '1 day') AT TIME ZONE 'America/Los_Angeles') AS day_end_utc
          FROM days_local
      ),
      onday AS (
        SELECT b.day_start_utc, b.day_end_utc,
               COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(s.end_utc, b.day_end_utc) - GREATEST(s.start_utc, b.day_start_utc)))/3600.0),0) AS on_hours,
               MIN(CASE WHEN s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc THEN GREATEST(s.start_utc, b.day_start_utc) END) AS first_start_utc,
               MAX(CASE WHEN s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc THEN LEAST(s.end_utc, b.day_end_utc) END) AS last_end_utc
          FROM bounds b
          LEFT JOIN on_duty_segments s ON s.driver_id=$1 AND s.end_utc > b.day_start_utc AND s.start_utc < b.day_end_utc
         GROUP BY b.day_start_utc, b.day_end_utc
      ),
      brks AS (
        SELECT b.day_start_utc, b.day_end_utc,
               COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0),0) AS break_minutes,
               COALESCE(MAX(CASE WHEN EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0 >= $2 THEN 1 ELSE 0 END),0) AS qual_meal_exists,
               MIN(CASE WHEN EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0 >= $2 THEN br.start_utc END) AS earliest_qual_meal_start,
               COALESCE(MAX(CASE WHEN (br.source_row_ref ->> 'inferred') = 'true' AND EXTRACT(EPOCH FROM (LEAST(br.end_utc, b.day_end_utc) - GREATEST(br.start_utc, b.day_start_utc)))/60.0 >= $2 THEN 1 ELSE 0 END),0) AS inferred_meal_exists
          FROM bounds b
          LEFT JOIN break_segments br ON br.driver_id=$1 AND br.end_utc > b.day_start_utc AND br.start_utc < b.day_end_utc
         GROUP BY b.day_start_utc, b.day_end_utc
      ),
      combined AS (
        SELECT b.day_start_utc, b.day_end_utc, od.on_hours, od.first_start_utc, od.last_end_utc,
               br.break_minutes, br.qual_meal_exists, br.earliest_qual_meal_start, br.inferred_meal_exists
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
             inferred_meal_exists
        FROM combined
       ORDER BY day_start_utc;
    `, [driverId, meal_min_minutes]);
    
    console.log('📅 Daily Analysis:\n');
    
    result.rows.forEach((row, idx) => {
      const date = DateTime.fromISO(row.day);
      const label = idx === 0 ? 'D-6' : idx === 6 ? 'D' : `D-${6 - idx}`;
      const hours = Number(row.on_hours || 0);
      
      console.log(`${label} (${date.toFormat('MM/dd')}): ${hours.toFixed(2)}h worked`);
      
      if (hours >= meal_required_by_hour) {
        console.log(`  ⏰ Meal required (worked >= ${meal_required_by_hour}h)`);
        
        const qual = Number(row.qual_meal_exists || 0) === 1;
        const inferred = Number(row.inferred_meal_exists || 0) === 1;
        const breakMinutes = Number(row.break_minutes || 0);
        
        if (!qual) {
          console.log(`  ❌ VIOLATION: No qualifying meal break (>= ${meal_min_minutes}min)`);
          console.log(`     Total break time: ${breakMinutes.toFixed(0)}min`);
        } else {
          const firstStart = row.first_start_utc ? DateTime.fromISO(row.first_start_utc) : null;
          const earliestQual = row.earliest_qual_meal_start ? DateTime.fromISO(row.earliest_qual_meal_start) : null;
          const mealBy6Ok = !!(firstStart && earliestQual && earliestQual <= firstStart.plus({ hours: meal_required_by_hour }));
          
          console.log(`  ✅ Has qualifying meal (${breakMinutes.toFixed(0)}min total breaks)`);
          if (firstStart && earliestQual) {
            const hoursUntilMeal = earliestQual.diff(firstStart, 'hours').hours;
            console.log(`     First start: ${firstStart.toFormat('HH:mm')}`);
            console.log(`     Meal start: ${earliestQual.toFormat('HH:mm')} (${hoursUntilMeal.toFixed(1)}h after start)`);
            
            if (!mealBy6Ok) {
              console.log(`  ⚠️  AT RISK: Meal taken after ${meal_required_by_hour}h`);
            }
          }
          
          if (inferred) {
            console.log(`  📝 Note: Meal was inferred (not marked as LP)`);
          }
        }
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

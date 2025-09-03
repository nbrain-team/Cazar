import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const pool = new pg.Pool({ 
    connectionString: dbUrl, 
    ssl: { rejectUnauthorized: false } 
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🍽️  Checking lunch breaks in the database...\n');
    
    // Get total break segments
    const totalBreaks = await client.query(
      `SELECT COUNT(*) as count, 
              MIN(minutes) as min_minutes,
              MAX(minutes) as max_minutes,
              AVG(minutes) as avg_minutes
       FROM break_segments`
    );
    
    console.log(`📊 Total lunch breaks detected: ${totalBreaks.rows[0].count}`);
    console.log(`   Shortest break: ${totalBreaks.rows[0].min_minutes} minutes`);
    console.log(`   Longest break: ${totalBreaks.rows[0].max_minutes} minutes`);
    console.log(`   Average break: ${Math.round(totalBreaks.rows[0].avg_minutes)} minutes\n`);
    
    // Get breakdown by duration
    const durationBreakdown = await client.query(
      `WITH categorized AS (
         SELECT 
           CASE 
             WHEN minutes < 30 THEN 'Under 30 min'
             WHEN minutes >= 30 AND minutes < 45 THEN '30-44 min'
             WHEN minutes >= 45 AND minutes < 60 THEN '45-59 min'
             ELSE '60+ min'
           END as duration_range,
           CASE 
             WHEN minutes < 30 THEN 1
             WHEN minutes >= 30 AND minutes < 45 THEN 2
             WHEN minutes >= 45 AND minutes < 60 THEN 3
             ELSE 4
           END as sort_order
         FROM break_segments
       )
       SELECT duration_range, COUNT(*) as count
       FROM categorized
       GROUP BY duration_range, sort_order
       ORDER BY sort_order`
    );
    
    console.log('⏱️  Break duration breakdown:');
    durationBreakdown.rows.forEach(row => {
      console.log(`   ${row.duration_range}: ${row.count} breaks`);
    });
    
    // Get some sample breaks
    const sampleBreaks = await client.query(
      `SELECT 
         b.driver_id,
         d.driver_name,
         b.start_utc,
         b.end_utc,
         b.minutes,
         b.source_row_ref
       FROM break_segments b
       JOIN drivers d ON d.driver_id = b.driver_id
       WHERE b.source_row_ref::text LIKE '%inferred%'
       ORDER BY b.start_utc DESC
       LIMIT 10`
    );
    
    console.log('\n🔍 Sample of automatically detected lunch breaks:');
    sampleBreaks.rows.forEach(row => {
      const start = DateTime.fromJSDate(row.start_utc).setZone('America/Los_Angeles');
      const end = DateTime.fromJSDate(row.end_utc).setZone('America/Los_Angeles');
      console.log(`   ${row.driver_name} - ${start.toFormat('MM/dd HH:mm')} to ${end.toFormat('HH:mm')} (${row.minutes} min)`);
    });
    
    // Count how many were inferred vs explicit LP
    const inferredCount = await client.query(
      `SELECT COUNT(*) as count
       FROM break_segments
       WHERE source_row_ref::text LIKE '%inferred%'`
    );
    
    const explicitCount = await client.query(
      `SELECT COUNT(*) as count
       FROM break_segments
       WHERE source_row_ref::text NOT LIKE '%inferred%' OR source_row_ref IS NULL`
    );
    
    console.log('\n📈 Detection method breakdown:');
    console.log(`   Automatically detected (gap < 60 min): ${inferredCount.rows[0].count}`);
    console.log(`   Explicitly marked with LP: ${explicitCount.rows[0].count}`);
    
    // Check compliance - drivers with qualifying lunch breaks
    const complianceCheck = await client.query(
      `WITH daily_breaks AS (
         SELECT 
           b.driver_id,
           DATE(timezone('America/Los_Angeles', b.start_utc)) as work_date,
           MAX(b.minutes) as longest_break
         FROM break_segments b
         WHERE b.minutes >= 30
         GROUP BY b.driver_id, work_date
       )
       SELECT 
         COUNT(DISTINCT driver_id) as drivers_with_compliant_breaks,
         COUNT(*) as days_with_compliant_breaks
       FROM daily_breaks`
    );
    
    console.log('\n✅ Compliance summary:');
    console.log(`   Drivers with at least one 30+ min break: ${complianceCheck.rows[0].drivers_with_compliant_breaks}`);
    console.log(`   Total days with compliant breaks: ${complianceCheck.rows[0].days_with_compliant_breaks}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    console.log('🔍 Analyzing meal break compliance...\n');
    
    // Get all days with 6+ hours worked in the last 7 days
    const result = await client.query(`
      WITH date_range AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '7 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS work_date
      ),
      daily_hours AS (
        SELECT 
          d.driver_id,
          d.driver_name,
          dr.work_date,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              LEAST(s.end_utc, (dr.work_date + INTERVAL '1 day')::timestamptz) - 
              GREATEST(s.start_utc, dr.work_date::timestamptz)
            ))
          ) / 3600.0, 0) AS hours_worked
        FROM date_range dr
        CROSS JOIN drivers d
        LEFT JOIN on_duty_segments s ON 
          s.driver_id = d.driver_id AND
          s.start_utc < (dr.work_date + INTERVAL '1 day')::timestamptz AND
          s.end_utc > dr.work_date::timestamptz
        GROUP BY d.driver_id, d.driver_name, dr.work_date
      ),
      days_over_6h AS (
        SELECT 
          driver_id,
          driver_name,
          work_date,
          hours_worked
        FROM daily_hours
        WHERE hours_worked >= 6
      ),
      breaks_per_day AS (
        SELECT 
          d.driver_id,
          d.work_date,
          COUNT(DISTINCT b.id) as break_count,
          MAX(EXTRACT(EPOCH FROM (b.end_utc - b.start_utc)) / 60.0) as longest_break_minutes,
          BOOL_OR(b.source_row_ref->>'inferred' = 'true') as has_inferred_break
        FROM days_over_6h d
        LEFT JOIN break_segments b ON
          b.driver_id = d.driver_id AND
          b.start_utc >= d.work_date::timestamptz AND
          b.start_utc < (d.work_date + INTERVAL '1 day')::timestamptz
        GROUP BY d.driver_id, d.work_date
      )
      SELECT 
        d.driver_name,
        d.work_date,
        ROUND(d.hours_worked::numeric, 2) as hours_worked,
        COALESCE(b.break_count, 0) as break_count,
        ROUND(COALESCE(b.longest_break_minutes, 0)::numeric, 1) as longest_break_minutes,
        COALESCE(b.has_inferred_break, false) as has_inferred_break,
        CASE 
          WHEN COALESCE(b.longest_break_minutes, 0) >= 30 THEN 'COMPLIANT'
          WHEN COALESCE(b.longest_break_minutes, 0) > 0 THEN 'SHORT_BREAK'
          ELSE 'NO_BREAK'
        END as compliance_status
      FROM days_over_6h d
      LEFT JOIN breaks_per_day b ON d.driver_id = b.driver_id AND d.work_date = b.work_date
      ORDER BY d.work_date DESC, d.driver_name
    `);
    
    console.log(`Found ${result.rows.length} driver-days with 6+ hours worked\n`);
    
    // Summary statistics
    const stats = {
      compliant: result.rows.filter(r => r.compliance_status === 'COMPLIANT').length,
      shortBreak: result.rows.filter(r => r.compliance_status === 'SHORT_BREAK').length,
      noBreak: result.rows.filter(r => r.compliance_status === 'NO_BREAK').length,
      withInferred: result.rows.filter(r => r.has_inferred_break).length
    };
    
    console.log('📊 Summary:');
    console.log(`   Compliant (30+ min break): ${stats.compliant} (${(stats.compliant / result.rows.length * 100).toFixed(1)}%)`);
    console.log(`   Short break (<30 min): ${stats.shortBreak} (${(stats.shortBreak / result.rows.length * 100).toFixed(1)}%)`);
    console.log(`   No break detected: ${stats.noBreak} (${(stats.noBreak / result.rows.length * 100).toFixed(1)}%)`);
    console.log(`   With inferred breaks: ${stats.withInferred}\n`);
    
    // Show sample violations
    const violations = result.rows.filter(r => r.compliance_status === 'NO_BREAK');
    if (violations.length > 0) {
      console.log('⚠️  Sample violations (no break detected):');
      violations.slice(0, 10).forEach(v => {
        console.log(`   ${v.driver_name} on ${DateTime.fromJSDate(v.work_date).toFormat('MM/dd')}: ${v.hours_worked}h worked`);
      });
      if (violations.length > 10) {
        console.log(`   ... and ${violations.length - 10} more`);
      }
    }
    
    // Show sample short breaks
    const shortBreaks = result.rows.filter(r => r.compliance_status === 'SHORT_BREAK');
    if (shortBreaks.length > 0) {
      console.log('\n⚠️  Sample short breaks (<30 min):');
      shortBreaks.slice(0, 5).forEach(v => {
        console.log(`   ${v.driver_name} on ${DateTime.fromJSDate(v.work_date).toFormat('MM/dd')}: ${v.hours_worked}h worked, ${v.longest_break_minutes}min break`);
      });
      if (shortBreaks.length > 5) {
        console.log(`   ... and ${shortBreaks.length - 5} more`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

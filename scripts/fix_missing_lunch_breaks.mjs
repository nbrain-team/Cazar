#!/usr/bin/env node
import { Client } from 'pg';
import { DateTime } from 'luxon';
import 'dotenv/config';

// Direct Render database connection
const client = new Client({
  host: 'dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com',
  port: 5432,
  database: 'cazar_ops_hub',
  user: 'cazar_admin',
  password: 'gK0Y72j2nnxXPRPWTG0VJa8ixGVjsKkh',
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  console.log('🔍 Finding and fixing missing lunch breaks for Sept 2, 2025...\n');
  
  // Find gaps between segments that should be lunch breaks
  const gapsQuery = `
    WITH segment_pairs AS (
      SELECT 
        s1.driver_id,
        s1.end_utc as gap_start,
        s2.start_utc as gap_end,
        EXTRACT(EPOCH FROM (s2.start_utc - s1.end_utc)) / 60 as gap_minutes,
        DATE(timezone('America/Los_Angeles', s1.end_utc)) as local_date
      FROM on_duty_segments s1
      JOIN on_duty_segments s2 ON s1.driver_id = s2.driver_id
      WHERE s1.end_utc < s2.start_utc
        AND DATE(timezone('America/Los_Angeles', s1.end_utc)) = DATE(timezone('America/Los_Angeles', s2.start_utc))
        AND DATE(timezone('America/Los_Angeles', s1.end_utc)) = '2025-09-02'
        AND EXTRACT(EPOCH FROM (s2.start_utc - s1.end_utc)) / 60 BETWEEN 1 AND 180
    ),
    existing_breaks AS (
      SELECT DISTINCT driver_id, start_utc, end_utc
      FROM break_segments
      WHERE DATE(timezone('America/Los_Angeles', start_utc)) = '2025-09-02'
    )
    SELECT 
      sp.driver_id,
      d.driver_name,
      sp.gap_start,
      sp.gap_end,
      sp.gap_minutes,
      sp.local_date
    FROM segment_pairs sp
    JOIN drivers d ON sp.driver_id = d.driver_id
    LEFT JOIN existing_breaks eb ON sp.driver_id = eb.driver_id 
      AND sp.gap_start = eb.start_utc 
      AND sp.gap_end = eb.end_utc
    WHERE eb.driver_id IS NULL
    ORDER BY sp.driver_id, sp.gap_start`;
  
  const result = await client.query(gapsQuery);
  
  if (result.rows.length === 0) {
    console.log('✅ No missing lunch breaks found for Sept 2, 2025');
  } else {
    console.log(`Found ${result.rows.length} missing lunch breaks to fix:\n`);
    
    // Get the upload ID for Sept 2 data
    const uploadQuery = await client.query(
      `SELECT id FROM uploads 
       WHERE source = 'timecard_csv' 
       ORDER BY imported_at DESC 
       LIMIT 1`
    );
    const uploadId = uploadQuery.rows[0].id;
    
    for (const gap of result.rows) {
      console.log(`  ${gap.driver_name} (${gap.driver_id}): ${Math.round(gap.gap_minutes)} minute gap`);
      
      // Insert the missing break
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          gap.driver_id, 
          uploadId, 
          gap.gap_start, 
          gap.gap_end, 
          JSON.stringify({ 
            inferred: true, 
            reason: 'gap_within_3_hours', 
            gap_minutes: Math.round(gap.gap_minutes),
            fixed_retroactively: true,
            fix_date: new Date().toISOString()
          })
        ]
      );
    }
    
    console.log(`\n✅ Fixed ${result.rows.length} missing lunch breaks`);
  }
  
  // Show Kelvin's status after fix
  const kelvinCheck = await client.query(`
    SELECT 
      COUNT(DISTINCT b.id) as meal_breaks,
      SUM(CASE WHEN b.minutes >= 30 THEN 1 ELSE 0 END) as qualifying_meals,
      STRING_AGG(b.minutes::text || 'min', ', ' ORDER BY b.start_utc) as break_durations
    FROM drivers d
    LEFT JOIN break_segments b ON d.driver_id = b.driver_id  
      AND b.label = 'Lunch'
      AND DATE(timezone('America/Los_Angeles', b.start_utc)) = '2025-09-02'
    WHERE d.driver_id = 'LSW001525'
    GROUP BY d.driver_id`
  );
  
  console.log('\n📊 Kelvin Whetstone status after fix:');
  if (kelvinCheck.rows.length > 0) {
    const k = kelvinCheck.rows[0];
    console.log(`  Meal breaks: ${k.meal_breaks}`);
    console.log(`  Qualifying meals (≥30min): ${k.qualifying_meals}`);
    console.log(`  Break durations: ${k.break_durations || 'none'}`);
  }
  
} catch (err) {
  console.error('Error:', err);
} finally {
  await client.end();
}

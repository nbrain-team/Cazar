#!/usr/bin/env node
import pg from 'pg';

const dbUrl = process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub";

const pool = new pg.Pool({ 
  connectionString: dbUrl, 
  ssl: { rejectUnauthorized: false } 
});

async function updateActiveStatus() {
  console.log('\n🔄 Updating driver active status based on timecard activity...\n');
  
  const client = await pool.connect();
  
  try {
    // Set inactive if no timecards in last 14 days
    const inactivated = await client.query(`
      UPDATE drivers
      SET driver_status = 'inactive',
          updated_at = NOW()
      WHERE driver_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM timecards t 
        WHERE t.employee_id = drivers.driver_id 
        AND t.date >= CURRENT_DATE - INTERVAL '14 days'
      )
      AND employment_status != 'terminated'
    `);
    
    console.log(`✅ Set ${inactivated.rowCount} drivers to INACTIVE (no timecards in last 14 days)`);
    
    // Set active if has timecards in last 14 days
    const activated = await client.query(`
      UPDATE drivers
      SET driver_status = 'active',
          updated_at = NOW()
      WHERE driver_status = 'inactive'
      AND EXISTS (
        SELECT 1 FROM timecards t 
        WHERE t.employee_id = drivers.driver_id 
        AND t.date >= CURRENT_DATE - INTERVAL '14 days'
      )
      AND employment_status != 'terminated'
    `);
    
    console.log(`✅ Set ${activated.rowCount} drivers to ACTIVE (have timecards in last 14 days)`);
    
    // Get final counts
    const counts = await client.query(`
      SELECT 
        driver_status,
        COUNT(*) as count
      FROM drivers
      GROUP BY driver_status
      ORDER BY driver_status
    `);
    
    console.log('\n📊 Final Status Counts:\n');
    counts.rows.forEach(row => {
      console.log(`  ${row.driver_status}: ${row.count}`);
    });
    
    // Show truly active drivers
    const active = await client.query(`
      SELECT COUNT(*) as count 
      FROM drivers 
      WHERE driver_status = 'active'
    `);
    
    console.log(`\n✅ Total active drivers (based on recent timecards): ${active.rows[0].count}\n`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

updateActiveStatus().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});


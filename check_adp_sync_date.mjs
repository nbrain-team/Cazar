import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub", 
  ssl: { rejectUnauthorized: false } 
});

const client = await pool.connect();

try {
  // Check when ADP drivers were last updated
  const lastUpdate = await client.query(`
    SELECT 
      MAX(updated_at) as last_sync,
      MIN(updated_at) as first_sync,
      COUNT(*) as total
    FROM drivers
    WHERE driver_id LIKE 'G3%'
  `);
  
  console.log('\n📅 ADP Data Sync Information:\n');
  console.log(`First sync: ${lastUpdate.rows[0].first_sync}`);
  console.log(`Last sync: ${lastUpdate.rows[0].last_sync}`);
  console.log(`Total ADP drivers: ${lastUpdate.rows[0].total}`);
  
  // Check active driver counts
  const counts = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE employment_status = 'active') as active_count,
      COUNT(*) FILTER (WHERE employment_status = 'terminated') as terminated_count,
      COUNT(*) FILTER (WHERE employment_status NOT IN ('active', 'terminated')) as other_count
    FROM drivers
    WHERE driver_id LIKE 'G3%'
  `);
  
  console.log('\n📊 Current Status Breakdown:\n');
  console.log(`Active: ${counts.rows[0].active_count}`);
  console.log(`Terminated: ${counts.rows[0].terminated_count}`);
  console.log(`Other: ${counts.rows[0].other_count}`);
  
  // Check most recent hires
  const recentHires = await client.query(`
    SELECT driver_name, hire_date, employment_status
    FROM drivers
    WHERE driver_id LIKE 'G3%'
    AND hire_date IS NOT NULL
    ORDER BY hire_date DESC
    LIMIT 10
  `);
  
  console.log('\n👥 Most Recent Hires (per database):\n');
  recentHires.rows.forEach((row, i) => {
    const hired = new Date(row.hire_date).toLocaleDateString();
    console.log(`${i+1}. ${row.driver_name} - Hired: ${hired} (${row.employment_status})`);
  });
  
  console.log('\n\n💡 DATA CUTOFF:\n');
  console.log(`The 333 active drivers reflects ADP data as of: ${lastUpdate.rows[0].last_sync}`);
  console.log(`This is a live snapshot from ADP at that time.`);
  console.log(`\nTo get current data, run: bash scripts/run_adp_loader.sh load workers\n`);
  
} finally {
  client.release();
  await pool.end();
}

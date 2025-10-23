import pg from 'pg';
const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub", 
  ssl: { rejectUnauthorized: false } 
});

const client = await pool.connect();

try {
  // Check drivers with timecards in last 14 days
  const recentlyActive = await client.query(`
    SELECT DISTINCT
      d.driver_name,
      d.driver_id,
      MAX(t.date) as last_worked,
      COUNT(t.timecard_id) as timecard_count,
      SUM(t.total_hours_worked) as total_hours
    FROM drivers d
    INNER JOIN timecards t ON d.driver_id = t.employee_id
    WHERE t.date >= CURRENT_DATE - INTERVAL '14 days'
    GROUP BY d.driver_id, d.driver_name
    ORDER BY last_worked DESC, d.driver_name
  `);
  
  console.log(`\n📋 Truly Active Drivers (worked in last 14 days): ${recentlyActive.rows.length}\n`);
  recentlyActive.rows.forEach((row, i) => {
    console.log(`${i+1}. ${row.driver_name} - Last worked: ${row.last_worked} (${parseFloat(row.total_hours).toFixed(1)} hrs)`);
  });
  
  // Also check the database flag vs reality
  console.log('\n\n📊 Comparison:\n');
  
  const flaggedActive = await client.query(`
    SELECT COUNT(*) as count FROM drivers WHERE driver_status = 'active'
  `);
  
  const flaggedActiveEmployment = await client.query(`
    SELECT COUNT(*) as count FROM drivers WHERE employment_status = 'active'
  `);
  
  console.log(`Drivers marked as active (driver_status): ${flaggedActive.rows[0].count}`);
  console.log(`Drivers with active employment status: ${flaggedActiveEmployment.rows[0].count}`);
  console.log(`Drivers who actually worked recently (last 14 days): ${recentlyActive.rows.length}`);
  console.log(`\n💡 Difference: ${parseInt(flaggedActive.rows[0].count) - recentlyActive.rows.length} drivers marked active but haven't worked recently\n`);
  
} finally {
  client.release();
  await pool.end();
}

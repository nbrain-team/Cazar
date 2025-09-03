import pg from 'pg';

async function main() {
  // Use the live database URL from render.yaml
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  console.log('🧹 Starting HOS data cleanup...');
  console.log('⚠️  This will DELETE all HOS-related data from the database!');
  console.log('');
  
  const pool = new pg.Pool({ 
    connectionString: dbUrl, 
    ssl: { rejectUnauthorized: false } 
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🔗 Connected to database');
    await client.query('BEGIN');
    
    // Delete in order of dependencies (reverse of foreign key relationships)
    const tables = [
      { name: 'driver_violations', desc: 'HOS violations' },
      { name: 'hos_rollups_7d', desc: '7-day HOS rollups' },
      { name: 'break_segments', desc: 'Lunch/break segments' },
      { name: 'on_duty_segments', desc: 'On-duty work segments' },
      { name: 'driver_attestations', desc: 'Driver attestations' },
      { name: 'uploads', desc: 'File upload records' },
      { name: 'drivers', desc: 'Driver records' }
    ];
    
    console.log('\n📊 Current record counts:');
    for (const table of tables) {
      const countResult = await client.query(`SELECT COUNT(*) FROM ${table.name}`);
      const count = countResult.rows[0].count;
      console.log(`   ${table.name}: ${count} records`);
    }
    
    console.log('\n🗑️  Deleting data...');
    for (const table of tables) {
      const result = await client.query(`DELETE FROM ${table.name}`);
      console.log(`   ✓ Deleted ${result.rowCount} records from ${table.name} (${table.desc})`);
    }
    
    // Reset any sequences if needed
    console.log('\n🔄 Resetting sequences...');
    // No auto-increment sequences in this schema, using UUIDs
    
    console.log('\n📊 Verification - Final record counts:');
    for (const table of tables) {
      const countResult = await client.query(`SELECT COUNT(*) FROM ${table.name}`);
      const count = countResult.rows[0].count;
      console.log(`   ${table.name}: ${count} records`);
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log('\n✅ Database cleanup completed successfully!');
    console.log('   All HOS data has been removed.');
    console.log('   Database structure remains intact.');
    console.log('   Ready for fresh data import.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error during cleanup:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

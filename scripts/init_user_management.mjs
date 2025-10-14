import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';

console.log('='.repeat(80));
console.log('Initializing User Management System');
console.log('='.repeat(80));

const pool = new pg.Pool({ 
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('\n✓ Connected to database\n');
    
    // Read SQL schema file
    const schemaPath = join(__dirname, '..', 'database', 'users_schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    
    console.log('Executing schema...');
    await client.query(schemaSql);
    
    console.log('✅ User management tables created');
    console.log('✅ Default admin user created (if not exists)');
    console.log('✅ Indexes created');
    console.log('✅ Audit log table created');
    
    // Check what was created
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'user_data_source_permissions', 'user_audit_log')
      ORDER BY table_name
    `);
    
    console.log('\nTables created:');
    rows.forEach(r => console.log(`  ✓ ${r.table_name}`));
    
    // Check admin user
    const adminCheck = await client.query(
      `SELECT username, email, role FROM users WHERE role = 'admin' LIMIT 1`
    );
    
    if (adminCheck.rows.length > 0) {
      console.log('\nDefault Admin User:');
      console.log(`  Username: ${adminCheck.rows[0].username}`);
      console.log(`  Email: ${adminCheck.rows[0].email}`);
      console.log(`  Password: Admin123! (CHANGE THIS!)`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ User Management System Ready!');
    console.log('='.repeat(80));
    console.log('\nNext steps:');
    console.log('1. Deploy updated code to Render');
    console.log('2. Run this script on Render (or tables auto-create on first API call)');
    console.log('3. Access Admin Panel at: /admin');
    console.log('4. Change default admin password!');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

initializeDatabase();


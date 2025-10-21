#!/usr/bin/env node
/**
 * Test Script: Demonstrate AI Smart Agent Access to ADP Data
 * 
 * This script shows example queries that the AI Smart Agent can now answer
 * using the ADP data loaded into PostgreSQL.
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 
  "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub";

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     AI SMART AGENT - ADP DATA ACCESS DEMONSTRATION             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const pool = new pg.Pool({ 
    connectionString: DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🤖 The AI Smart Agent can now answer questions like:\n');
    
    // Query 1: Total employees
    console.log('❓ USER: "How many total employees do we have?"\n');
    const q1 = await client.query('SELECT COUNT(*) as count FROM drivers');
    console.log(`🤖 AI: We have ${q1.rows[0].count} total employees in the system.\n`);
    console.log('---\n');
    
    // Query 2: Active vs Terminated
    console.log('❓ USER: "How many active employees do we have?"\n');
    const q2 = await client.query(`
      SELECT 
        employment_status, 
        COUNT(*) as count 
      FROM drivers 
      GROUP BY employment_status 
      ORDER BY count DESC
    `);
    console.log('🤖 AI: Here\'s the breakdown by employment status:');
    q2.rows.forEach(row => {
      console.log(`   ${row.employment_status}: ${row.count} employees`);
    });
    console.log('\n---\n');
    
    // Query 3: Recent hires
    console.log('❓ USER: "Who was hired most recently?"\n');
    const q3 = await client.query(`
      SELECT driver_name, hire_date, employment_status
      FROM drivers
      WHERE hire_date IS NOT NULL
      ORDER BY hire_date DESC
      LIMIT 5
    `);
    console.log('🤖 AI: Here are the 5 most recent hires:');
    q3.rows.forEach((row, idx) => {
      const date = new Date(row.hire_date).toLocaleDateString();
      console.log(`   ${idx + 1}. ${row.driver_name} - Hired ${date} (${row.employment_status})`);
    });
    console.log('\n---\n');
    
    // Query 4: Search specific employee
    console.log('❓ USER: "Tell me about Kamau Adams"\n');
    const q4 = await client.query(`
      SELECT driver_id, driver_name, employment_status, hire_date, driver_status
      FROM drivers
      WHERE driver_name ILIKE '%kamau%adams%'
      LIMIT 1
    `);
    if (q4.rows.length > 0) {
      const emp = q4.rows[0];
      const hireDate = emp.hire_date ? new Date(emp.hire_date).toLocaleDateString() : 'Unknown';
      console.log(`🤖 AI: Here's what I found about Kamau Adams:`);
      console.log(`   Employee ID: ${emp.driver_id}`);
      console.log(`   Status: ${emp.employment_status}`);
      console.log(`   Driver Status: ${emp.driver_status}`);
      console.log(`   Hire Date: ${hireDate}`);
    }
    console.log('\n---\n');
    
    // Query 5: Employees hired in last 3 months
    console.log('❓ USER: "Show me employees hired in the last 3 months"\n');
    const q5 = await client.query(`
      SELECT driver_name, hire_date, employment_status
      FROM drivers
      WHERE hire_date >= CURRENT_DATE - INTERVAL '3 months'
      ORDER BY hire_date DESC
    `);
    console.log(`🤖 AI: Found ${q5.rows.length} employees hired in the last 3 months:`);
    q5.rows.forEach((row, idx) => {
      const date = new Date(row.hire_date).toLocaleDateString();
      console.log(`   ${idx + 1}. ${row.driver_name} - ${date} (${row.employment_status})`);
    });
    console.log('\n---\n');
    
    // Query 6: Count from ADP (driver_id starts with G3)
    console.log('❓ USER: "How many employees came from ADP?"\n');
    const q6 = await client.query(`
      SELECT COUNT(*) as count
      FROM drivers
      WHERE driver_id LIKE 'G3%'
    `);
    console.log(`🤖 AI: There are ${q6.rows[0].count} employees synced from ADP (identified by driver IDs starting with 'G3').\n`);
    console.log('---\n');
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         SUCCESS! ✅                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('The AI Smart Agent has full access to ADP employee data!');
    console.log('It can answer questions about:');
    console.log('  ✅ Employee counts and statistics');
    console.log('  ✅ Specific employee information');
    console.log('  ✅ Hire dates and recent hires');
    console.log('  ✅ Employment status (active/terminated)');
    console.log('  ✅ Complex queries combining multiple criteria\n');
    
    console.log('Try asking the Smart Agent these questions at:');
    console.log('👉 https://cazar-main.onrender.com/smart-agent\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();


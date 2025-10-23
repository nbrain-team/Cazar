#!/usr/bin/env node
/**
 * List Active Drivers from Database
 * Node.js version with better formatting
 */

import pg from 'pg';
import { config } from 'dotenv';

config({ path: 'Cazar Main.env' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function listActiveDrivers() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              ACTIVE DRIVERS LIST                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Get active drivers
    const result = await pool.query(`
      SELECT 
        driver_id,
        driver_name,
        driver_status,
        employment_status,
        hire_date,
        termination_date,
        email,
        phone
      FROM drivers
      WHERE driver_status = 'active'
        OR employment_status = 'active'
      ORDER BY driver_name
    `);

    const drivers = result.rows;

    if (drivers.length === 0) {
      console.log('No active drivers found.\n');
      return;
    }

    // Display drivers
    console.log(`Found ${drivers.length} active drivers:\n`);
    
    drivers.forEach((driver, i) => {
      console.log(`${i + 1}. ${driver.driver_name}`);
      console.log(`   ID: ${driver.driver_id}`);
      console.log(`   Driver Status: ${driver.driver_status}`);
      console.log(`   Employment Status: ${driver.employment_status}`);
      if (driver.hire_date) {
        console.log(`   Hired: ${new Date(driver.hire_date).toLocaleDateString()}`);
      }
      if (driver.email) {
        console.log(`   Email: ${driver.email}`);
      }
      if (driver.phone) {
        console.log(`   Phone: ${driver.phone}`);
      }
      console.log('');
    });

    // Get summary statistics
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE driver_status = 'active') as active_driver_status,
        COUNT(*) FILTER (WHERE employment_status = 'active') as active_employment,
        COUNT(*) FILTER (WHERE driver_status = 'active' AND employment_status = 'active') as both_active
      FROM drivers
      WHERE driver_status = 'active' OR employment_status = 'active'
    `);

    const summary = stats.rows[0];

    console.log('────────────────────────────────────────────────────────────────');
    console.log('\n📊 Summary:\n');
    console.log(`   Total Active Drivers: ${summary.total}`);
    console.log(`   • Active (driver_status): ${summary.active_driver_status}`);
    console.log(`   • Active (employment_status): ${summary.active_employment}`);
    console.log(`   • Both statuses active: ${summary.both_active}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

listActiveDrivers().catch(console.error);


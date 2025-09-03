#!/usr/bin/env node
import pg from 'pg';
import { DateTime } from 'luxon';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const { Pool } = pg;

const pool = new Pool({
  host: 'dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com',
  user: 'cazar_admin',
  password: '7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke',
  database: 'cazar_ops_hub',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function createDemoViolations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Creating demo violation scenarios...\n');
    
    // Get the mock upload ID
    const uploadRes = await client.query(
      `INSERT INTO uploads (filename, sha256_digest, source, week_label) 
       VALUES ('demo_violations.csv', 'DEMO_VIOLATIONS_' || NOW()::text, 'timecard_csv', 'Demo Data') 
       RETURNING id`
    );
    const uploadId = uploadRes.rows[0].id;
    
    // Create demo drivers if they don't exist
    const demoDrivers = [
      { id: 'DEMO001', name: 'John Demo - 60/7 Violation' },
      { id: 'DEMO002', name: 'Sarah Demo - No Meal Break' },
      { id: 'DEMO003', name: 'Mike Demo - Consecutive Days' },
      { id: 'DEMO004', name: 'Lisa Demo - At Risk Scheduled' },
      { id: 'DEMO005', name: 'Tom Demo - Multiple Issues' }
    ];
    
    for (const driver of demoDrivers) {
      await client.query(
        `INSERT INTO drivers (driver_id, driver_name, driver_status, employment_status)
         VALUES ($1, $2, 'active', 'active')
         ON CONFLICT (driver_id) DO UPDATE SET driver_name = $2`,
        [driver.id, driver.name]
      );
    }
    
    const tz = 'America/Los_Angeles';
    const now = DateTime.now().setZone(tz);
    
    // Scenario 1: Driver exceeding 60 hours in 7 days
    console.log('Creating Scenario 1: 60/7 hour violation...');
    const driver1Start = now.minus({ days: 6 }).startOf('day').plus({ hours: 6 });
    for (let i = 0; i < 7; i++) {
      const dayStart = driver1Start.plus({ days: i });
      const hours = i < 6 ? 10 : 5; // 65 total hours
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO001',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Add meal break on days with more than 6 hours
      if (hours > 6) {
        await client.query(
          `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
           VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
          [
            'DEMO001',
            uploadId,
            dayStart.plus({ hours: 5 }).toUTC().toISO(),
            dayStart.plus({ hours: 5.5 }).toUTC().toISO(),
            JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
          ]
        );
      }
    }
    
    // Scenario 2: Driver with no meal break on long day
    console.log('Creating Scenario 2: No meal break violation...');
    const driver2Start = now.minus({ days: 2 }).startOf('day').plus({ hours: 6 });
    await client.query(
      `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
       VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
      [
        'DEMO002',
        uploadId,
        driver2Start.toUTC().toISO(),
        driver2Start.plus({ hours: 8 }).toUTC().toISO(), // 8 hours with no break
        JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
      ]
    );
    
    // Scenario 3: Driver working 6 consecutive days
    console.log('Creating Scenario 3: Consecutive days violation...');
    const driver3Start = now.minus({ days: 5 }).startOf('day').plus({ hours: 7 });
    for (let i = 0; i < 6; i++) {
      const dayStart = driver3Start.plus({ days: i });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO003',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: 8 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Add meal breaks
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          'DEMO003',
          uploadId,
          dayStart.plus({ hours: 4 }).toUTC().toISO(),
          dayStart.plus({ hours: 4.5 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
    }
    
    // Scenario 4: Driver at risk with scheduled work
    console.log('Creating Scenario 4: At risk with scheduled work...');
    const driver4Start = now.minus({ days: 4 }).startOf('day').plus({ hours: 6 });
    for (let i = 0; i < 4; i++) {
      const dayStart = driver4Start.plus({ days: i });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO004',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: 12 }).toUTC().toISO(), // 48 hours in 4 days
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Add meal breaks
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          'DEMO004',
          uploadId,
          dayStart.plus({ hours: 5 }).toUTC().toISO(),
          dayStart.plus({ hours: 5.5 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
    }
    
    // Add scheduled work for tomorrow and day after that would cause violation
    await client.query(
      `INSERT INTO schedule_predictions (driver_id, schedule_date, schedule_content, predicted_hours)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)
       ON CONFLICT (driver_id, schedule_date) DO UPDATE 
       SET schedule_content = EXCLUDED.schedule_content, 
           predicted_hours = EXCLUDED.predicted_hours`,
      [
        'DEMO004',
        now.toISODate(),
        'Demo Route A - 10hr',
        10,
        now.plus({ days: 1 }).toISODate(),
        'Demo Route B - 8hr',
        8
      ]
    );
    
    // Scenario 5: Driver with multiple issues
    console.log('Creating Scenario 5: Multiple issues...');
    const driver5Start = now.minus({ days: 5 }).startOf('day').plus({ hours: 5 });
    for (let i = 0; i < 5; i++) {
      const dayStart = driver5Start.plus({ days: i });
      const hours = i === 0 ? 14 : 11; // Long days
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO005',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Late meal break on first day
      if (i === 0) {
        await client.query(
          `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
           VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
          [
            'DEMO005',
            uploadId,
            dayStart.plus({ hours: 7 }).toUTC().toISO(), // Late meal
            dayStart.plus({ hours: 7.5 }).toUTC().toISO(),
            JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
          ]
        );
      } else if (i > 0) {
        // Regular meal breaks other days
        await client.query(
          `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
           VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
          [
            'DEMO005',
            uploadId,
            dayStart.plus({ hours: 5 }).toUTC().toISO(),
            dayStart.plus({ hours: 5.5 }).toUTC().toISO(),
            JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
          ]
        );
      }
    }
    
    // Add risky schedule for driver 5
    await client.query(
      `INSERT INTO schedule_predictions (driver_id, schedule_date, schedule_content, predicted_hours)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (driver_id, schedule_date) DO UPDATE 
       SET schedule_content = EXCLUDED.schedule_content, 
           predicted_hours = EXCLUDED.predicted_hours`,
      [
        'DEMO005',
        now.toISODate(),
        'Demo Heavy Route - 12hr',
        12
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('\n✅ Demo violation scenarios created successfully!');
    console.log('\nCreated scenarios:');
    console.log('1. John Demo (DEMO001) - 60/7 hour violation (65 hours)');
    console.log('2. Sarah Demo (DEMO002) - No meal break violation');
    console.log('3. Mike Demo (DEMO003) - 6 consecutive days violation');
    console.log('4. Lisa Demo (DEMO004) - At risk with scheduled work pushing to violation');
    console.log('5. Tom Demo (DEMO005) - Multiple issues including approaching limits');
    console.log('\nAll scenarios include a note indicating mock data for demonstration.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating demo violations:', error);
    throw error;
  } finally {
    client.release();
  }
}

createDemoViolations()
  .then(() => {
    console.log('\nDemo data creation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create demo data:', error);
    process.exit(1);
  });

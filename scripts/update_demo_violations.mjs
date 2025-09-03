#!/usr/bin/env node
import pg from 'pg';
import { DateTime } from 'luxon';

const { Pool } = pg;

const pool = new Pool({
  host: 'dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com',
  user: 'cazar_admin',
  password: '7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke',
  database: 'cazar_ops_hub',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function updateDemoViolations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Updating demo data with more realistic hours...\n');
    
    const tz = 'America/Los_Angeles';
    const baseDate = DateTime.fromISO('2024-09-02', { zone: tz });
    
    // Clear existing demo data
    await client.query(`DELETE FROM break_segments WHERE driver_id LIKE 'DEMO%'`);
    await client.query(`DELETE FROM on_duty_segments WHERE driver_id LIKE 'DEMO%'`);
    
    // Get upload ID
    const { rows: uploads } = await client.query(
      `SELECT id FROM uploads WHERE filename = 'demo_violations.csv' ORDER BY imported_at DESC LIMIT 1`
    );
    const uploadId = uploads[0]?.id;
    
    // DEMO001 - Clear 60/7 violation (more realistic hours)
    console.log('Updating DEMO001 - 60/7 violation with realistic hours...');
    const demo1Hours = [11.5, 10.25, 9.75, 11, 10.5, 12, 7]; // Total: 72 hours
    for (let i = 0; i < 7; i++) {
      const dayStart = baseDate.minus({ days: 6 - i }).plus({ hours: 5, minutes: 30 + (i * 15) });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO001',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: demo1Hours[i] }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Add meal break for days > 6 hours
      if (demo1Hours[i] > 6) {
        const breakStart = dayStart.plus({ hours: 4.5 + (i % 2) * 0.5 });
        await client.query(
          `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
           VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
          [
            'DEMO001',
            uploadId,
            breakStart.toUTC().toISO(),
            breakStart.plus({ minutes: 30 + (i % 2) * 5 }).toUTC().toISO(),
            JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
          ]
        );
      }
    }
    
    // DEMO002 - No meal break (realistic 8.5 hour shift)
    console.log('Updating DEMO002 - No meal break violation...');
    const demo2Start = baseDate.minus({ days: 1 }).plus({ hours: 6, minutes: 15 });
    await client.query(
      `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
       VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
      [
        'DEMO002',
        uploadId,
        demo2Start.toUTC().toISO(),
        demo2Start.plus({ hours: 8.5 }).toUTC().toISO(),
        JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
      ]
    );
    
    // DEMO003 - 6 consecutive days (varied hours)
    console.log('Updating DEMO003 - Consecutive days violation...');
    const demo3Hours = [7.75, 8.25, 9, 8.5, 7.5, 8]; // Total: 49 hours
    for (let i = 0; i < 6; i++) {
      const dayStart = baseDate.minus({ days: 5 - i }).plus({ hours: 6 + (i % 3) });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO003',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: demo3Hours[i] }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Add meal breaks
      const breakTime = dayStart.plus({ hours: 3.5 + (i % 2) * 0.75 });
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          'DEMO003',
          uploadId,
          breakTime.toUTC().toISO(),
          breakTime.plus({ minutes: 30 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
    }
    
    // DEMO004 - At risk with scheduled work (heavy hours)
    console.log('Updating DEMO004 - At risk with scheduled work...');
    const demo4Hours = [11.25, 12.5, 10.75, 11.5]; // Total: 46 hours
    for (let i = 0; i < 4; i++) {
      const dayStart = baseDate.minus({ days: 3 - i }).plus({ hours: 5, minutes: 45 });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO004',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: demo4Hours[i] }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Add meal breaks
      const breakTime = dayStart.plus({ hours: 5 });
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          'DEMO004',
          uploadId,
          breakTime.toUTC().toISO(),
          breakTime.plus({ minutes: 32 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
    }
    
    // DEMO005 - Multiple issues with long days
    console.log('Updating DEMO005 - Multiple issues...');
    const demo5Hours = [13.5, 11.25, 10.75, 11.5, 10]; // Total: 57 hours
    for (let i = 0; i < 5; i++) {
      const dayStart = baseDate.minus({ days: 4 - i }).plus({ hours: 4, minutes: 30 + i * 10 });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO005',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: demo5Hours[i] }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
      
      // Meal breaks - late on first day
      const breakTime = i === 0 
        ? dayStart.plus({ hours: 7.25 }) // Late meal
        : dayStart.plus({ hours: 4.5 + (i % 2) * 0.5 });
      
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          'DEMO005',
          uploadId,
          breakTime.toUTC().toISO(),
          breakTime.plus({ minutes: 30 + (i % 2) * 5 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Mock data for demonstration' })
        ]
      );
    }
    
    await client.query('COMMIT');
    
    console.log('\n✅ Demo data updated with realistic hours!');
    console.log('\nUpdated scenarios:');
    console.log('1. John Demo (DEMO001) - 72 hours over 7 days (varied 7-12h shifts)');
    console.log('2. Sarah Demo (DEMO002) - 8.5 hour shift with no meal break');
    console.log('3. Mike Demo (DEMO003) - 6 consecutive days (7.5-9h shifts)');
    console.log('4. Lisa Demo (DEMO004) - 46 hours in 4 days (10.75-12.5h shifts)');
    console.log('5. Tom Demo (DEMO005) - 57 hours with long days (10-13.5h shifts)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating demo data:', error);
    throw error;
  } finally {
    client.release();
  }
}

updateDemoViolations()
  .then(() => {
    console.log('\nDemo data update complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to update demo data:', error);
    process.exit(1);
  });

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

async function createVisibleDemoDrivers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('🚀 Creating highly visible demo drivers...\n');
    
    // First, clean up existing demo data
    console.log('Cleaning up existing demo data...');
    await client.query(`DELETE FROM break_segments WHERE driver_id LIKE 'DEMO%'`);
    await client.query(`DELETE FROM on_duty_segments WHERE driver_id LIKE 'DEMO%'`);
    await client.query(`DELETE FROM schedule_predictions WHERE driver_id LIKE 'DEMO%'`);
    await client.query(`DELETE FROM drivers WHERE driver_id LIKE 'DEMO%'`);
    
    // Create or get upload ID
    const uploadRes = await client.query(
      `INSERT INTO uploads (filename, sha256_digest, source, week_label) 
       VALUES ('demo_violations_visible.csv', 'DEMO_VISIBLE_' || NOW()::text, 'timecard_csv', 'Demo Data') 
       RETURNING id`
    );
    const uploadId = uploadRes.rows[0].id;
    
    // Use the SAME year as real data (2025)
    const tz = 'America/Los_Angeles';
    const baseDate = DateTime.fromISO('2025-09-02', { zone: tz });
    
    // Create demo drivers
    const demoDrivers = [
      { id: 'DEMO001', name: '🚫 DEMO - 60/7 VIOLATION (72hrs)' },
      { id: 'DEMO002', name: '🚫 DEMO - NO MEAL BREAK' },
      { id: 'DEMO003', name: '🚫 DEMO - 6 CONSECUTIVE DAYS' },
      { id: 'DEMO004', name: '⚠️ DEMO - AT RISK (58hrs)' },
      { id: 'DEMO005', name: '⚠️ DEMO - SCHEDULED VIOLATION' }
    ];
    
    for (const driver of demoDrivers) {
      await client.query(
        `INSERT INTO drivers (driver_id, driver_name, driver_status, employment_status)
         VALUES ($1, $2, 'active', 'active')`,
        [driver.id, driver.name]
      );
    }
    
    // DEMO001 - Clear 60/7 violation (72 hours in 7 days)
    console.log('Creating DEMO001 - 60/7 violation (72 hours)...');
    const demo1Schedule = [
      { day: 6, hours: 11.5 },  // Aug 27
      { day: 5, hours: 10.25 }, // Aug 28
      { day: 4, hours: 10.5 },  // Aug 29
      { day: 3, hours: 10.75 }, // Aug 30
      { day: 2, hours: 11 },    // Aug 31
      { day: 1, hours: 10 },    // Sep 1
      { day: 0, hours: 8 }      // Sep 2
    ];
    
    for (const shift of demo1Schedule) {
      const dayStart = baseDate.minus({ days: shift.day }).plus({ hours: 6 });
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO001',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours: shift.hours }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: 'Visible demo for 60/7 violation' })
        ]
      );
      
      // Add meal break for shifts > 6 hours
      if (shift.hours > 6) {
        const breakStart = dayStart.plus({ hours: 5 });
        await client.query(
          `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
           VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
          [
            'DEMO001',
            uploadId,
            breakStart.toUTC().toISO(),
            breakStart.plus({ minutes: 30 }).toUTC().toISO(),
            JSON.stringify({ src: 'demo' })
          ]
        );
      }
    }
    
    // DEMO002 - No meal break violation (8+ hours without break)
    console.log('Creating DEMO002 - No meal break violation...');
    const demo2Start = baseDate.minus({ days: 1 }).plus({ hours: 6 });
    await client.query(
      `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
       VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
      [
        'DEMO002',
        uploadId,
        demo2Start.toUTC().toISO(),
        demo2Start.plus({ hours: 9 }).toUTC().toISO(), // 9 hours, no break
        JSON.stringify({ src: 'demo', note: 'No meal break violation' })
      ]
    );
    
    // DEMO003 - 6 consecutive days violation
    console.log('Creating DEMO003 - 6 consecutive days violation...');
    for (let i = 0; i < 6; i++) {
      const dayStart = baseDate.minus({ days: 5 - i }).plus({ hours: 6 });
      const hours = 8 + (i % 2); // Alternate 8-9 hour days
      await client.query(
        `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
         VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
        [
          'DEMO003',
          uploadId,
          dayStart.toUTC().toISO(),
          dayStart.plus({ hours }).toUTC().toISO(),
          JSON.stringify({ src: 'demo', note: '6 consecutive days' })
        ]
      );
      
      // Add meal breaks
      const breakTime = dayStart.plus({ hours: 4 });
      await client.query(
        `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
         VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
        [
          'DEMO003',
          uploadId,
          breakTime.toUTC().toISO(),
          breakTime.plus({ minutes: 30 }).toUTC().toISO(),
          JSON.stringify({ src: 'demo' })
        ]
      );
    }
    
    // DEMO004 - At risk (58 hours, close to limit)
    console.log('Creating DEMO004 - At risk (58 hours)...');
    const demo4Schedule = [
      { day: 6, hours: 0 },    // Day off
      { day: 5, hours: 11 },   // Aug 28
      { day: 4, hours: 10.5 }, // Aug 29
      { day: 3, hours: 0 },    // Day off
      { day: 2, hours: 12 },   // Aug 31
      { day: 1, hours: 11.5 }, // Sep 1
      { day: 0, hours: 13 }    // Sep 2 - long day
    ];
    
    for (const shift of demo4Schedule) {
      if (shift.hours > 0) {
        const dayStart = baseDate.minus({ days: shift.day }).plus({ hours: 5 });
        await client.query(
          `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
           VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
          [
            'DEMO004',
            uploadId,
            dayStart.toUTC().toISO(),
            dayStart.plus({ hours: shift.hours }).toUTC().toISO(),
            JSON.stringify({ src: 'demo', note: 'At risk - near 60 hour limit' })
          ]
        );
        
        // Add meal break
        const breakTime = dayStart.plus({ hours: 5 });
        await client.query(
          `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
           VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
          [
            'DEMO004',
            uploadId,
            breakTime.toUTC().toISO(),
            breakTime.plus({ minutes: 32 }).toUTC().toISO(),
            JSON.stringify({ src: 'demo' })
          ]
        );
      }
    }
    
    // DEMO005 - Will violate with scheduled work
    console.log('Creating DEMO005 - Scheduled violation risk...');
    const demo5Hours = [0, 10, 10, 10, 10, 10, 5]; // 55 hours
    for (let i = 0; i < 7; i++) {
      if (demo5Hours[i] > 0) {
        const dayStart = baseDate.minus({ days: 6 - i }).plus({ hours: 6 });
        await client.query(
          `INSERT INTO on_duty_segments (driver_id, upload_id, duty_type, start_utc, end_utc, source_row_ref, confidence)
           VALUES ($1, $2, 'worked', $3, $4, $5, 1.0)`,
          [
            'DEMO005',
            uploadId,
            dayStart.toUTC().toISO(),
            dayStart.plus({ hours: demo5Hours[i] }).toUTC().toISO(),
            JSON.stringify({ src: 'demo', note: 'Schedule will cause violation' })
          ]
        );
        
        // Add meal break
        if (demo5Hours[i] > 6) {
          const breakTime = dayStart.plus({ hours: 4.5 });
          await client.query(
            `INSERT INTO break_segments (driver_id, upload_id, label, start_utc, end_utc, source_row_ref)
             VALUES ($1, $2, 'Lunch', $3, $4, $5)`,
            [
              'DEMO005',
              uploadId,
              breakTime.toUTC().toISO(),
              breakTime.plus({ minutes: 30 }).toUTC().toISO(),
              JSON.stringify({ src: 'demo' })
            ]
          );
        }
      }
    }
    
    // Add schedule prediction for DEMO005 that will push over limit
    await client.query(
      `INSERT INTO schedule_predictions (driver_id, schedule_date, schedule_content, predicted_hours)
       VALUES ($1, $2, $3, $4)`,
      [
        'DEMO005',
        baseDate.plus({ days: 1 }).toISODate(), // Sept 3
        'Demo Route - 10hr shift',
        10
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('\n✅ Demo drivers created successfully!\n');
    console.log('Created 5 highly visible demo drivers:');
    console.log('1. DEMO001 - 72 hours (VIOLATION - exceeds 60/7)');
    console.log('2. DEMO002 - 9 hour shift with NO meal break (VIOLATION)');
    console.log('3. DEMO003 - 6 consecutive work days (VIOLATION)');
    console.log('4. DEMO004 - 58 hours (AT RISK - near limit)');
    console.log('5. DEMO005 - 55 hours + 10hr scheduled = 65 total (AT RISK)');
    console.log('\n📅 View with date: September 2-3, 2025 (same year as real data)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating demo drivers:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run it
createVisibleDemoDrivers()
  .then(() => {
    console.log('\n🎉 Demo setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

#!/usr/bin/env node

/**
 * Initialize Calendar & Teams Database Tables
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
  try {
    console.log('📊 Initializing Calendar & Teams Database Tables...\n');

    // Read schema file
    const schemaPath = path.join(__dirname, '../database/calendar_teams_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 Creating tables and indexes...');
    await pool.query(schema);

    console.log('✅ Tables created successfully\n');

    // Check tables
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('calendar_events', 'teams_messages')
      ORDER BY tablename
    `);

    console.log('📋 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.tablename}`);
    });

    // Check views
    const viewsResult = await pool.query(`
      SELECT viewname 
      FROM pg_views 
      WHERE schemaname = 'public' 
      AND viewname IN ('upcoming_meetings', 'recent_teams_activity', 'high_priority_meetings', 'urgent_teams_messages', 'meeting_summary_by_category', 'teams_activity_by_channel')
      ORDER BY viewname
    `);

    console.log('\n📊 Created views:');
    viewsResult.rows.forEach(row => {
      console.log(`  ✓ ${row.viewname}`);
    });

    console.log('\n✅ Database initialization complete!');
    console.log('\nNext steps:');
    console.log('  1. Run calendar sync: POST /api/calendar/sync');
    console.log('  2. Run Teams sync: POST /api/teams/sync');
    console.log('  3. Test queries in Smart Agent');

  } catch (error) {
    console.error('❌ Initialization error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initializeDatabase();


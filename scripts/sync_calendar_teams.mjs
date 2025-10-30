#!/usr/bin/env node

/**
 * Sync Calendar & Teams Messages to PostgreSQL
 * Run this to populate the database with Microsoft 365 data
 */

import { syncCalendarEvents } from '../server/lib/calendarSyncService.mjs';
import { syncTeamsMessages } from '../server/lib/teamsSyncService.mjs';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runSync() {
  try {
    console.log('🔄 Starting Calendar & Teams Sync\n');
    console.log('━'.repeat(60));

    const daysBack = process.argv[2] ? parseInt(process.argv[2]) : 30;
    const daysForward = process.argv[3] ? parseInt(process.argv[3]) : 90;

    console.log(`\n📅 Syncing Calendar Events:`);
    console.log(`   Range: ${daysBack} days back, ${daysForward} days forward`);
    
    const calendarStats = await syncCalendarEvents(pool, {
      daysBack,
      daysForward,
      maxPerUser: 200,
      analyzeWithClaude: true
    });

    console.log('\n✅ Calendar Sync Complete:');
    console.log(`   Users processed: ${calendarStats.usersProcessed}`);
    console.log(`   Events processed: ${calendarStats.eventsProcessed}`);
    console.log(`   Events added: ${calendarStats.eventsAdded}`);
    console.log(`   Events updated: ${calendarStats.eventsUpdated}`);
    console.log(`   Errors: ${calendarStats.errors}`);
    console.log(`   Duration: ${calendarStats.duration?.toFixed(1)}s`);

    console.log('\n' + '━'.repeat(60));

    console.log(`\n💬 Syncing Teams Messages:`);
    console.log(`   Range: Last ${daysBack} days`);
    
    const teamsStats = await syncTeamsMessages(pool, {
      daysBack,
      maxPerChannel: 100,
      analyzeWithClaude: true
    });

    console.log('\n✅ Teams Sync Complete:');
    console.log(`   Teams processed: ${teamsStats.teamsProcessed}`);
    console.log(`   Channels processed: ${teamsStats.channelsProcessed}`);
    console.log(`   Messages processed: ${teamsStats.messagesProcessed}`);
    console.log(`   Messages added: ${teamsStats.messagesAdded}`);
    console.log(`   Messages updated: ${teamsStats.messagesUpdated}`);
    console.log(`   Errors: ${teamsStats.errors}`);
    console.log(`   Duration: ${teamsStats.duration?.toFixed(1)}s`);

    console.log('\n' + '━'.repeat(60));
    console.log('\n🎉 Full Sync Complete!');
    console.log(`   Total: ${calendarStats.eventsAdded + calendarStats.eventsUpdated} calendar events, ${teamsStats.messagesAdded + teamsStats.messagesUpdated} Teams messages`);
    console.log('\n✅ Smart Agent can now query calendar and Teams data!');
    console.log('\nTest queries:');
    console.log('  - "What meetings does Rudy have this week?"');
    console.log('  - "Show me upcoming high-priority meetings"');
    console.log('  - "What did the team discuss today?"');
    console.log('  - "Recent urgent Teams messages"');

  } catch (error) {
    console.error('\n❌ Sync error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSync();


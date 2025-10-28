#!/usr/bin/env node
/**
 * Show all indexed data in the system
 * - ADP Workers and Timecards
 * - Microsoft 365 Emails
 * - Meeting Transcripts (Read.AI)
 */

import pg from 'pg';
import { DateTime } from 'luxon';

const dbUrl = process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub";

const pool = new pg.Pool({ 
  connectionString: dbUrl, 
  ssl: { rejectUnauthorized: false } 
});

async function showIndexedData() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║            CAZAR LOGISTICS - INDEXED DATA STATUS              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const client = await pool.connect();
  
  try {
    // ========== ADP DATA ==========
    console.log('📊 ADP DATA (From Workforce Now)\n');
    
    // Workers/Employees
    const workers = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE employment_status = 'active') as active,
        COUNT(*) FILTER (WHERE employment_status = 'terminated') as terminated,
        MAX(updated_at) as last_sync
      FROM drivers
      WHERE driver_id LIKE 'G3%'
    `);
    
    const w = workers.rows[0];
    console.log('👥 EMPLOYEES/WORKERS:');
    console.log(`   Total from ADP: ${w.total}`);
    console.log(`   Active: ${w.active}`);
    console.log(`   Terminated: ${w.terminated}`);
    console.log(`   Last synced: ${w.last_sync ? DateTime.fromJSDate(new Date(w.last_sync)).toFormat('MMM dd, yyyy HH:mm') : 'Never'}`);
    
    // Timecards
    const timecards = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT employee_id) as unique_workers,
        MIN(date) as earliest,
        MAX(date) as latest,
        SUM(total_hours_worked) as total_hours,
        MAX(created_at) as last_added
      FROM timecards
    `);
    
    const t = timecards.rows[0];
    const daysCovered = t.earliest && t.latest ? 
      Math.ceil(DateTime.fromISO(t.latest).diff(DateTime.fromISO(t.earliest), 'days').days) + 1 : 0;
    
    console.log('\n⏱️  TIMECARDS:');
    console.log(`   Total entries: ${t.total}`);
    console.log(`   Unique workers: ${t.unique_workers}`);
    console.log(`   Date range: ${t.earliest ? DateTime.fromISO(t.earliest).toFormat('MMM dd, yyyy') : 'N/A'} to ${t.latest ? DateTime.fromISO(t.latest).toFormat('MMM dd, yyyy') : 'N/A'}`);
    console.log(`   Days covered: ${daysCovered}`);
    console.log(`   Total hours: ${t.total_hours ? parseFloat(t.total_hours).toFixed(0) : 0} hours`);
    console.log(`   Last added: ${t.last_added ? DateTime.fromJSDate(new Date(t.last_added)).toFormat('MMM dd, yyyy HH:mm') : 'Never'}`);
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // ========== EMAIL DATA ==========
    console.log('📧 MICROSOFT 365 EMAILS (Claude AI Analyzed)\n');
    
    const emails = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT DATE(received_date)) as unique_days,
        MIN(received_date) as earliest,
        MAX(received_date) as latest,
        MAX(created_at) as last_indexed,
        COUNT(DISTINCT from_email) as unique_senders
      FROM email_analytics
    `);
    
    const e = emails.rows[0];
    const emailDaysCovered = e.earliest && e.latest ? 
      Math.ceil(DateTime.fromJSDate(new Date(e.latest)).diff(DateTime.fromJSDate(new Date(e.earliest)), 'days').days) + 1 : 0;
    
    console.log('📬 EMAIL ANALYTICS:');
    console.log(`   Total emails: ${e.total}`);
    console.log(`   Unique senders: ${e.unique_senders}`);
    console.log(`   Date range: ${e.earliest ? DateTime.fromJSDate(new Date(e.earliest)).toFormat('MMM dd, yyyy') : 'N/A'} to ${e.latest ? DateTime.fromJSDate(new Date(e.latest)).toFormat('MMM dd, yyyy') : 'N/A'}`);
    console.log(`   Days covered: ${e.unique_days} unique days (${emailDaysCovered} day span)`);
    console.log(`   Last indexed: ${e.last_indexed ? DateTime.fromJSDate(new Date(e.last_indexed)).toFormat('MMM dd, yyyy HH:mm') : 'Never'}`);
    
    // Email breakdown by category
    const byCategory = await client.query(`
      SELECT category, COUNT(*) as count
      FROM email_analytics
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `);
    
    if (byCategory.rows.length > 0) {
      console.log('\n📊 By Category:');
      byCategory.rows.forEach(row => {
        console.log(`   ${row.category}: ${row.count}`);
      });
    }
    
    // Email breakdown by mailbox
    const byMailbox = await client.query(`
      SELECT 
        UNNEST(to_emails) as mailbox,
        COUNT(*) as count
      FROM email_analytics
      WHERE to_emails IS NOT NULL AND array_length(to_emails, 1) > 0
      GROUP BY mailbox
      ORDER BY count DESC
      LIMIT 10
    `);
    
    if (byMailbox.rows.length > 0) {
      console.log('\n📮 By Mailbox:');
      byMailbox.rows.forEach(row => {
        console.log(`   ${row.mailbox}: ${row.count}`);
      });
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // ========== MEETING DATA ==========
    console.log('🎙️  READ.AI MEETING TRANSCRIPTS\n');
    
    try {
      const meetings = await client.query(`
        SELECT 
          COUNT(*) as total,
          MIN(meeting_date) as earliest,
          MAX(meeting_date) as latest
        FROM meetings
      `);
      
      const m = meetings.rows[0];
      console.log('📝 MEETINGS:');
      console.log(`   Total transcripts: ${m.total}`);
      if (m.total > 0) {
        console.log(`   Date range: ${m.earliest ? DateTime.fromISO(m.earliest).toFormat('MMM dd, yyyy') : 'N/A'} to ${m.latest ? DateTime.fromISO(m.latest).toFormat('MMM dd, yyyy') : 'N/A'}`);
      }
    } catch (err) {
      console.log('📝 MEETINGS: Table not found or empty');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // ========== SUMMARY ==========
    console.log('📈 TOTAL INDEXED DATA SUMMARY:\n');
    console.log(`   ADP Workers: ${w.total.toLocaleString()} (${w.active} active)`);
    console.log(`   Timecards: ${t.total.toLocaleString()} entries`);
    console.log(`   Emails: ${e.total.toLocaleString()} emails`);
    console.log(`   \n   🎯 Total searchable records: ${(parseInt(w.total) + parseInt(t.total) + parseInt(e.total)).toLocaleString()}\n`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

showIndexedData().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});


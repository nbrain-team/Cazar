#!/usr/bin/env node
import pg from 'pg';
import { DateTime } from 'luxon';

const dbUrl = process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub";

const pool = new pg.Pool({ 
  connectionString: dbUrl, 
  ssl: { rejectUnauthorized: false } 
});

async function checkEmailSync() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           MICROSOFT EMAIL SYNC STATUS REPORT                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const client = await pool.connect();
  
  try {
    // Check if email tables exist
    const tablesExist = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('emails', 'email_threads', 'email_sync_log', 'email_analytics')
      ORDER BY table_name
    `);
    
    console.log('📋 Email Tables in Database:\n');
    if (tablesExist.rows.length === 0) {
      console.log('   ❌ No email tables found\n');
      return;
    }
    
    tablesExist.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });
    console.log('');
    
    // Check emails table if it exists
    if (tablesExist.rows.some(r => r.table_name === 'emails')) {
      const emailStats = await client.query(`
        SELECT 
          mailbox_email,
          COUNT(*) as email_count,
          MIN(received_at) as earliest_email,
          MAX(received_at) as latest_email,
          COUNT(DISTINCT DATE(received_at)) as days_covered
        FROM emails
        GROUP BY mailbox_email
        ORDER BY email_count DESC
      `);
      
      console.log('📧 EMAILS BY MAILBOX:\n');
      
      if (emailStats.rows.length === 0) {
        console.log('   ⚠️  No emails found in database\n');
      } else {
        let totalEmails = 0;
        let totalDays = 0;
        
        emailStats.rows.forEach((row, i) => {
          const earliest = DateTime.fromJSDate(new Date(row.earliest_email));
          const latest = DateTime.fromJSDate(new Date(row.latest_email));
          const daySpan = Math.ceil(latest.diff(earliest, 'days').days);
          
          console.log(`${i+1}. ${row.mailbox_email}`);
          console.log(`   Emails: ${row.email_count}`);
          console.log(`   Date range: ${earliest.toFormat('MMM dd, yyyy')} to ${latest.toFormat('MMM dd, yyyy')}`);
          console.log(`   Days covered: ${row.days_covered} days (span: ${daySpan} days)`);
          console.log(`   Days ago: ${Math.ceil(DateTime.now().diff(latest, 'days').days)} days since last email\n`);
          
          totalEmails += parseInt(row.email_count);
          totalDays = Math.max(totalDays, daySpan);
        });
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log(`📊 TOTAL SUMMARY:\n`);
        console.log(`   Mailboxes synced: ${emailStats.rows.length}`);
        console.log(`   Total emails: ${totalEmails}`);
        console.log(`   Maximum date span: ${totalDays} days\n`);
      }
    }
    
    // Check email sync log
    if (tablesExist.rows.some(r => r.table_name === 'email_sync_log')) {
      const syncLog = await client.query(`
        SELECT 
          mailbox_email,
          last_sync_at,
          emails_synced,
          status
        FROM email_sync_log
        ORDER BY last_sync_at DESC
      `);
      
      if (syncLog.rows.length > 0) {
        console.log('🔄 SYNC LOG (Last Activity):\n');
        syncLog.rows.forEach((row, i) => {
          const lastSync = DateTime.fromJSDate(new Date(row.last_sync_at));
          const hoursAgo = Math.ceil(DateTime.now().diff(lastSync, 'hours').hours);
          
          console.log(`${i+1}. ${row.mailbox_email}`);
          console.log(`   Last sync: ${lastSync.toFormat('MMM dd, yyyy HH:mm')} (${hoursAgo} hours ago)`);
          console.log(`   Emails in last sync: ${row.emails_synced || 0}`);
          console.log(`   Status: ${row.status}\n`);
        });
      }
    }
    
    // Check email threads
    if (tablesExist.rows.some(r => r.table_name === 'email_threads')) {
      const threadStats = await client.query(`
        SELECT COUNT(*) as thread_count
        FROM email_threads
      `);
      
      console.log(`📬 Email Threads: ${threadStats.rows[0].thread_count}\n`);
    }
    
    // Check email analytics
    if (tablesExist.rows.some(r => r.table_name === 'email_analytics')) {
      const analyticsStats = await client.query(`
        SELECT COUNT(*) as analytics_count
        FROM email_analytics
      `);
      
      console.log(`📊 Email Analytics Records: ${analyticsStats.rows[0].analytics_count}\n`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkEmailSync().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});


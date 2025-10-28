#!/usr/bin/env node
import pg from 'pg';
import { DateTime } from 'luxon';

const dbUrl = process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub";

const pool = new pg.Pool({ 
  connectionString: dbUrl, 
  ssl: { rejectUnauthorized: false } 
});

async function checkEmails() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        MICROSOFT 365 EMAIL SYNC - DETAILED STATUS             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const client = await pool.connect();
  
  try {
    // Check table structure first
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'email_analytics' 
      ORDER BY ordinal_position
      LIMIT 20
    `);
    
    console.log('📋 Email Analytics Table Columns:\n');
    columns.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
    console.log('');
    
    // Check by sender email (likely contains mailbox info)
    const byFrom = await client.query(`
      SELECT 
        from_email,
        COUNT(*) as count,
        MIN(received_date) as earliest,
        MAX(received_date) as latest
      FROM email_analytics
      WHERE from_email IS NOT NULL
      GROUP BY from_email
      ORDER BY count DESC
      LIMIT 20
    `);
    
    console.log('📧 EMAILS BY SENDER:\n');
    byFrom.rows.forEach((row, i) => {
      const earliest = row.earliest ? DateTime.fromJSDate(new Date(row.earliest)).toFormat('MMM dd, yyyy') : 'N/A';
      const latest = row.latest ? DateTime.fromJSDate(new Date(row.latest)).toFormat('MMM dd, yyyy') : 'N/A';
      const days = row.earliest && row.latest ? 
        Math.ceil(DateTime.fromJSDate(new Date(row.latest)).diff(DateTime.fromJSDate(new Date(row.earliest)), 'days').days) : 0;
      
      console.log(`${i+1}. ${row.from_email}`);
      console.log(`   Count: ${row.count} emails`);
      console.log(`   Range: ${earliest} to ${latest} (${days} days)\n`);
    });
    
    // Check by recipient (to find which mailboxes we're syncing)
    const byTo = await client.query(`
      SELECT 
        UNNEST(to_emails) as mailbox,
        COUNT(*) as count
      FROM email_analytics
      WHERE to_emails IS NOT NULL
      GROUP BY mailbox
      ORDER BY count DESC
      LIMIT 20
    `);
    
    console.log('\n📬 EMAILS BY RECIPIENT (Mailboxes We\'re Monitoring):\n');
    byTo.rows.forEach((row, i) => {
      console.log(`${i+1}. ${row.mailbox}: ${row.count} emails`);
    });
    
    // Check categories
    const byCategory = await client.query(`
      SELECT 
        category,
        COUNT(*) as count,
        MIN(received_date) as earliest,
        MAX(received_date) as latest
      FROM email_analytics
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);
    
    console.log('\n\n📊 EMAILS BY CATEGORY:\n');
    byCategory.rows.forEach((row, i) => {
      const earliest = row.earliest ? DateTime.fromJSDate(new Date(row.earliest)).toFormat('MMM dd') : 'N/A';
      const latest = row.latest ? DateTime.fromJSDate(new Date(row.latest)).toFormat('MMM dd') : 'N/A';
      
      console.log(`${i+1}. ${row.category}: ${row.count} emails (${earliest} - ${latest})`);
    });
    
    // Overall date range
    const overall = await client.query(`
      SELECT 
        COUNT(*) as total,
        MIN(received_date) as earliest,
        MAX(received_date) as latest,
        COUNT(DISTINCT DATE(received_date)) as unique_days
      FROM email_analytics
    `);
    
    const earliest = DateTime.fromJSDate(new Date(overall.rows[0].earliest));
    const latest = DateTime.fromJSDate(new Date(overall.rows[0].latest));
    const daySpan = Math.ceil(latest.diff(earliest, 'days').days);
    const daysAgo = Math.ceil(DateTime.now().diff(latest, 'days').days);
    
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('📊 OVERALL SUMMARY:\n');
    console.log(`Total emails synced: ${overall.rows[0].total}`);
    console.log(`Date range: ${earliest.toFormat('MMMM dd, yyyy')} to ${latest.toFormat('MMMM dd, yyyy')}`);
    console.log(`Days covered: ${overall.rows[0].unique_days} unique days`);
    console.log(`Total span: ${daySpan} days`);
    console.log(`Last email: ${daysAgo} days ago`);
    console.log('');
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkEmails().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});


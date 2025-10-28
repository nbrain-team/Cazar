#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL || "postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub", 
  ssl: { rejectUnauthorized: false } 
});

const client = await pool.connect();

try {
  const result = await client.query(`
    SELECT 
      COUNT(*) as total,
      MAX(created_at) as last_added,
      COUNT(DISTINCT DATE(received_date)) as days_covered,
      MIN(received_date) as earliest_email,
      MAX(received_date) as latest_email
    FROM email_analytics
  `);
  
  const row = result.rows[0];
  const lastAdded = row.last_added ? new Date(row.last_added).toLocaleString() : 'N/A';
  const earliest = row.earliest_email ? new Date(row.earliest_email).toLocaleDateString() : 'N/A';
  const latest = row.latest_email ? new Date(row.latest_email).toLocaleDateString() : 'N/A';
  
  console.log('\n📧 EMAIL SYNC PROGRESS CHECK\n');
  console.log(`Total emails in database: ${row.total}`);
  console.log(`Last email added: ${lastAdded}`);
  console.log(`Date range: ${earliest} to ${latest}`);
  console.log(`Days covered: ${row.days_covered}`);
  console.log('');
  
  // Show recent adds
  const recent = await client.query(`
    SELECT subject, from_email, received_date, created_at
    FROM email_analytics
    ORDER BY created_at DESC
    LIMIT 5
  `);
  
  console.log('🔄 Last 5 emails added:\n');
  recent.rows.forEach((r, i) => {
    const added = new Date(r.created_at).toLocaleTimeString();
    console.log(`${i+1}. ${r.subject?.substring(0, 50) || 'No subject'}`);
    console.log(`   From: ${r.from_email} | Added: ${added}\n`);
  });
  
} finally {
  client.release();
  await pool.end();
}


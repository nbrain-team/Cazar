import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

const client = await pool.connect();

try {
  console.log('\n🔍 Searching for Employment Practices Liability Policy email...\n');
  
  // Search for policy-related emails
  const policySearch = await client.query(`
    SELECT 
      id,
      subject,
      from_email,
      from_name,
      received_date,
      body_preview,
      category,
      priority
    FROM email_analytics
    WHERE 
      (subject ILIKE '%employment%' OR subject ILIKE '%liability%' OR subject ILIKE '%policy%' OR subject ILIKE '%12/19/2024%' OR subject ILIKE '%12-19-2024%')
      OR (body_preview ILIKE '%employment%' AND body_preview ILIKE '%liability%')
      OR (body_content ILIKE '%employment practices liability%')
    ORDER BY received_date DESC
  `);
  
  if (policySearch.rows.length === 0) {
    console.log('❌ NO emails found mentioning Employment Practices Liability Policy\n');
  } else {
    console.log(`✅ Found ${policySearch.rows.length} emails mentioning policy/liability:\n`);
    policySearch.rows.forEach((row, i) => {
      console.log(`${i+1}. Subject: ${row.subject || 'No subject'}`);
      console.log(`   From: ${row.from_name || row.from_email}`);
      console.log(`   Date: ${new Date(row.received_date).toLocaleDateString()}`);
      console.log(`   Category: ${row.category || 'N/A'}`);
      console.log(`   Preview: ${row.body_preview?.substring(0, 100) || 'N/A'}\n`);
    });
  }
  
  // Search specifically for 2024 dates mentioned
  const date2024 = await client.query(`
    SELECT subject, from_email, received_date
    FROM email_analytics
    WHERE subject ILIKE '%2024%' OR body_preview ILIKE '%2024%'
    ORDER BY received_date DESC
    LIMIT 10
  `);
  
  console.log(`\n📅 Emails mentioning "2024": ${date2024.rows.length}\n`);
  date2024.rows.forEach((row, i) => {
    console.log(`${i+1}. ${row.subject?.substring(0, 80)}`);
    console.log(`   From: ${row.from_email} | Received: ${new Date(row.received_date).toLocaleDateString()}\n`);
  });
  
  // Check Rudy's emails specifically
  const rudyEmails = await client.query(`
    SELECT COUNT(*) as total
    FROM email_analytics
    WHERE from_email ILIKE '%rudy%' OR to_emails::text ILIKE '%rudy%'
  `);
  
  console.log(`📧 Rudy's emails in database: ${rudyEmails.rows[0].total}\n`);
  
} finally {
  client.release();
  await pool.end();
}

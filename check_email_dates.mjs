import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

const client = await pool.connect();

try {
  // Check actual date distribution
  const dateStats = await client.query(`
    SELECT 
      DATE(received_date) as email_date,
      COUNT(*) as count,
      MIN(subject) as sample_subject
    FROM email_analytics
    GROUP BY DATE(received_date)
    ORDER BY email_date DESC
    LIMIT 50
  `);
  
  console.log('\n📅 EMAILS BY DATE:\n');
  dateStats.rows.forEach((row, i) => {
    const date = new Date(row.email_date);
    console.log(`${date.toLocaleDateString()}: ${row.count} emails`);
    console.log(`   Sample: ${row.sample_subject?.substring(0, 60) || 'No subject'}\n`);
  });
  
  // Check for any 2024 dates
  const old2024 = await client.query(`
    SELECT 
      DATE(received_date) as email_date,
      COUNT(*) as count
    FROM email_analytics
    WHERE EXTRACT(YEAR FROM received_date) = 2024
    GROUP BY DATE(received_date)
    ORDER BY email_date DESC
  `);
  
  if (old2024.rows.length > 0) {
    console.log('\n⚠️  FOUND 2024 EMAILS:\n');
    old2024.rows.forEach(row => {
      console.log(`${new Date(row.email_date).toLocaleDateString()}: ${row.count} emails`);
    });
    console.log('');
  }
  
  // Overall range
  const range = await client.query(`
    SELECT 
      MIN(received_date) as earliest,
      MAX(received_date) as latest,
      COUNT(*) as total
    FROM email_analytics
  `);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n📊 OVERALL DATE RANGE:\n');
  console.log(`Earliest: ${new Date(range.rows[0].earliest).toLocaleString()}`);
  console.log(`Latest: ${new Date(range.rows[0].latest).toLocaleString()}`);
  console.log(`Total emails: ${range.rows[0].total}\n`);
  
} finally {
  client.release();
  await pool.end();
}

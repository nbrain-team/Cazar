import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

const client = await pool.connect();

try {
  const email = await client.query(`
    SELECT *
    FROM email_analytics
    WHERE subject ILIKE '%Employment Practices Liability%'
    AND from_email ILIKE '%usi.com%'
    LIMIT 1
  `);
  
  if (email.rows.length > 0) {
    const e = email.rows[0];
    console.log('\n📧 EMPLOYMENT PRACTICES LIABILITY POLICY EMAIL:\n');
    console.log(`Subject: ${e.subject}`);
    console.log(`From: ${e.from_name} <${e.from_email}>`);
    console.log(`Received: ${new Date(e.received_date).toLocaleString()}`);
    console.log(`Category: ${e.category}`);
    console.log(`Priority: ${e.priority}`);
    console.log(`\nBody Preview:\n${e.body_preview}\n`);
    
    if (e.body_content) {
      console.log(`Full Body (first 500 chars):\n${e.body_content.substring(0, 500)}...\n`);
    }
  } else {
    console.log('Email not found');
  }
  
} finally {
  client.release();
  await pool.end();
}

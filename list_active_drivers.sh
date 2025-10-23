#!/bin/bash
# Quick command to list all active drivers

node -e "
const pg = require('pg');
const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

(async () => {
  const client = await pool.connect();
  try {
    const result = await client.query(\`
      SELECT driver_name, driver_id, employment_status, hire_date
      FROM drivers 
      WHERE driver_status = 'active'
      ORDER BY driver_name
    \`);
    
    console.log(\`\\n📋 Active Drivers (Total: \${result.rows.length})\\n\`);
    result.rows.forEach((row, i) => {
      console.log(\`\${i+1}. \${row.driver_name}\`);
    });
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
})();
"

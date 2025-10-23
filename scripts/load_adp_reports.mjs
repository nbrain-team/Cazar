#!/usr/bin/env node
import https from 'https';
import querystring from 'querystring';
import pg from 'pg';
import { DateTime } from 'luxon';

// ============================================================================
// ADP API Service Functions
// ============================================================================

const ADP_AUTH_BASE = 'https://accounts.adp.com';
const ADP_API_BASE = 'https://api.adp.com';

let tokenCache = {
  token: null,
  expiresAt: null
};

function cleanPEM(pem, type = 'CERTIFICATE') {
  if (pem.startsWith('"') && pem.endsWith('"')) {
    pem = pem.slice(1, -1);
  }
  pem = pem.replace(/\\n/g, '\n');
  const beginMarker = `-----BEGIN ${type}-----`;
  const endMarker = `-----END ${type}-----`;
  let base64Content = pem;
  if (pem.includes(beginMarker)) {
    base64Content = pem.split(beginMarker)[1];
  }
  if (base64Content.includes(endMarker)) {
    base64Content = base64Content.split(endMarker)[0];
  }
  base64Content = base64Content.replace(/[\s\n\r]/g, '');
  const lines = [];
  lines.push(beginMarker);
  for (let i = 0; i < base64Content.length; i += 64) {
    lines.push(base64Content.substring(i, i + 64));
  }
  lines.push(endMarker);
  return lines.join('\n');
}

function getADPCredentials() {
  const clientId = process.env.ADP_CLIENT_ID;
  const clientSecret = process.env.ADP_CLIENT_SECRET;
  let cert = process.env.ADP_CERTIFICATE;
  let key = process.env.ADP_PRIVATE_KEY;
  
  if (!clientId || !clientSecret) {
    throw new Error('ADP_CLIENT_ID or ADP_CLIENT_SECRET not configured in environment');
  }
  if (!cert || !key) {
    throw new Error('ADP_CERTIFICATE or ADP_PRIVATE_KEY not configured in environment');
  }
  
  cert = cleanPEM(cert, 'CERTIFICATE');
  key = cleanPEM(key, 'PRIVATE KEY');
  
  return { clientId, clientSecret, cert, key };
}

async function getAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt - 300000) {
    console.log('✅ Using cached ADP access token');
    return tokenCache.token;
  }
  
  console.log('🔑 Requesting new ADP access token...');
  
  return new Promise((resolve, reject) => {
    try {
      const { clientId, clientSecret, cert, key } = getADPCredentials();
      
      const postData = querystring.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });
      
      const url = new URL('/auth/oauth/v2/token', ADP_AUTH_BASE);
      
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        cert,
        key,
        rejectUnauthorized: true,
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              const token = parsed.access_token;
              const expiresIn = parsed.expires_in || 3600;
              tokenCache.token = token;
              tokenCache.expiresAt = Date.now() + (expiresIn * 1000);
              console.log(`✅ Access token obtained (expires in ${expiresIn}s)`);
              resolve(token);
            } catch (err) {
              reject(new Error(`Failed to parse token response: ${err.message}`));
            }
          } else {
            console.error(`❌ Token request failed: ${res.statusCode}`);
            console.error(`Response: ${data}`);
            reject(new Error(`OAuth token request failed: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (err) => {
        console.error(`❌ Request error: ${err.message}`);
        reject(err);
      });
      
      req.write(postData);
      req.end();
    } catch (error) {
      console.error(`❌ Setup error: ${error.message}`);
      reject(error);
    }
  });
}

async function makeADPRequest(endpoint, method = 'GET', body = null, additionalHeaders = {}) {
  try {
    const accessToken = await getAccessToken();
    const { cert, key } = getADPCredentials();
    
    console.log(`📡 Making ${method} request to: ${endpoint}`);
    
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, ADP_API_BASE);
      
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...additionalHeaders
        },
        cert,
        key,
        rejectUnauthorized: true,
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            console.error(`❌ API Error (${res.statusCode}): ${data}`);
          }
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log(`✅ Success`);
              resolve(parsed);
            } else {
              reject(new Error(`ADP API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            }
          } catch (err) {
            if (res.statusCode === 200) {
              resolve({ raw: data });
            } else {
              reject(new Error(`ADP API error ${res.statusCode}: ${data}`));
            }
          }
        });
      });
      
      req.on('error', (err) => {
        console.error(`❌ Request error: ${err.message}`);
        reject(err);
      });
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// ADP Data Fetchers
// ============================================================================

async function fetchAllWorkers() {
  console.log('\n📋 Fetching all workers from ADP (with pagination)...');
  
  const allWorkers = [];
  let skip = 0;
  const pageSize = 100; // ADP max page size
  let hasMore = true;
  
  while (hasMore) {
    console.log(`  📄 Fetching page ${Math.floor(skip / pageSize) + 1} (skip=${skip}, top=${pageSize})...`);
    
    const endpoint = `/hr/v2/workers?$skip=${skip}&$top=${pageSize}`;
    const response = await makeADPRequest(endpoint);
    
    if (!response.workers || !Array.isArray(response.workers)) {
      console.log('  ⚠️  No workers in response, stopping pagination');
      break;
    }
    
    const workersInPage = response.workers.length;
    allWorkers.push(...response.workers);
    console.log(`  ✅ Got ${workersInPage} workers (total so far: ${allWorkers.length})`);
    
    // If we got fewer workers than requested, we've reached the end
    if (workersInPage < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
    }
  }
  
  console.log(`\n✅ Total workers fetched: ${allWorkers.length}`);
  return allWorkers;
}

async function fetchWorkerTimecards(aoid, workerName, monthsBack = 3) {
  try {
    // Use /time-cards endpoint with expanded day entries (no supervisor required!)
    const endpoint = `/time/v2/workers/${aoid}/time-cards?$expand=dayentries`;
    console.log(`  📋 Fetching timecards for ${workerName}...`);
    
    const response = await makeADPRequest(endpoint, 'GET', null, { 'roleCode': 'employee' });
    
    // Note: Response uses 'timeCards' (not 'teamTimeCards')
    if (response.timeCards && response.timeCards.length > 0) {
      // Filter for last N months
      const cutoffDate = DateTime.now().minus({ months: monthsBack });
      const filteredCards = response.timeCards.filter(card => {
        const startDate = card.timePeriod?.startDate;
        if (!startDate) return false;
        const cardDate = DateTime.fromISO(startDate);
        return cardDate >= cutoffDate;
      });
      
      console.log(`  ✅ Found ${filteredCards.length} timecards (last ${monthsBack} months)`);
      return filteredCards;
    }
    return [];
  } catch (err) {
    console.log(`  ⚠️  Skipping ${workerName}: ${err.message}`);
    return [];
  }
}

// ============================================================================
// Database Loaders
// ============================================================================

async function loadWorkersToDatabase(workers, client) {
  console.log('\n💾 Loading workers to database...');
  let inserted = 0, updated = 0, skipped = 0;
  
  for (const worker of workers) {
    try {
      const person = worker.person;
      const driverId = worker.associateOID;
      const driverName = person?.legalName?.formattedName || 'Unknown';
      const status = worker.workerStatus?.statusCode?.codeValue;
      const hireDate = worker.workerDates?.originalHireDate;
      const email = worker.businessCommunication?.emails?.[0]?.emailUri;
      
      // Determine employment status
      const employmentStatus = status === 'Active' ? 'active' : 'terminated';
      const driverStatus = status === 'Active' ? 'active' : 'inactive';
      
      const result = await client.query(
        `INSERT INTO drivers (
          driver_id, 
          driver_name, 
          driver_status, 
          employment_status,
          hire_date,
          created_at, 
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (driver_id) 
        DO UPDATE SET 
          driver_name = EXCLUDED.driver_name,
          driver_status = EXCLUDED.driver_status,
          employment_status = EXCLUDED.employment_status,
          hire_date = EXCLUDED.hire_date,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted`,
        [driverId, driverName, driverStatus, employmentStatus, hireDate || null]
      );
      
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      console.log(`  ✅ ${driverName} (${driverId}) - ${status}`);
    } catch (err) {
      console.error(`  ❌ Error loading worker: ${err.message}`);
      skipped++;
    }
  }
  
  console.log(`\n📊 Workers Summary:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  
  return { inserted, updated, skipped };
}

async function loadTimecardsToDatabase(workerTimecards, client) {
  console.log('\n💾 Loading timecards to database...');
  let inserted = 0, updated = 0, skipped = 0;
  
  for (const { aoid, name, timecards } of workerTimecards) {
    for (const timecard of timecards) {
      try {
        // Extract day entries with time punches
        const dayEntries = timecard.dayEntries || [];
        
        for (const dayEntry of dayEntries) {
          const entryDate = dayEntry.entryDate;
          const timeEntries = dayEntry.timeEntries || [];
          
          // Process each time entry (punch in/out pair)
          for (let idx = 0; idx < timeEntries.length; idx++) {
            const timeEntry = timeEntries[idx];
            
            // Get start and end times
            const inTime = timeEntry.startPeriod?.startDateTime;
            const outTime = timeEntry.endPeriod?.endDateTime;
            
            // Only insert if we have both clock in and clock out times
            if (inTime && outTime) {
              const clockIn = DateTime.fromISO(inTime).toJSDate();
              const clockOut = DateTime.fromISO(outTime).toJSDate();
              const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
              
              // Create unique ID for this timecard entry
              const timecardId = `${aoid}-${entryDate}-${idx}`;
              
              const result = await client.query(
                `INSERT INTO timecards (
                  timecard_id,
                  employee_id,
                  clock_in_time,
                  clock_out_time,
                  total_hours_worked,
                  date,
                  created_at,
                  updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                ON CONFLICT (timecard_id)
                DO UPDATE SET
                  clock_out_time = EXCLUDED.clock_out_time,
                  total_hours_worked = EXCLUDED.total_hours_worked,
                  updated_at = NOW()
                RETURNING (xmax = 0) AS inserted`,
                [timecardId, aoid, clockIn, clockOut, hoursWorked, entryDate]
              );
              
              if (result.rows[0].inserted) {
                inserted++;
              } else {
                updated++;
              }
              
              console.log(`  ✅ ${name} - ${entryDate} (${hoursWorked.toFixed(2)} hrs)`);
            }
          }
        }
      } catch (err) {
        console.error(`  ❌ Error loading timecard for ${name}: ${err.message}`);
        skipped++;
      }
    }
  }
  
  console.log(`\n📊 Timecards Summary:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  
  return { inserted, updated, skipped };
}

// ============================================================================
// Main Menu & Execution
// ============================================================================

async function showAvailableReports() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║            ADP REPORTS AVAILABLE FOR YOUR ACCOUNT             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 AVAILABLE REPORTS:\n');
  console.log('1. ✅ EMPLOYEES/WORKERS REPORT');
  console.log('   Endpoint: /hr/v2/workers');
  console.log('   Description: Complete employee data including:');
  console.log('   - Employee names, IDs, and status');
  console.log('   - Hire dates and employment status');
  console.log('   - Contact information (emails)');
  console.log('   - Active vs terminated workers');
  console.log('   Status: FULLY ACCESSIBLE\n');
  
  console.log('2. ✅ TIMECARDS REPORT');
  console.log('   Endpoint: /time/v2/workers/{aoid}/team-time-cards');
  console.log('   Description: Time and attendance data including:');
  console.log('   - Clock in/out times');
  console.log('   - Time periods and pay periods');
  console.log('   - Timecard status (submitted, approved, etc.)');
  console.log('   - Daily time entries');
  console.log('   Status: ACCESSIBLE (requires supervisor setup for some workers)\n');
  
  console.log('3. ⚠️  PAYROLL REPORTS');
  console.log('   Endpoints: /payroll/v1/*');
  console.log('   Description: Payroll data including:');
  console.log('   - General ledger documents');
  console.log('   - Payroll output and statements');
  console.log('   - Earnings and deductions');
  console.log('   Status: REQUIRES ADDITIONAL ADP PERMISSIONS\n');
  
  console.log('4. ⚠️  BENEFITS REPORTS');
  console.log('   Endpoints: /benefits/v1/*');
  console.log('   Description: Employee benefits data');
  console.log('   Status: REQUIRES ADDITIONAL ADP PERMISSIONS\n');
  
  console.log('═══════════════════════════════════════════════════════════════════\n');
  console.log('💡 To request additional permissions:');
  console.log('   Contact ADP support with your Client ID: b2756f2e-79af-403c-9758-2bccecdcbd42\n');
}

async function loadReport(reportType, client) {
  console.log(`\n🚀 Loading ${reportType} report...\n`);
  
  switch (reportType) {
    case 'workers':
    case 'employees':
      const workers = await fetchAllWorkers();
      if (workers.length > 0) {
        await loadWorkersToDatabase(workers, client);
      }
      return workers.length;
      
    case 'timecards':
      const allWorkers = await fetchAllWorkers();
      const activeWorkers = allWorkers.filter(w => w.workerStatus?.statusCode?.codeValue === 'Active');
      console.log(`\n📋 Fetching timecards for ${activeWorkers.length} active workers (last 3 months)...`);
      
      const workerTimecards = [];
      for (const worker of activeWorkers) { // Process ALL active workers
        const aoid = worker.associateOID;
        const name = worker.person?.legalName?.formattedName || 'Unknown';
        const timecards = await fetchWorkerTimecards(aoid, name, 3); // Last 3 months
        if (timecards.length > 0) {
          workerTimecards.push({ aoid, name, timecards });
        }
      }
      
      if (workerTimecards.length > 0) {
        await loadTimecardsToDatabase(workerTimecards, client);
      }
      return workerTimecards.length;
      
    case 'all':
      console.log('📦 Loading ALL available reports (last 3 months)...\n');
      await loadReport('workers', client);
      await loadReport('timecards', client);
      
      // Sync driver_status to match employment_status from ADP
      console.log('\n🔄 Syncing driver_status to match ADP employment_status...');
      const synced = await client.query(`
        UPDATE drivers
        SET driver_status = CASE 
          WHEN employment_status = 'active' THEN 'active'
          ELSE 'inactive'
        END,
        updated_at = NOW()
        WHERE driver_id LIKE 'G3%'
      `);
      console.log(`✅ Synced ${synced.rowCount} ADP drivers to match employment status`);
      
      console.log('\n🎉 Complete! All ADP data loaded successfully.');
      return 'all';
      
    default:
      console.error(`❌ Unknown report type: ${reportType}`);
      return 0;
  }
}

async function testADPConnection() {
  console.log('\n🔍 Testing ADP connection...\n');
  try {
    const workers = await fetchAllWorkers();
    const activeWorkers = workers.filter(w => w.workerStatus?.statusCode?.codeValue === 'Active');
    const terminatedWorkers = workers.filter(w => w.workerStatus?.statusCode?.codeValue === 'Terminated');
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                  ADP CONNECTION SUCCESSFUL!                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Workforce Summary:`);
    console.log(`   Total Employees: ${workers.length}`);
    console.log(`   Active: ${activeWorkers.length}`);
    console.log(`   Terminated: ${terminatedWorkers.length}\n`);
    
    if (workers.length > 0) {
      console.log('👥 Recent Hires (last 5):');
      const recentHires = workers
        .filter(w => w.workerDates?.originalHireDate)
        .sort((a, b) => new Date(b.workerDates.originalHireDate) - new Date(a.workerDates.originalHireDate))
        .slice(0, 5);
      
      recentHires.forEach(w => {
        console.log(`   - ${w.person?.legalName?.formattedName} (hired ${w.workerDates.originalHireDate})`);
      });
    }
    
    return true;
  } catch (err) {
    console.error('\n❌ ADP Connection Failed:', err.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const reportType = args[1]?.toLowerCase();
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              ADP REPORTS LOADER FOR CAZAR LOGISTICS           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  // Show usage if no command
  if (!command) {
    console.log('📖 USAGE:\n');
    console.log('  node scripts/load_adp_reports.mjs <command> [report-type]\n');
    console.log('COMMANDS:\n');
    console.log('  list          - List all available ADP reports');
    console.log('  test          - Test ADP connection and show summary');
    console.log('  load <type>   - Load specific report to database\n');
    console.log('REPORT TYPES:\n');
    console.log('  workers       - Load employee/worker data');
    console.log('  timecards     - Load timecard data');
    console.log('  all           - Load all available reports\n');
    console.log('EXAMPLES:\n');
    console.log('  node scripts/load_adp_reports.mjs list');
    console.log('  node scripts/load_adp_reports.mjs test');
    console.log('  node scripts/load_adp_reports.mjs load workers');
    console.log('  node scripts/load_adp_reports.mjs load timecards');
    console.log('  node scripts/load_adp_reports.mjs load all\n');
    process.exit(0);
  }
  
  try {
    // Handle list command
    if (command === 'list') {
      await showAvailableReports();
      process.exit(0);
    }
    
    // Handle test command
    if (command === 'test') {
      const success = await testADPConnection();
      process.exit(success ? 0 : 1);
    }
    
    // Handle load command
    if (command === 'load') {
      if (!reportType) {
        console.error('❌ Please specify a report type: workers, timecards, or all');
        process.exit(1);
      }
      
      // Connect to database
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        console.error('❌ DATABASE_URL not found in environment');
        process.exit(1);
      }
      
      console.log('🔌 Connecting to database...');
      const pool = new pg.Pool({ 
        connectionString: dbUrl, 
        ssl: { rejectUnauthorized: false } 
      });
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        const result = await loadReport(reportType, client);
        
        await client.query('COMMIT');
        console.log('\n✅ All data committed to database successfully!\n');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error loading report, rolled back:', err.message);
        throw err;
      } finally {
        client.release();
        await pool.end();
      }
      
      process.exit(0);
    }
    
    console.error(`❌ Unknown command: ${command}`);
    console.log('Run without arguments to see usage.');
    process.exit(1);
    
  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();


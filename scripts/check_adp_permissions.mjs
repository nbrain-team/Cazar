#!/usr/bin/env node
/**
 * Check ADP API Permissions
 * Tests which API endpoints are accessible with current credentials
 */

import https from 'https';
import querystring from 'querystring';

const ADP_CLIENT_ID = process.env.ADP_CLIENT_ID || 'b2756f2e-79af-403c-9758-2bccecdcbd42';
const ADP_CLIENT_SECRET = process.env.ADP_CLIENT_SECRET || '9ebde91d-f4ea-4f7e-8d00-7cfdcd6ece66';
const ADP_CERTIFICATE = process.env.ADP_CERTIFICATE;
const ADP_PRIVATE_KEY = process.env.ADP_PRIVATE_KEY;

function cleanPEM(pem, type = 'CERTIFICATE') {
  if (!pem) return null;
  if (pem.startsWith('"') && pem.endsWith('"')) pem = pem.slice(1, -1);
  pem = pem.replace(/\\n/g, '\n');
  const beginMarker = `-----BEGIN ${type}-----`;
  const endMarker = `-----END ${type}-----`;
  let base64Content = pem;
  if (pem.includes(beginMarker)) base64Content = pem.split(beginMarker)[1];
  if (base64Content.includes(endMarker)) base64Content = base64Content.split(endMarker)[0];
  base64Content = base64Content.replace(/[\s\n\r]/g, '');
  const lines = [beginMarker];
  for (let i = 0; i < base64Content.length; i += 64) {
    lines.push(base64Content.substring(i, i + 64));
  }
  lines.push(endMarker);
  return lines.join('\n');
}

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const cert = cleanPEM(ADP_CERTIFICATE, 'CERTIFICATE');
    const key = cleanPEM(ADP_PRIVATE_KEY, 'PRIVATE KEY');
    
    const postData = querystring.stringify({
      grant_type: 'client_credentials',
      client_id: ADP_CLIENT_ID,
      client_secret: ADP_CLIENT_SECRET
    });
    
    const options = {
      hostname: 'accounts.adp.com',
      port: 443,
      path: '/auth/oauth/v2/token',
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
          const parsed = JSON.parse(data);
          resolve(parsed.access_token);
        } else {
          reject(new Error(`Token request failed: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testEndpoint(token, endpoint, name) {
  return new Promise((resolve) => {
    const cert = cleanPEM(ADP_CERTIFICATE, 'CERTIFICATE');
    const key = cleanPEM(ADP_PRIVATE_KEY, 'PRIVATE KEY');
    
    const url = new URL(endpoint, 'https://api.adp.com');
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      cert,
      key,
      rejectUnauthorized: true,
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          endpoint: name,
          status: res.statusCode,
          accessible: res.statusCode === 200,
          error: res.statusCode >= 400 ? data : null
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({
        endpoint: name,
        status: 0,
        accessible: false,
        error: err.message
      });
    });
    
    req.end();
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║          ADP API PERMISSIONS CHECK                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('🔐 Client ID:', ADP_CLIENT_ID);
  console.log('🔑 Getting access token...\n');
  
  try {
    const token = await getAccessToken();
    console.log('✅ Access token obtained\n');
    
    console.log('🧪 Testing API endpoints...\n');
    
    const endpoints = [
      { path: '/hr/v2/workers', name: 'Workers/Employees (HR)' },
      { path: '/time/v2/workers', name: 'Time & Attendance Workers' },
      { path: '/payroll/v1/payroll-output', name: 'Payroll Output' },
      { path: '/payroll/v1/general-ledger/documents', name: 'General Ledger' },
      { path: '/benefits/v1/workers', name: 'Benefits' },
    ];
    
    const results = [];
    for (const ep of endpoints) {
      const result = await testEndpoint(token, ep.path, ep.name);
      results.push(result);
      
      const status = result.accessible ? '✅ ACCESSIBLE' : '❌ BLOCKED';
      console.log(`${status} - ${result.endpoint}`);
      if (!result.accessible && result.error) {
        try {
          const errorData = JSON.parse(result.error);
          const msg = errorData.confirmMessage?.processMessages?.[0]?.userMessage?.messageTxt || 
                     errorData.error_description || 
                     'Unknown error';
          console.log(`   └─ ${msg}`);
        } catch {
          console.log(`   └─ Status: ${result.status}`);
        }
      }
    }
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    const accessible = results.filter(r => r.accessible).length;
    const blocked = results.filter(r => !r.accessible).length;
    
    console.log(`📊 Status: ${accessible}/${results.length} endpoints accessible`);
    console.log(`   ✅ Working: ${accessible}`);
    console.log(`   ❌ Blocked: ${blocked}\n`);
    
    if (blocked > 0) {
      console.log('💡 TO REQUEST ACCESS:\n');
      console.log('1. Contact: apisupport@adp.com');
      console.log('2. Subject: "API Scope Request for Client ID b2756f2e-79af-403c-9758-2bccecdcbd42"');
      console.log('3. Request access to:');
      results.filter(r => !r.accessible).forEach(r => {
        console.log(`   - ${r.endpoint}`);
      });
      console.log('\n4. Reference: ADP Workforce Now Marketplace App\n');
    }
    
    // Now test specific worker timecards
    console.log('🧪 Testing Timecard Access for Specific Worker...\n');
    const testWorkerId = 'G33FP2C9PQVTN34E'; // Kamau Adams
    const timecardResult = await testEndpoint(
      token, 
      `/time/v2/workers/${testWorkerId}/team-time-cards`,
      'Team Time Cards'
    );
    
    if (timecardResult.accessible) {
      console.log('✅ Timecard API is accessible!');
      console.log('   Issue is likely supervisor assignment in ADP Workforce Now\n');
    } else {
      console.log('❌ Timecard API blocked');
      if (timecardResult.error) {
        try {
          const errorData = JSON.parse(timecardResult.error);
          const msg = errorData.confirmMessage?.processMessages?.[0]?.userMessage?.messageTxt;
          console.log(`   Error: ${msg}`);
          
          if (msg && msg.includes('Supervisor')) {
            console.log('\n💡 SOLUTION: Assign supervisors to workers in ADP Workforce Now');
            console.log('   1. Log into ADP Workforce Now');
            console.log('   2. Go to Workforce → Workers');
            console.log('   3. Select each worker → Job tab → Position');
            console.log('   4. Assign a supervisor in "Reports To" field\n');
          }
        } catch {
          console.log(`   Status: ${timecardResult.status}\n`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();


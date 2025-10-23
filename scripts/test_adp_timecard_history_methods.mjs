#!/usr/bin/env node
import https from 'https';
import querystring from 'querystring';
import { DateTime } from 'luxon';

const ADP_AUTH_BASE = 'https://accounts.adp.com';
const ADP_API_BASE = 'https://api.adp.com';
let tokenCache = { token: null, expiresAt: null };

function cleanPEM(pem, type = 'CERTIFICATE') {
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

function getADPCredentials() {
  const clientId = process.env.ADP_CLIENT_ID;
  const clientSecret = process.env.ADP_CLIENT_SECRET;
  let cert = process.env.ADP_CERTIFICATE;
  let key = process.env.ADP_PRIVATE_KEY;
  if (!clientId || !clientSecret || !cert || !key) throw new Error('ADP credentials not configured');
  return { clientId, clientSecret, cert: cleanPEM(cert, 'CERTIFICATE'), key: cleanPEM(key, 'PRIVATE KEY') };
}

async function getAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  return new Promise((resolve, reject) => {
    const { clientId, clientSecret, cert, key } = getADPCredentials();
    const postData = querystring.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
    const url = new URL('/auth/oauth/v2/token', ADP_AUTH_BASE);
    const req = https.request({ hostname: url.hostname, port: 443, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }, cert, key, rejectUnauthorized: true }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          const parsed = JSON.parse(data);
          tokenCache.token = parsed.access_token;
          tokenCache.expiresAt = Date.now() + ((parsed.expires_in || 3600) * 1000);
          resolve(tokenCache.token);
        } else reject(new Error(`Token failed: ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function makeADPRequest(endpoint, headers = {}) {
  const accessToken = await getAccessToken();
  const { cert, key } = getADPCredentials();
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, ADP_API_BASE);
    const req = https.request({ hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers }, cert, key, rejectUnauthorized: true }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          resolve({ error: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('🔍 Searching for Historical Timecard Access Methods...\n');
  
  const workers = await makeADPRequest('/hr/v2/workers?$top=5');
  const activeWorker = workers.workers.find(w => w.workerStatus?.statusCode?.codeValue === 'Active');
  const aoid = activeWorker.associateOID;
  const name = activeWorker.person?.legalName?.formattedName;
  
  console.log(`Testing with: ${name} (${aoid})\n`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Try various approaches to get historical data
  const tests = [
    // Specific previous dates
    { name: 'Specific date range (last 12 weeks)', endpoint: `/time/v2/workers/${aoid}/time-cards?asOfDate=${DateTime.now().minus({weeks: 12}).toISODate()}&$expand=dayentries` },
    { name: 'From date parameter', endpoint: `/time/v2/workers/${aoid}/time-cards?fromDate=${DateTime.now().minus({weeks: 12}).toISODate()}&$expand=dayentries` },
    { name: 'Time period filter', endpoint: `/time/v2/workers/${aoid}/time-cards?timePeriod.startDate=${DateTime.now().minus({weeks: 12}).toISODate()}&$expand=dayentries` },
    
    // Period codes
    { name: 'All periods', endpoint: `/time/v2/workers/${aoid}/time-cards?periodCode=all&$expand=dayentries` },
    { name: 'Historical period', endpoint: `/time/v2/workers/${aoid}/time-cards?periodCode=historical&$expand=dayentries` },
    { name: 'Previous period', endpoint: `/time/v2/workers/${aoid}/time-cards?periodCode=previous&$expand=dayentries` },
    
    // Aggregated reports
    { name: 'Time reports endpoint', endpoint: `/time/v2/time-reports` },
    { name: 'Worker time reports', endpoint: `/time/v2/workers/${aoid}/time-reports` },
    { name: 'Payroll export (if accessible)', endpoint: `/payroll/v1/workers/${aoid}/pay-data-input` },
  ];
  
  for (const test of tests) {
    console.log(`TEST: ${test.name}`);
    console.log(`  Endpoint: ${test.endpoint}`);
    
    const result = await makeADPRequest(test.endpoint, { 'roleCode': 'employee' });
    
    if (result.error) {
      console.log(`  ❌ Failed: ${result.error}`);
    } else if (result.timeCards) {
      console.log(`  ✅ Got ${result.timeCards.length} timecards`);
      result.timeCards.forEach(tc => {
        console.log(`     - ${tc.timePeriod?.startDate} to ${tc.timePeriod?.endDate}`);
      });
    } else {
      console.log(`  ⚠️  Response keys: ${Object.keys(result).join(', ')}`);
    }
    console.log('');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎯 CONCLUSION:');
  console.log('If all tests fail to return historical data, then:');
  console.log('1. ADP API does not provide historical timecards via API');
  console.log('2. You need to export historical data from ADP Workforce Now');
  console.log('3. Or use weekly syncs to build history going forward');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});


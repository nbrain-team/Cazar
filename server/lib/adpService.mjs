import https from 'https';
import querystring from 'querystring';

// ADP API configuration
const ADP_AUTH_BASE = 'https://accounts.adp.com';
const ADP_API_BASE = 'https://api.adp.com';

// Token cache
let tokenCache = {
  token: null,
  expiresAt: null
};

// Load OAuth credentials and certificate from environment
function getADPCredentials() {
  const clientId = process.env.ADP_CLIENT_ID;
  const clientSecret = process.env.ADP_CLIENT_SECRET;
  const cert = process.env.ADP_CERTIFICATE;
  const key = process.env.ADP_PRIVATE_KEY;
  
  if (!clientId || !clientSecret) {
    throw new Error('ADP_CLIENT_ID or ADP_CLIENT_SECRET not configured in environment');
  }
  if (!cert || !key) {
    throw new Error('ADP_CERTIFICATE or ADP_PRIVATE_KEY not configured in environment');
  }
  
  return { clientId, clientSecret, cert, key };
}

// Get OAuth access token (with caching)
async function getAccessToken() {
  // Return cached token if still valid (with 5 minute buffer)
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt - 300000) {
    console.log('[ADP OAuth] Using cached access token');
    return tokenCache.token;
  }
  
  console.log('[ADP OAuth] Requesting new access token...');
  
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
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              const token = parsed.access_token;
              const expiresIn = parsed.expires_in || 3600; // Default 1 hour
              
              // Cache the token
              tokenCache.token = token;
              tokenCache.expiresAt = Date.now() + (expiresIn * 1000);
              
              console.log(`[ADP OAuth] ✅ Access token obtained, expires in ${expiresIn}s`);
              resolve(token);
            } catch (err) {
              reject(new Error(`Failed to parse token response: ${err.message}`));
            }
          } else {
            console.error(`[ADP OAuth] Token request failed: ${res.statusCode}`);
            console.error(`[ADP OAuth] Response: ${data}`);
            reject(new Error(`OAuth token request failed: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (err) => {
        console.error(`[ADP OAuth] Request error: ${err.message}`);
        reject(err);
      });
      
      req.write(postData);
      req.end();
    } catch (error) {
      console.error(`[ADP OAuth] Setup error: ${error.message}`);
      reject(error);
    }
  });
}

// Make authenticated request to ADP API
async function makeADPRequest(endpoint, method = 'GET', body = null, additionalHeaders = {}) {
  try {
    const accessToken = await getAccessToken();
    const { cert, key } = getADPCredentials();
    
    console.log(`[ADP API] Making ${method} request to: ${endpoint}`);
    
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
        console.log(`[ADP API] Response status: ${res.statusCode}`);
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`[ADP API] Response data length: ${data.length} bytes`);
          
          // Log full response if error status
          if (res.statusCode >= 400) {
            console.error(`[ADP API] ERROR Response (${res.statusCode}): ${data}`);
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (res.statusCode === 200) {
              console.log(`[ADP API] ✅ Success`);
              resolve(parsed);
            } else {
              console.error(`[ADP API] API returned error status ${res.statusCode}`);
              reject(new Error(`ADP API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            }
          } catch (err) {
            if (res.statusCode === 200) {
              console.log(`[ADP API] Non-JSON response, returning raw data`);
              resolve({ raw: data });
            } else {
              reject(new Error(`ADP API error ${res.statusCode}: ${data}`));
            }
          }
        });
      });
      
      req.on('error', (err) => {
        console.error(`[ADP API] Request error: ${err.message}`);
        reject(err);
      });
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  } catch (error) {
    console.error(`[ADP API] Error: ${error.message}`);
    throw error;
  }
}

// Get all workers
export async function searchEmployees(query = '') {
  try {
    console.log(`[ADP Employees] Searching for: "${query}"`);
    
    const response = await makeADPRequest('/hr/v2/workers');
    
    const results = [];
    
    if (response.workers && Array.isArray(response.workers)) {
      console.log(`[ADP Employees] Found ${response.workers.length} total workers`);
      
      // Filter by query if provided
      const filtered = query ? response.workers.filter(worker => {
        const name = worker.person?.legalName?.formattedName || '';
        const id = worker.associateOID || '';
        return name.toLowerCase().includes(query.toLowerCase()) || 
               id.toLowerCase().includes(query.toLowerCase());
      }) : response.workers;
      
      console.log(`[ADP Employees] ${filtered.length} workers match query`);
      
      for (const worker of filtered.slice(0, 10)) {  // Limit to 10 results
        const person = worker.person;
        const employment = worker.businessCommunication?.emails?.[0];
        
        results.push({
          type: 'employee',
          title: person?.legalName?.formattedName || 'Unknown Employee',
          employeeId: worker.associateOID,
          email: employment?.emailUri,
          hireDate: worker.workerDates?.originalHireDate,
          status: worker.workerStatus?.statusCode?.codeValue,
          snippet: `Employee ID: ${worker.associateOID} - Status: ${worker.workerStatus?.statusCode?.codeValue || 'Unknown'}`,
        });
      }
    } else {
      console.log(`[ADP Employees] No workers in response`);
    }
    
    console.log(`[ADP Employees] Returning ${results.length} results`);
    return results;
  } catch (error) {
    console.error('[ADP Employees] Search error:', error.message);
    return [];
  }
}

// Get worker timecards
export async function searchTimeCards(query, options = {}) {
  try {
    console.log(`[ADP Timecards] Searching timecards for query: "${query}"`);
    
    // First, get workers to find AOIDs
    const workersResponse = await makeADPRequest('/hr/v2/workers');
    
    if (!workersResponse.workers || workersResponse.workers.length === 0) {
      console.log('[ADP Timecards] No workers found');
      return [];
    }
    
    console.log(`[ADP Timecards] Found ${workersResponse.workers.length} workers, checking timecards...`);
    
    const results = [];
    
    // Get timecards for first few active workers
    const activeWorkers = workersResponse.workers
      .filter(w => w.workerStatus?.statusCode?.codeValue === 'Active')
      .slice(0, 5);
    
    for (const worker of activeWorkers) {
      try {
        const aoid = worker.associateOID;
        const endpoint = `/time/v2/workers/${aoid}/team-time-cards`;
        
        const timecardsResponse = await makeADPRequest(endpoint, 'GET', null, { 'roleCode': 'employee' });
        
        if (timecardsResponse.teamTimeCards && timecardsResponse.teamTimeCards.length > 0) {
          console.log(`[ADP Timecards] Found ${timecardsResponse.teamTimeCards.length} timecards for ${worker.person?.legalName?.formattedName}`);
          
          timecardsResponse.teamTimeCards.forEach(timecard => {
            results.push({
              type: 'timecard',
              title: `Timecard for ${worker.person?.legalName?.formattedName || 'Unknown'}`,
              employeeId: aoid,
              employeeName: worker.person?.legalName?.formattedName,
              period: `${timecard.timePeriod?.startDate || 'N/A'} to ${timecard.timePeriod?.endDate || 'N/A'}`,
              status: timecard.timeCardStatus?.statusCode?.codeValue || 'Unknown',
              snippet: `Timecard period: ${timecard.timePeriod?.startDate || 'N/A'} to ${timecard.timePeriod?.endDate || 'N/A'} - Status: ${timecard.timeCardStatus?.statusCode?.codeValue || 'Unknown'}`,
            });
          });
        }
      } catch (err) {
        // Skip workers that fail (e.g., missing supervisor)
        console.log(`[ADP Timecards] Skipping worker ${worker.associateOID}: ${err.message}`);
      }
    }
    
    console.log(`[ADP Timecards] Returning ${results.length} total timecard results`);
    return results;
  } catch (error) {
    console.error('[ADP Timecards] Search error:', error.message);
    return [];
  }
}

// Main search function
export async function searchADP(query, options = {}) {
  try {
    console.log(`[ADP] Starting search for query: "${query}"`);
    console.log(`[ADP] Options provided:`, options);
    
    const lowerQuery = query.toLowerCase();
    const searches = [];
    
    // Always search employees
    console.log('[ADP] Searching employees...');
    searches.push(searchEmployees(query));
    
    // Search timecards if query mentions hours, time, timecard, etc.
    if (lowerQuery.includes('hours') || lowerQuery.includes('time') || 
        lowerQuery.includes('timecard') || lowerQuery.includes('attendance')) {
      console.log('[ADP] Searching timecards...');
      searches.push(searchTimeCards(query, options));
    }
    
    console.log(`[ADP] Running ${searches.length} searches in parallel...`);
    
    const results = await Promise.allSettled(searches);
    const allResults = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        console.log(`[ADP] Search ${i + 1} returned ${result.value.length} results`);
        allResults.push(...result.value);
      } else if (result.status === 'rejected') {
        console.error(`[ADP] Search ${i + 1} failed:`, result.reason?.message || result.reason);
      }
    }
    
    console.log(`[ADP] Found ${allResults.length} total results`);
    return allResults.slice(0, 10);
  } catch (error) {
    console.error('[ADP] Main search error:', error.message);
    return [{
      type: 'adp',
      title: 'ADP API Error',
      snippet: `Error connecting to ADP: ${error.message}`,
    }];
  }
}

// Helper to get summary data
export async function getADPSummary() {
  try {
    console.log('[ADP Summary] Fetching summary data...');
    
    const response = await makeADPRequest('/hr/v2/workers');
    
    if (!response.workers) {
      return {
        totalWorkers: 0,
        activeWorkers: 0,
        terminatedWorkers: 0
      };
    }
    
    const workers = response.workers;
    const activeWorkers = workers.filter(w => w.workerStatus?.statusCode?.codeValue === 'Active');
    const terminatedWorkers = workers.filter(w => w.workerStatus?.statusCode?.codeValue === 'Terminated');
    
    const summary = {
      totalWorkers: workers.length,
      activeWorkers: activeWorkers.length,
      terminatedWorkers: terminatedWorkers.length,
      recentHires: workers
        .filter(w => w.workerDates?.originalHireDate)
        .sort((a, b) => new Date(b.workerDates.originalHireDate) - new Date(a.workerDates.originalHireDate))
        .slice(0, 5)
        .map(w => ({
          name: w.person?.legalName?.formattedName || 'Unknown',
          hireDate: w.workerDates?.originalHireDate,
          id: w.associateOID
        }))
    };
    
    console.log('[ADP Summary] Summary generated:', summary);
    return summary;
  } catch (error) {
    console.error('[ADP Summary] Error:', error.message);
    throw error;
  }
}

import https from 'https';
import crypto from 'crypto';

// ADP API configuration
const ADP_API_BASE = 'https://api.adp.com';

// Load certificate and key from environment variables
function getCertificateConfig() {
  const cert = process.env.ADP_CERTIFICATE;
  const key = process.env.ADP_PRIVATE_KEY;
  
  if (!cert || !key) {
    throw new Error('ADP certificate or private key not configured in environment');
  }
  
  // Log certificate info (but not the actual certificate for security)
  const certPreview = cert.substring(0, 50) + '...' + cert.substring(cert.length - 50);
  console.log(`[ADP] Certificate loaded: ${cert.length} characters, starts with: ${cert.substring(0, 30)}...`);
  console.log(`[ADP] Private key loaded: ${key.length} characters`);
  
  // Check if certificate appears valid
  if (!cert.includes('-----BEGIN CERTIFICATE-----') || !cert.includes('-----END CERTIFICATE-----')) {
    console.warn('[ADP] WARNING: Certificate does not appear to be in valid PEM format');
  }
  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    console.warn('[ADP] WARNING: Private key does not appear to be in valid PEM format');
  }
  
  return { cert, key };
}

// Make authenticated request to ADP API
async function makeADPRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`[ADP API] Making ${method} request to: ${endpoint}`);
      const { cert, key } = getCertificateConfig();
      const url = new URL(endpoint, ADP_API_BASE);
      
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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
            console.log(`[ADP API] Successfully parsed JSON response with ${Object.keys(parsed).length} keys`);
            
            // If authentication error, reject with detailed message
            if (res.statusCode === 401) {
              const errorMsg = parsed.response?.error?.message || parsed.error?.message || parsed.message || 'Authentication failed';
              reject(new Error(`ADP API Authentication Failed (401): ${errorMsg}. Certificate may be expired or invalid.`));
              return;
            }
            
            // For other errors, log but continue
            if (res.statusCode >= 400) {
              console.error(`[ADP API] API returned error status ${res.statusCode}`);
            }
            
            resolve(parsed);
          } catch (err) {
            console.log(`[ADP API] Failed to parse JSON, returning raw data`);
            resolve({ raw: data });
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
    } catch (error) {
      console.error(`[ADP API] Setup error: ${error.message}`);
      reject(error);
    }
  });
}

// Search payroll data
export async function searchPayroll(query, options = {}) {
  try {
    console.log(`[ADP Payroll] Searching with options:`, options);
    const { startDate, endDate, employeeId } = options;
    
    // Build query parameters
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (employeeId) params.append('associateOID', employeeId);
    
    const endpoint = `/payroll/v1/payroll-output?${params.toString()}`;
    const response = await makeADPRequest(endpoint);
    
    // Parse and format payroll data
    const results = [];
    
    if (response.payrollOutput) {
      console.log(`[ADP Payroll] Found ${response.payrollOutput.length} payroll records`);
      for (const payroll of response.payrollOutput) {
        const employee = payroll.worker?.person;
        const earnings = payroll.payDistribution?.earnings || [];
        
        const totalGross = earnings.reduce((sum, e) => sum + (parseFloat(e.amount?.value) || 0), 0);
        
        results.push({
          type: 'payroll',
          title: `Payroll for ${employee?.legalName?.formattedName || 'Unknown'}`,
          employeeId: payroll.worker?.associateOID,
          employeeName: employee?.legalName?.formattedName,
          payDate: payroll.payDate,
          grossPay: totalGross,
          snippet: `Total gross pay: $${totalGross.toFixed(2)} on ${payroll.payDate}`,
        });
      }
    } else {
      console.log(`[ADP Payroll] No payrollOutput in response. Response keys: ${Object.keys(response).join(', ')}`);
    }
    
    console.log(`[ADP Payroll] Returning ${results.length} results`);
    return results;
  } catch (error) {
    console.error('[ADP Payroll] Search error:', error.message, error.stack);
    return [];
  }
}

// Get employee/worker information
export async function searchEmployees(query) {
  try {
    console.log(`[ADP Employees] Searching for: "${query}"`);
    // Search workers by name or ID
    const endpoint = '/hr/v2/workers';
    const response = await makeADPRequest(endpoint);
    
    const results = [];
    
    if (response.workers) {
      console.log(`[ADP Employees] Found ${response.workers.length} total workers`);
      const filtered = response.workers.filter(worker => {
        const name = worker.person?.legalName?.formattedName || '';
        const id = worker.associateOID || '';
        return name.toLowerCase().includes(query.toLowerCase()) || 
               id.toLowerCase().includes(query.toLowerCase());
      });
      
      console.log(`[ADP Employees] ${filtered.length} workers match query`);
      
      for (const worker of filtered.slice(0, 5)) {
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
      console.log(`[ADP Employees] No workers in response. Response keys: ${Object.keys(response).join(', ')}`);
    }
    
    console.log(`[ADP Employees] Returning ${results.length} results`);
    return results;
  } catch (error) {
    console.error('[ADP Employees] Search error:', error.message, error.stack);
    return [];
  }
}

// Get time and attendance data
export async function searchTimeAndAttendance(query, options = {}) {
  try {
    const { startDate, endDate, employeeId } = options;
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (employeeId) params.append('associateOID', employeeId);
    
    const endpoint = `/time/v2/time-cards?${params.toString()}`;
    const response = await makeADPRequest(endpoint);
    
    const results = [];
    
    if (response.timeCards) {
      for (const timeCard of response.timeCards) {
        const employee = timeCard.worker?.person;
        const entries = timeCard.timeCardEntries || [];
        
        const totalHours = entries.reduce((sum, entry) => {
          const hours = parseFloat(entry.duration?.hours) || 0;
          return sum + hours;
        }, 0);
        
        results.push({
          type: 'timecard',
          title: `Timecard for ${employee?.legalName?.formattedName || 'Unknown'}`,
          employeeId: timeCard.worker?.associateOID,
          employeeName: employee?.legalName?.formattedName,
          startDate: timeCard.timeCardPeriod?.startDate,
          endDate: timeCard.timeCardPeriod?.endDate,
          totalHours,
          snippet: `Total hours: ${totalHours.toFixed(2)} from ${timeCard.timeCardPeriod?.startDate} to ${timeCard.timeCardPeriod?.endDate}`,
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('ADP time and attendance search error:', error);
    return [];
  }
}

// Main search function that tries multiple ADP endpoints
export async function searchADP(query, options = {}) {
  try {
    console.log(`[ADP] Starting search for query: "${query}"`);
    console.log(`[ADP] Options provided:`, options);
    
    // Determine what to search based on query keywords
    const lowerQuery = query.toLowerCase();
    const searches = [];
    
    // Infer date ranges if query mentions "last week", "last month", etc.
    let inferredOptions = { ...options };
    if (lowerQuery.includes('last week') || lowerQuery.includes('recent week') || lowerQuery.includes('this week')) {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      inferredOptions.startDate = formatADPDate(startDate);
      inferredOptions.endDate = formatADPDate(endDate);
      console.log(`[ADP] Inferred date range for "last week": ${inferredOptions.startDate} to ${inferredOptions.endDate}`);
    } else if (lowerQuery.includes('last month') || lowerQuery.includes('recent month')) {
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 1);
      inferredOptions.startDate = formatADPDate(startDate);
      inferredOptions.endDate = formatADPDate(endDate);
      console.log(`[ADP] Inferred date range for "last month": ${inferredOptions.startDate} to ${inferredOptions.endDate}`);
    }
    
    // Always search employees for general queries
    console.log('[ADP] Searching employees...');
    searches.push(searchEmployees(query));
    
    // Search payroll if query mentions pay, salary, wages, etc.
    if (lowerQuery.includes('payroll') || lowerQuery.includes('pay') || 
        lowerQuery.includes('salary') || lowerQuery.includes('wage') ||
        lowerQuery.includes('earnings') || lowerQuery.includes('compensation')) {
      console.log('[ADP] Searching payroll...');
      searches.push(searchPayroll(query, inferredOptions));
    }
    
    // Search time & attendance if query mentions hours, time, attendance, etc.
    if (lowerQuery.includes('hours') || lowerQuery.includes('time') || 
        lowerQuery.includes('attendance') || lowerQuery.includes('timecard')) {
      console.log('[ADP] Searching time & attendance...');
      searches.push(searchTimeAndAttendance(query, inferredOptions));
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
    console.error('[ADP] Main search error:', error.message, error.stack);
    // Return informative error result instead of throwing
    return [{
      type: 'adp',
      title: 'ADP API Error',
      snippet: `ADP certificate authentication configured. Connection error: ${error.message}. Check if certificate is valid and ADP API endpoints are accessible.`,
    }];
  }
}

// Helper function to format dates for ADP API
export function formatADPDate(date) {
  return date.toISOString().split('T')[0];
}

// Get payroll summary for a date range
export async function getPayrollSummary(startDate, endDate) {
  try {
    const results = await searchPayroll('', { startDate, endDate });
    
    const summary = {
      totalEmployees: results.length,
      totalGrossPay: results.reduce((sum, r) => sum + (r.grossPay || 0), 0),
      payPeriod: { startDate, endDate },
      employees: results,
    };
    
    return summary;
  } catch (error) {
    console.error('ADP payroll summary error:', error);
    throw error;
  }
}


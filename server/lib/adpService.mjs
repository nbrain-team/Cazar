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
  
  return { cert, key };
}

// Make authenticated request to ADP API
async function makeADPRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    try {
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
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            resolve({ raw: data });
          }
        });
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Search payroll data
export async function searchPayroll(query, options = {}) {
  try {
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
    }
    
    return results;
  } catch (error) {
    console.error('ADP payroll search error:', error);
    return [];
  }
}

// Get employee/worker information
export async function searchEmployees(query) {
  try {
    // Search workers by name or ID
    const endpoint = '/hr/v2/workers';
    const response = await makeADPRequest(endpoint);
    
    const results = [];
    
    if (response.workers) {
      const filtered = response.workers.filter(worker => {
        const name = worker.person?.legalName?.formattedName || '';
        const id = worker.associateOID || '';
        return name.toLowerCase().includes(query.toLowerCase()) || 
               id.toLowerCase().includes(query.toLowerCase());
      });
      
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
    }
    
    return results;
  } catch (error) {
    console.error('ADP employee search error:', error);
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
    // Determine what to search based on query keywords
    const lowerQuery = query.toLowerCase();
    const searches = [];
    
    // Always search employees
    searches.push(searchEmployees(query));
    
    // Search payroll if query mentions pay, salary, wages, etc.
    if (lowerQuery.includes('payroll') || lowerQuery.includes('pay') || 
        lowerQuery.includes('salary') || lowerQuery.includes('wage')) {
      searches.push(searchPayroll(query, options));
    }
    
    // Search time & attendance if query mentions hours, time, attendance, etc.
    if (lowerQuery.includes('hours') || lowerQuery.includes('time') || 
        lowerQuery.includes('attendance') || lowerQuery.includes('timecard')) {
      searches.push(searchTimeAndAttendance(query, options));
    }
    
    const results = await Promise.allSettled(searches);
    const allResults = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allResults.push(...result.value);
      }
    }
    
    return allResults.slice(0, 10);
  } catch (error) {
    console.error('ADP search error:', error);
    // Return informative error result instead of throwing
    return [{
      type: 'adp',
      title: 'ADP API Configuration Needed',
      snippet: 'ADP certificate authentication is configured but API connection needs testing. Error: ' + error.message,
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


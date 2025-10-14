# ADP API Integration - Findings & Resolution

## Test Results (October 14, 2025)

### ✅ What's Working
- Certificate is **valid** and properly formatted (PEM format)
- Private key is **valid** and properly formatted
- Certificate is **not expired** (valid until September 17, 2027)
- Certificate is being sent correctly in HTTPS requests
- ADP API is reachable and responding

### ❌ What's NOT Working
- All API endpoints return **401 Unauthorized**
- Test endpoints tried:
  - `/hr/v2/workers` - 401
  - `/payroll/v1/payroll-output` - 401
  - `/time/v2/time-cards` - 401
  - `/events/hr/v1/worker.hire` - 401

## 🔍 Root Cause

**ADP uses OAuth 2.0 + Certificate authentication (two-factor authentication):**

1. **Certificate Authentication** - Used to obtain OAuth access tokens (what we have ✅)
2. **OAuth 2.0 Access Token** - Required for API requests (what we're missing ❌)

### The Authentication Flow Should Be:

```
Step 1: Get Access Token
POST https://api.adp.com/auth/oauth/v2/token
Headers:
  - Certificate (SSL/TLS)
  - Content-Type: application/x-www-form-urlencoded
Body:
  - client_id: YOUR_CLIENT_ID
  - client_secret: YOUR_CLIENT_SECRET
  - grant_type: client_credentials

Response: { "access_token": "...", "expires_in": 3600 }

Step 2: Use Access Token for API Requests
GET https://api.adp.com/hr/v2/workers
Headers:
  - Certificate (SSL/TLS)
  - Authorization: Bearer ACCESS_TOKEN
```

## 🚨 What We're Missing

**ADP OAuth Credentials:**
- `ADP_CLIENT_ID` - Not in environment
- `ADP_CLIENT_SECRET` - Not in environment

These credentials should have been provided when the certificate was issued by ADP.

## ✅ Solutions

### Option 1: Locate Missing Credentials (RECOMMENDED)
1. Check ADP Marketplace portal where the certificate was downloaded
2. Look for "API Credentials" or "Client Credentials" section
3. There should be a Client ID and Client Secret associated with the certificate
4. Add to environment variables:
   ```
   ADP_CLIENT_ID=your_client_id_here
   ADP_CLIENT_SECRET=your_client_secret_here
   ```

### Option 2: Contact ADP Support
If credentials cannot be found:
1. Contact ADP API Support
2. Reference: Certificate Common Name "nbrain" 
3. Certificate Organization: "Cazar Logistics LLC"
4. Certificate Email: rudy@cazarnyc.com
5. Request: OAuth client credentials for API access

### Option 3: Regenerate Credentials
If needed, regenerate full credentials from ADP Marketplace:
1. Login to ADP Marketplace
2. Navigate to your application/integration
3. Generate new certificate + OAuth credentials
4. Update all credentials in environment

## 📝 Next Steps

**Once OAuth credentials are obtained:**

1. Add to environment variables:
   ```
   ADP_CLIENT_ID=your_actual_client_id
   ADP_CLIENT_SECRET=your_actual_client_secret
   ```

2. Update `server/lib/adpService.mjs` to:
   - First, obtain access token using certificate + OAuth credentials
   - Cache the token (valid for 1 hour typically)
   - Use token in Authorization header for all API requests
   - Refresh token when expired

3. Implementation will look like:
   ```javascript
   // Get token
   const token = await getADPAccessToken();
   
   // Use token in requests
   headers: {
     'Authorization': `Bearer ${token}`,
     'Content-Type': 'application/json'
   }
   ```

## 🔧 Current Status

**Certificate Authentication:** ✅ Working  
**OAuth Token Retrieval:** ❌ Missing credentials  
**API Access:** ❌ Blocked by missing OAuth credentials  

**Blocker:** Need ADP_CLIENT_ID and ADP_CLIENT_SECRET to proceed

## 📚 References

- ADP API Authentication Guide: https://developers.adp.com/articles/guide/auth-guide
- Certificate Info: Valid 2025-09-17 to 2027-09-17
- Organization: Cazar Logistics LLC
- Contact: rudy@cazarnyc.com


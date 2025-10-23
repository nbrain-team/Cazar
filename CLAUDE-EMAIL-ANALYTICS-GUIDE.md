# Claude 4.5 Email Analytics System - Complete Guide

## 🎯 Overview

You now have a powerful email analytics system powered by **Claude 4.5 (Anthropic)** that can answer complex natural language questions about your email operations.

## ✅ What Was Built

### Core Components

1. **Email Analytics Database** (`email_analytics` table)
   - Stores processed emails with AI-extracted metadata
   - Tracks requests, responses, response times, categories
   - Built-in views for common queries
   - Automatic response linking

2. **Claude 4.5 Integration** (`claudeEmailService.mjs`)
   - Analyzes emails to extract metadata
   - Categorizes by type (PTO, Payroll, Fleet, HR, Uniform, etc.)
   - Generates SQL queries from natural language
   - Formats results into human-readable responses

3. **Microsoft Graph Email Sync** (`emailFetchService.mjs`, `emailSyncService.mjs`)
   - Fetches emails from all mailboxes
   - Processes with Claude 4.5
   - Stores in database with full metadata
   - Runs automatically or on-demand

4. **Smart Agent Integration**
   - Enhanced to handle email queries
   - Uses Claude 4.5 for intelligent responses
   - Combines email data with other sources

5. **API Endpoints** (7 new endpoints)
   - Query emails with natural language
   - Get analytics and metrics
   - Trigger manual syncs
   - View unanswered requests

## 🚀 Environment Variables Required

Add to your Render environment variables:

```env
# Anthropic Claude 4.5 API Key (REQUIRED - get from console.anthropic.com)
ANTHROPIC_API_KEY=<your-anthropic-api-key>

# Microsoft credentials (ALREADY CONFIGURED ✅)
MICROSOFT_CLIENT_ID=<already-set>
MICROSOFT_CLIENT_SECRET=<already-set>
MICROSOFT_TENANT_ID=<already-set>

# Database (ALREADY CONFIGURED ✅)
DATABASE_URL=<already-set>
```

## 📋 Setup Steps

### Step 1: Get Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Go to API Keys section
4. Create new key
5. Copy the key (starts with `sk-ant-...`)

### Step 2: Add to Render

1. Go to Render Dashboard
2. Select your service (cazar-main)
3. Environment → Add Environment Variable
4. Key: `ANTHROPIC_API_KEY`
5. Value: `<your-key>`
6. Save

### Step 3: Deploy & Initialize

The deployment will:
- Install Anthropic SDK
- Create email_analytics database
- Enable email analytics APIs
- Enhance Smart Agent

After deployment, initialize:
```bash
# Via Render shell or API:
POST https://cazar-main.onrender.com/api/email-analytics/initialize
```

### Step 4: First Sync

Trigger your first email sync:
```bash
POST https://cazar-main.onrender.com/api/email-analytics/sync
# Defaults to last 30 days (720 hours)
# Or customize with: Body: { "hoursBack": 168 }  # Last 7 days
```

## 💬 Example Queries You Can Ask

### Via Smart Agent (Enable "Email" or "Microsoft" database)

**Driver Requests:**
- "Show all PTO requests in the last 7 days with response status"
- "Which driver requests haven't been answered in 48 hours?"
- "What's the average response time for scheduling requests?"

**Uniform Requests:**
- "Show all uniform requests submitted in the past 14 days and their status"
- "Who handles most uniform requests?"

**Email Volume:**
- "Count total emails received by category by day this month"
- "How many Fleet emails did we receive this week?"

**Response Metrics:**
- "Show average first-response time by category this month"
- "Count responses sent by day per responder"
- "Who has the fastest response time for Payroll emails?"

**Incident Tracking:**
- "List emails with attachments related to incidents"
- "Show all incident-related emails and who handled them"

**Forwarding:**
- "Count emails forwarded to John this week"
- "Show me all emails forwarded to Rudy"

**Pending Items:**
- "Show emails older than 48 hours without any response"
- "What requests are pending action?"

### Via Direct API

```javascript
// Example: Query with natural language
POST /api/email-analytics/query
{
  "query": "Show all PTO requests from the last 7 days"
}

Response:
{
  "response": "Found 12 PTO requests in the last 7 days. 8 have been responded to (avg 6.5 hours), 4 are still pending...",
  "data": [...],
  "result_type": "list",
  "explanation": "Query searches for PTO requests within date range"
}
```

## 📊 API Endpoints

### 1. Initialize Database
```
POST /api/email-analytics/initialize
Creates the email_analytics database schema
```

### 2. Sync Emails
```
POST /api/email-analytics/sync
Body: { "hoursBack": 48, "maxPerMailbox": 200 }
Fetches and processes emails from Microsoft Graph
```

### 3. Natural Language Query
```
POST /api/email-analytics/query
Body: { "query": "your question here" }
Ask questions in natural language, Claude generates SQL
```

### 4. Get Statistics
```
GET /api/email-analytics/stats
Returns overall email analytics statistics
```

### 5. Unanswered Requests
```
GET /api/email-analytics/unanswered?hours=48
Shows requests waiting for response
```

### 6. Driver Requests Summary
```
GET /api/email-analytics/driver-requests
Summary of all driver requests
```

### 7. Response Metrics
```
GET /api/email-analytics/response-metrics?days=30
Response time metrics by responder and category
```

### 8. Category Volume
```
GET /api/email-analytics/category-volume?days=30
Email volume trends by category
```

## 🔍 Database Schema

### Main Table: `email_analytics`

Key columns:
- `message_id` - Unique email ID
- `from_name`, `from_email` - Sender info
- `subject`, `body_preview` - Email content
- `received_date` - When received
- `category` - Operations, Payroll, Fleet, HR, etc.
- `request_type` - PTO, Scheduling, Payroll, Uniform, etc.
- `is_request`, `is_response` - Email classification
- `status` - pending, responded, escalated, closed
- `responded_by` - Who responded
- `response_time_hours` - Turnaround time
- `priority`, `urgency` - AI-assessed importance
- `ai_summary` - Claude's summary
- `action_items` - Extracted action items

### Views (Pre-built Queries)

1. **`unanswered_requests`** - Pending requests with wait time
2. **`driver_requests_summary`** - Driver request statistics
3. **`response_metrics`** - Response time analytics
4. **`email_volume_by_category`** - Daily volume trends

## 🤖 How Claude 4.5 Works

### Email Analysis Process

1. **Fetch Email** from Microsoft Graph
2. **Analyze with Claude 4.5:**
   - Categorize (Operations/Payroll/Fleet/HR/etc.)
   - Identify request type (PTO/Uniform/Incident/etc.)
   - Determine if it's a request or response
   - Extract priority and urgency
   - Identify action items and entities
   - Generate summary
3. **Store in Database** with all metadata
4. **Link Responses** to original requests automatically

### Query Generation

1. User asks natural language question
2. Claude 4.5 generates PostgreSQL query
3. System executes query on `email_analytics`
4. Claude 4.5 formats results into readable response
5. User gets both formatted answer and raw data

## 📈 Smart Agent Integration

### Enable Email Queries in Smart Agent

When using the Smart Agent:
1. Enable "Email" or "Microsoft" database
2. Ask email-related questions
3. Claude 4.5 automatically handles the query
4. Get instant answers

### Combined Queries

You can combine email data with other sources:
- "Search email and Pinecone for compliance issues"
- "Check email for driver John's PTO requests and his HOS violations"
- "Find payroll emails and cross-reference with ADP data"

## 🔄 Automated Syncing

### Option 1: Manual Trigger
Use the API endpoint whenever needed

### Option 2: Scheduled Job (Recommended)
Add to Render cron jobs:
```bash
# Daily at 6 AM
0 6 * * * curl -X POST https://cazar-main.onrender.com/api/email-analytics/sync -d '{"hoursBack":48}'
```

### Option 3: Real-time Webhook
Set up Microsoft Graph webhooks for instant processing (advanced)

## 📊 Example Use Cases

### 1. Daily Operations Report
```
Query: "Show me all pending requests and average response time from yesterday"
Result: Comprehensive daily summary with metrics
```

### 2. Driver Request Tracking
```
Query: "List all driver requests this week grouped by type with response status"
Result: PTO: 8 (6 responded), Scheduling: 12 (10 responded), etc.
```

### 3. Performance Metrics
```
Query: "Who has the best response time for Fleet emails this month?"
Result: John: 2.3 hours avg, Sarah: 3.1 hours avg, etc.
```

### 4. Escalation Detection
```
Query: "Show urgent emails older than 24 hours without response"
Result: List of items needing immediate attention
```

## 🎯 Key Features

✅ **Natural Language Queries** - Ask questions in plain English  
✅ **Automatic Categorization** - Claude 4.5 categorizes all emails  
✅ **Response Tracking** - Links responses to requests automatically  
✅ **Turnaround Metrics** - Tracks response times precisely  
✅ **Smart Summarization** - AI summaries of emails and threads  
✅ **Action Item Extraction** - Identifies tasks from emails  
✅ **Incident Detection** - Flags safety/incident-related emails  
✅ **Forwarding Analytics** - Tracks who emails were forwarded to  
✅ **Built-in Reporting** - Pre-built views for common queries  

## 🔧 Troubleshooting

### "ANTHROPIC_API_KEY not found"
- Add the key to Render environment variables
- Restart the service

### "Email analytics table doesn't exist"
- Call `/api/email-analytics/initialize`
- Check database connection

### "No emails found"
- Run first sync: `/api/email-analytics/sync`
- Check Microsoft Graph API permissions
- Verify mailbox access

### "Query generation failed"
- Check Claude API key is valid
- Ensure question is email-related
- Try simpler query first

## 📝 Best Practices

1. **Sync Regularly** - Daily or twice daily for fresh data
2. **Monitor API Usage** - Claude has rate limits
3. **Review Categorization** - Occasionally check Claude's accuracy
4. **Use Views** - Leverage pre-built views for common queries
5. **Combine Sources** - Use with Pinecone/Postgres for comprehensive insights

## 🎉 Summary

You now have a production-ready email analytics system that:
- Automatically processes and categorizes all emails
- Answers complex questions in natural language
- Tracks response times and performance metrics
- Integrates seamlessly with your Smart Agent
- Provides actionable insights for operations

**Next Step:** Add your `ANTHROPIC_API_KEY` to Render and deploy!


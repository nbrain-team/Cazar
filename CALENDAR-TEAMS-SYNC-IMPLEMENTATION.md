# Calendar & Teams Sync Implementation

## ✅ Files Created

### Database Schema
- **`database/calendar_teams_schema.sql`**
  - `calendar_events` table with Claude analysis fields
  - `teams_messages` table with Claude analysis fields
  - Indexes for fast queries
  - Pre-built views (upcoming_meetings, urgent_teams_messages, etc.)

### Claude Analysis Services
- **`server/lib/claudeCalendarService.mjs`**
  - `analyzeCalendarEvent()` - Extract category, priority, topics, action items
  - `generateCalendarQuery()` - Convert natural language to SQL
  - `formatCalendarResults()` - Format results into readable responses

- **`server/lib/claudeTeamsService.mjs`**
  - `analyzeTeamsMessage()` - Extract category, sentiment, urgency, topics
  - `generateTeamsQuery()` - Convert natural language to SQL
  - `formatTeamsResults()` - Format results into readable responses

### Sync Services
- **`server/lib/calendarSyncService.mjs`**
  - `syncCalendarEvents()` - Fetch calendar from Microsoft Graph → PostgreSQL
  - Analyzes with Claude automatically
  - Handles all users, deduplication, updates

- **`server/lib/teamsSyncService.mjs`**
  - `syncTeamsMessages()` - Fetch Teams messages from Microsoft Graph → PostgreSQL
  - Analyzes with Claude automatically
  - Handles all teams/channels, deduplication, updates

## 📋 Next Steps (API Endpoints Needed)

### 1. Add Sync Endpoints in server/index.mjs

```javascript
// Initialize tables
app.post('/api/calendar-teams/initialize', async (req, res) => {
  // Run database/calendar_teams_schema.sql
});

// Sync calendar
app.post('/api/calendar/sync', async (req, res) => {
  const { daysBack = 30, daysForward = 90 } = req.body;
  const stats = await syncCalendarEvents(pool, { daysBack, daysForward });
  res.json(stats);
});

// Sync Teams
app.post('/api/teams/sync', async (req, res) => {
  const { daysBack = 30 } = req.body;
  const stats = await syncTeamsMessages(pool, { daysBack });
  res.json(stats);
});

// Sync both
app.post('/api/calendar-teams/sync-all', async (req, res) => {
  // Run both syncs
});
```

### 2. Integrate into Smart Agent

Add calendar/Teams detection and querying:

```javascript
// In Smart Agent endpoint
const isCalendarQuery = await isCalendarQuery(message);
const isTeamsQuery = await isTeamsQuery(message);

if (isCalendarQuery) {
  const { sql } = await generateCalendarQuery(message);
  const results = await pool.query(sql);
  const formatted = await formatCalendarResults(results.rows, message);
  // Add to response
}

if (isTeamsQuery) {
  const { sql } = await generateTeamsQuery(message);
  const results = await pool.query(sql);
  const formatted = await formatTeamsResults(results.rows, message);
  // Add to response
}
```

### 3. Detection Functions Needed

```javascript
// server/lib/claudeCalendarService.mjs
export async function isCalendarQuery(query) {
  // Use Claude to detect calendar-related queries
  // "What meetings does Rudy have?"
  // "Show me upcoming deadlines"
  // etc.
}

// server/lib/claudeTeamsService.mjs
export async function isTeamsQuery(query) {
  // Use Claude to detect Teams-related queries
  // "What did the team discuss?"
  // "Recent project updates"
  // etc.
}
```

## 🧪 Testing Flow

### Step 1: Initialize Database
```bash
POST /api/calendar-teams/initialize
```

### Step 2: First Sync
```bash
# Sync calendar (last 30 days + next 90 days)
POST /api/calendar/sync
{
  "daysBack": 30,
  "daysForward": 90
}

# Sync Teams (last 30 days)
POST /api/teams/sync
{
  "daysBack": 30
}
```

### Step 3: Test Queries
```
"What meetings does Rudy have this week?"
"Show me upcoming high-priority meetings"
"What did the team discuss about the project?"
"Recent urgent messages in Teams"
```

## 📊 Data Flow

```
Microsoft Graph API
  ↓
Fetch calendar/Teams data
  ↓
Claude analyzes each item
  ↓
Store in PostgreSQL with analysis
  ↓
Smart Agent queries PostgreSQL
  ↓
Claude formats results
  ↓
User gets answer
```

## ⏰ Recommended Sync Schedule

```bash
# Daily calendar sync (6 AM)
0 6 * * * curl -X POST https://cazar-main.onrender.com/api/calendar/sync

# Daily Teams sync (6 AM)
0 6 * * * curl -X POST https://cazar-main.onrender.com/api/teams/sync

# Weekly full sync (Sunday 2 AM)
0 2 * * 0 curl -X POST https://cazar-main.onrender.com/api/calendar-teams/sync-all -d '{"daysBack":60}'
```

## 🎯 Benefits

- ⚡ **Fast**: No real-time API calls during queries
- 🎯 **Smart**: Pre-analyzed by Claude (categories, priorities, topics)
- 🧹 **Unified**: All data in PostgreSQL (emails, calendar, Teams)
- 📈 **Scalable**: Can handle thousands of meetings/messages

## 📝 Example Queries After Sync

### Calendar Queries:
- "What meetings does Rudy have this week?"
- "Show me all high-priority meetings"
- "Upcoming one-on-ones"
- "What deadlines are coming up?"
- "Meetings with action items"

### Teams Queries:
- "What did the team discuss today?"
- "Show me urgent Teams messages"
- "Recent project updates"
- "What decisions were made this week?"
- "Action items from Teams"

### Combined Queries:
- "What are Rudy's priorities?" (emails + calendar + Teams)
- "Show me everything urgent" (all sources)
- "What action items do I have?" (from all communications)



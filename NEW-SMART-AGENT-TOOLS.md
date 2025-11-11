# New Smart Agent Tools to Implement

## Summary

After analyzing the 20 test queries, I've identified which tools can be implemented NOW with existing data. Below are the new tools that need to be added to `server/lib/anthropicAgentTools.mjs`.

---

## TOOLS TO ADD

### 1. check_missing_clockouts
**Purpose:** Find shifts with missing clock-out times  
**Query:** #2  
**Status:** ✅ Ready - data available

```javascript
{
  name: 'check_missing_clockouts',
  description: 'Find shifts with clock-in but missing clock-out in the last N days. Returns employees with incomplete timecards.',
  input_schema: {
    type: 'object',
    properties: {
      days_back: {
        type: 'number',
        description: 'How many days back to search (default: 14)'
      }
    }
  }
}
```

**Implementation:**
```javascript
async function checkMissingClockouts(args) {
  const { days_back = 14 } = args;
  
  const query = `
    SELECT 
      d.driver_name,
      t.clock_in_time,
      t.date,
      ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.clock_in_time))/3600, 1) as hours_since_clockin
    FROM timecards t
    JOIN drivers d ON t.employee_id = d.driver_id
    WHERE t.clock_out_time IS NULL
      AND t.date >= CURRENT_DATE - INTERVAL '${days_back} days'
    ORDER BY t.clock_in_time DESC
  `;
  
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    return {
      success: true,
      count: result.rows.length,
      shifts: result.rows,
      message: `Found ${result.rows.length} shifts with missing clock-outs in last ${days_back} days`
    };
  } finally {
    client.release();
  }
}
```

---

### 2. check_weekly_overtime
**Purpose:** Find employees exceeding 40 hours before Saturday  
**Query:** #3  
**Status:** ✅ Ready - data available

```javascript
{
  name: 'check_weekly_overtime',
  description: 'Find employees who exceeded 40 hours before Saturday in current week. Returns employees with overtime hours.',
  input_schema: {
    type: 'object',
    properties: {
      threshold_hours: {
        type: 'number',
        description: 'Hours threshold (default: 40)'
      }
    }
  }
}
```

**Implementation:**
```javascript
async function checkWeeklyOvertime(args) {
  const { threshold_hours = 40 } = args;
  
  const query = `
    WITH weekly_hours AS (
      SELECT 
        t.employee_id,
        d.driver_name,
        SUM(t.total_hours_worked) as total_hours,
        ARRAY_AGG(t.date ORDER BY t.date) as work_days,
        COUNT(*) as days_worked,
        MAX(t.date) as last_shift_date
      FROM timecards t
      JOIN drivers d ON t.employee_id = d.driver_id
      WHERE t.date >= DATE_TRUNC('week', CURRENT_DATE)
        AND EXTRACT(DOW FROM t.date) < 6
      GROUP BY t.employee_id, d.driver_name
      HAVING SUM(t.total_hours_worked) > ${threshold_hours}
    )
    SELECT 
      driver_name,
      ROUND(total_hours, 2) as total_hours,
      ROUND(total_hours - ${threshold_hours}, 2) as overtime_hours,
      work_days,
      days_worked,
      last_shift_date
    FROM weekly_hours
    ORDER BY total_hours DESC
  `;
  
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    const totalOT = result.rows.reduce((sum, row) => sum + parseFloat(row.overtime_hours), 0);
    
    return {
      success: true,
      count: result.rows.length,
      total_overtime_hours: totalOT.toFixed(2),
      average_overtime: result.rows.length > 0 ? (totalOT / result.rows.length).toFixed(2) : 0,
      employees: result.rows,
      message: `Found ${result.rows.length} employees exceeding ${threshold_hours} hours before Saturday`
    };
  } finally {
    client.release();
  }
}
```

---

### 3. analyze_driver_requests
**Purpose:** Track driver requests in emails and response times  
**Query:** #12  
**Status:** ⚠️ Partial - needs enhancement

```javascript
{
  name: 'analyze_driver_requests',
  description: 'Analyze driver requests from emails (PTO, scheduling, payroll, uniforms) and track response status and turnaround time.',
  input_schema: {
    type: 'object',
    properties: {
      request_type: {
        type: 'string',
        enum: ['PTO', 'scheduling', 'payroll', 'uniform', 'all'],
        description: 'Type of request to analyze (default: all)'
      },
      days_back: {
        type: 'number',
        description: 'How many days back (default: 30)'
      },
      show_unanswered_only: {
        type: 'boolean',
        description: 'Only show requests without responses (default: false)'
      }
    }
  }
}
```

**Implementation:**
```javascript
async function analyzeDriverRequests(args) {
  const { request_type = 'all', days_back = 30, show_unanswered_only = false } = args;
  
  let requestFilter = '';
  if (request_type !== 'all') {
    const typeMap = {
      'PTO': "subject ILIKE '%PTO%' OR subject ILIKE '%time off%'",
      'scheduling': "subject ILIKE '%schedule%' OR subject ILIKE '%shift%'",
      'payroll': "subject ILIKE '%pay%' OR subject ILIKE '%payroll%'",
      'uniform': "subject ILIKE '%uniform%'"
    };
    requestFilter = `AND (${typeMap[request_type]})`;
  }
  
  const query = `
    WITH driver_emails AS (
      SELECT 
        e.email_id,
        e.sender as from_email,
        e.subject,
        e.received_at,
        e.category,
        e.body_preview,
        e.thread_id,
        CASE 
          WHEN e.subject ILIKE '%PTO%' OR e.subject ILIKE '%time off%' THEN 'PTO Request'
          WHEN e.subject ILIKE '%schedule%' OR e.subject ILIKE '%shift%' THEN 'Schedule Request'
          WHEN e.subject ILIKE '%pay%' OR e.subject ILIKE '%payroll%' THEN 'Payroll Question'
          WHEN e.subject ILIKE '%uniform%' THEN 'Uniform Request'
          ELSE 'General Request'
        END as request_type
      FROM emails e
      WHERE e.category IN ('Operations', 'Payroll', 'HR', 'Uniform', 'PTO', 'Scheduling')
        AND e.sender NOT ILIKE '%@cazarnyc.com'
        AND e.received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
        ${requestFilter}
    ),
    responses AS (
      SELECT DISTINCT ON (de.email_id)
        de.email_id,
        de.from_email,
        de.subject,
        de.request_type,
        de.received_at,
        de.category,
        de.body_preview,
        r.received_at as response_time,
        r.sender as responded_by,
        EXTRACT(EPOCH FROM (r.received_at - de.received_at))/3600 as turnaround_hours
      FROM driver_emails de
      LEFT JOIN emails r ON (
        r.thread_id = de.thread_id
        AND r.received_at > de.received_at
        AND r.sender ILIKE '%@cazarnyc.com'
      )
      ORDER BY de.email_id, r.received_at ASC
    )
    SELECT 
      from_email,
      subject,
      request_type,
      received_at,
      category,
      response_time,
      responded_by,
      CASE 
        WHEN response_time IS NULL THEN 'NO RESPONSE'
        ELSE ROUND(turnaround_hours, 1) || ' hours'
      END as turnaround_time,
      CASE 
        WHEN response_time IS NULL THEN '🔴 Unanswered'
        WHEN turnaround_hours < 2 THEN '🟢 Fast (<2h)'
        WHEN turnaround_hours < 24 THEN '🟡 Moderate (<24h)'
        ELSE '🔴 Slow (>24h)'
      END as status
    FROM responses
    ${show_unanswered_only ? 'WHERE response_time IS NULL' : ''}
    ORDER BY received_at DESC
  `;
  
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    
    const stats = {
      total: result.rows.length,
      responded: result.rows.filter(r => r.response_time).length,
      unanswered: result.rows.filter(r => !r.response_time).length,
      fast: result.rows.filter(r => r.status.includes('Fast')).length,
      moderate: result.rows.filter(r => r.status.includes('Moderate')).length,
      slow: result.rows.filter(r => r.status.includes('Slow')).length
    };
    
    const avgTurnaround = result.rows
      .filter(r => r.response_time)
      .map(r => parseFloat(r.turnaround_hours))
      .reduce((a, b, i, arr) => a + b / arr.length, 0);
    
    return {
      success: true,
      statistics: {
        ...stats,
        avg_turnaround_hours: avgTurnaround ? avgTurnaround.toFixed(1) : 'N/A',
        response_rate: ((stats.responded / stats.total) * 100).toFixed(1) + '%'
      },
      requests: result.rows
    };
  } finally {
    client.release();
  }
}
```

---

### 4. get_email_response_stats
**Purpose:** Aggregate email response statistics by responder  
**Query:** #15, #20  
**Status:** ✅ Ready

```javascript
{
  name: 'get_email_response_stats',
  description: 'Get email response statistics by responder: count of responses per day, average response times by category.',
  input_schema: {
    type: 'object',
    properties: {
      group_by: {
        type: 'string',
        enum: ['responder', 'responder_and_day', 'responder_and_category'],
        description: 'How to group response statistics'
      },
      days_back: {
        type: 'number',
        description: 'Days to analyze (default: 30)'
      }
    },
    required: ['group_by']
  }
}
```

**Implementation:**
```javascript
async function getEmailResponseStats(args) {
  const { group_by, days_back = 30 } = args;
  
  let query = '';
  
  if (group_by === 'responder') {
    query = `
      SELECT 
        sender as responder,
        COUNT(*) as response_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - (
          SELECT received_at FROM emails WHERE thread_id = e.thread_id AND received_at < e.sent_at ORDER BY received_at DESC LIMIT 1
        )))/3600)::numeric, 1) as avg_response_hours
      FROM emails e
      WHERE sender ILIKE '%@cazarnyc.com'
        AND sent_at >= CURRENT_DATE - INTERVAL '${days_back} days'
      GROUP BY sender
      ORDER BY response_count DESC
    `;
  } else if (group_by === 'responder_and_day') {
    query = `
      SELECT 
        sender as responder,
        DATE(sent_at) as date,
        COUNT(*) as response_count
      FROM emails
      WHERE sender ILIKE '%@cazarnyc.com'
        AND sent_at >= CURRENT_DATE - INTERVAL '${days_back} days'
      GROUP BY sender, DATE(sent_at)
      ORDER BY date DESC, response_count DESC
    `;
  } else if (group_by === 'responder_and_category') {
    query = `
      SELECT 
        sender as responder,
        category,
        COUNT(*) as response_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - (
          SELECT received_at FROM emails WHERE thread_id = e.thread_id AND received_at < e.sent_at ORDER BY received_at DESC LIMIT 1
        )))/3600)::numeric, 1) as avg_response_hours
      FROM emails e
      WHERE sender ILIKE '%@cazarnyc.com'
        AND sent_at >= CURRENT_DATE - INTERVAL '${days_back} days'
      GROUP BY sender, category
      ORDER BY sender, response_count DESC
    `;
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    return {
      success: true,
      group_by,
      days_analyzed: days_back,
      count: result.rows.length,
      statistics: result.rows
    };
  } finally {
    client.release();
  }
}
```

---

### 5. find_unanswered_emails
**Purpose:** Find emails older than X hours without response  
**Query:** #19  
**Status:** ✅ Ready

```javascript
{
  name: 'find_unanswered_emails',
  description: 'Find emails older than specified hours without any response. Helps identify emails needing attention.',
  input_schema: {
    type: 'object',
    properties: {
      hours_threshold: {
        type: 'number',
        description: 'Minimum hours old without response (default: 48)'
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by categories (optional)'
      }
    }
  }
}
```

**Implementation:**
```javascript
async function findUnansweredEmails(args) {
  const { hours_threshold = 48, categories } = args;
  
  let categoryFilter = '';
  if (categories && categories.length > 0) {
    categoryFilter = `AND category IN (${categories.map(c => `'${c}'`).join(',')})`;
  }
  
  const query = `
    WITH email_threads AS (
      SELECT 
        e.email_id,
        e.sender,
        e.subject,
        e.received_at,
        e.category,
        e.priority,
        e.body_preview,
        e.thread_id,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - e.received_at))/3600 as hours_old,
        (
          SELECT COUNT(*)
          FROM emails r
          WHERE r.thread_id = e.thread_id
            AND r.received_at > e.received_at
            AND r.sender ILIKE '%@cazarnyc.com'
        ) as response_count
      FROM emails e
      WHERE e.sender NOT ILIKE '%@cazarnyc.com'
        AND e.received_at < CURRENT_TIMESTAMP - INTERVAL '${hours_threshold} hours'
        ${categoryFilter}
    )
    SELECT 
      sender,
      subject,
      category,
      priority,
      received_at,
      ROUND(hours_old::numeric, 1) as hours_old,
      body_preview
    FROM email_threads
    WHERE response_count = 0
    ORDER BY hours_old DESC, priority DESC NULLS LAST
  `;
  
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    return {
      success: true,
      threshold_hours: hours_threshold,
      count: result.rows.length,
      unanswered_emails: result.rows,
      message: `Found ${result.rows.length} emails older than ${hours_threshold} hours without response`
    };
  } finally {
    client.release();
  }
}
```

---

### 6. find_incident_attachments
**Purpose:** Find emails with attachments related to incidents  
**Query:** #18  
**Status:** ✅ Ready

```javascript
{
  name: 'find_incident_attachments',
  description: 'Find emails with attachments related to incidents. Shows who handled them.',
  input_schema: {
    type: 'object',
    properties: {
      days_back: {
        type: 'number',
        description: 'Days to search (default: 30)'
      }
    }
  }
}
```

**Implementation:**
```javascript
async function findIncidentAttachments(args) {
  const { days_back = 30 } = args;
  
  const query = `
    WITH incident_emails AS (
      SELECT 
        e.email_id,
        e.sender,
        e.subject,
        e.received_at,
        e.category,
        e.has_attachments,
        e.attachment_count,
        e.thread_id,
        e.body_preview
      FROM emails e
      WHERE (
          e.category = 'Incident'
          OR e.subject ILIKE '%incident%'
          OR e.subject ILIKE '%accident%'
          OR e.subject ILIKE '%violation%'
        )
        AND e.has_attachments = true
        AND e.received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
    ),
    handlers AS (
      SELECT DISTINCT ON (ie.email_id)
        ie.*,
        r.sender as handled_by,
        r.received_at as response_time
      FROM incident_emails ie
      LEFT JOIN emails r ON (
        r.thread_id = ie.thread_id
        AND r.received_at > ie.received_at
        AND r.sender ILIKE '%@cazarnyc.com'
      )
      ORDER BY ie.email_id, r.received_at ASC
    )
    SELECT 
      sender,
      subject,
      received_at,
      attachment_count,
      handled_by,
      CASE 
        WHEN handled_by IS NULL THEN 'Not handled'
        ELSE 'Handled'
      END as status,
      body_preview
    FROM handlers
    ORDER BY received_at DESC
  `;
  
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    const handled = result.rows.filter(r => r.handled_by).length;
    const unhandled = result.rows.filter(r => !r.handled_by).length;
    
    return {
      success: true,
      count: result.rows.length,
      handled_count: handled,
      unhandled_count: unhandled,
      incidents: result.rows,
      message: `Found ${result.rows.length} incident emails with attachments (${handled} handled, ${unhandled} unhandled)`
    };
  } finally {
    client.release();
  }
}
```

---

## INTEGRATION STEPS

1. **Add tool definitions** to the `tools` array in `anthropicAgentTools.mjs` (before line 346)

2. **Add tool execution cases** to the `executeTool` switch statement:
```javascript
case 'check_missing_clockouts':
  return await checkMissingClockouts(args);

case 'check_weekly_overtime':
  return await checkWeeklyOvertime(args);

case 'analyze_driver_requests':
  return await analyzeDriverRequests(args);

case 'get_email_response_stats':
  return await getEmailResponseStats(args);

case 'find_unanswered_emails':
  return await findUnansweredEmails(args);

case 'find_incident_attachments':
  return await findIncidentAttachments(args);
```

3. **Add implementation functions** at the end of the file (after existing tool functions)

4. **Test each tool** with sample queries

---

## EXPECTED RESULTS AFTER IMPLEMENTATION

### Query 2: "Show any shifts with missing clock-outs in the last 14 days"
✅ Will work perfectly with `check_missing_clockouts` tool

### Query 3: "List drivers who exceeded 40 hours before Saturday"
✅ Will work perfectly with `check_weekly_overtime` tool

### Query 12: "Identify all requests by drivers and show response status"
✅ Will work with `analyze_driver_requests` tool

### Query 15: "Count responses sent by day per responder"
✅ Will work with `get_email_response_stats` tool (group_by: 'responder_and_day')

### Query 18: "List emails with attachments related to incidents"
✅ Will work with `find_incident_attachments` tool

### Query 19: "Identify emails older than 48 hours without response"
✅ Will work with `find_unanswered_emails` tool

### Query 20: "Show average first-response time by category"
✅ Will work with `get_email_response_stats` tool (group_by: 'responder_and_category')

---

## WHAT STILL NEEDS ADP API ACCESS

❌ Query 1: Scheduled shift times (need to enhance ADP loader)  
❌ Query 4: Meal breaks (need to capture from ADP)  
❌ Queries 5-11: All payroll/HR data (need Payroll/Benefits/Time Off APIs)



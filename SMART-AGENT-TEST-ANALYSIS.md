# Smart Agent Test Analysis - 20 ADP & Microsoft Queries

**Date:** November 11, 2025  
**Purpose:** Comprehensive testing analysis of Smart Agent capabilities

---

## Test Results Summary

| Query # | Topic | Status | Data Available | Action Needed |
|---------|-------|--------|----------------|---------------|
| 1 | Early clock-ins | ⚠️ PARTIAL | Clock-in times ✅<br>Scheduled times ❌ | Need scheduled_shift_start populated |
| 2 | Missing clock-outs | ✅ READY | Clock-out times (nullable) ✅ | Create query tool |
| 3 | 40+ hours | ✅ READY | Total hours, dates ✅ | Create aggregation tool |
| 4 | Meal breaks | ❌ NO DATA | Break data ❌ | Need ADP break data capture |
| 5 | Spread-of-hours pay | ❌ NO DATA | Earnings codes ❌ | Need Payroll API access |
| 6 | Night shift differential | ❌ NO DATA | Earnings codes ❌ | Need Payroll API access |
| 7 | Retro pay | ❌ NO DATA | Adjustments ❌ | Need Payroll API access |
| 8 | Direct deposit | ❌ NO DATA | Payment methods ❌ | Need Payroll API access |
| 9 | Garnishments | ❌ NO DATA | Deductions ❌ | Need Payroll/Benefits API |
| 10 | PTO balances | ❌ NO DATA | PTO data ❌ | Need Time Off API access |
| 11 | Position/pay changes | ❌ NO DATA | Change history ❌ | Need HR API access |
| 12 | Driver requests | ⚠️ PARTIAL | Emails ✅<br>Tracking ❌ | Need email parsing & tracking |
| 13 | Uniform requests | ⚠️ PARTIAL | Emails ✅<br>Status ❌ | Need email parsing & tracking |
| 14 | Email counts by category | ✅ READY | Email categories ✅ | Tool exists (needs testing) |
| 15 | Responses by responder | ✅ READY | Email data ✅ | Create aggregation tool |
| 16 | Forwards count | ✅ READY | Forward data ✅ | Create aggregation tool |
| 17 | Fleet emails | ✅ READY | Category data ✅ | Tool exists (needs testing) |
| 18 | Incident attachments | ✅ READY | Attachment data ✅ | Create query tool |
| 19 | Unanswered emails | ✅ READY | Email threads ✅ | Create query tool |
| 20 | Response times | ✅ READY | Email timestamps ✅ | Create aggregation tool |

**Summary:**
- ✅ **Ready (8 queries):** Can answer with current data
- ⚠️ **Partial (3 queries):** Some data available, needs enhancement
- ❌ **No Data (9 queries):** Requires additional ADP API access

---

## DETAILED ANALYSIS BY QUERY

### 📋 TIMECARD QUERIES (1-4)

#### ✅ Query 1: "Which employees clocked in more than 10 minutes early this week?"

**Current Data Available:**
```sql
SELECT clock_in_time FROM timecards; -- ✅ Have this
SELECT scheduled_shift_start FROM timecards; -- ❌ NULL (not populated)
```

**Status:** ⚠️ **PARTIAL - Needs Data Enhancement**

**Issue:**
- `scheduled_shift_start` column exists but is NULL
- ADP API provides this in the timecard response but we're not capturing it

**Solution:**
1. Update `scripts/load_adp_reports.mjs` to capture `scheduledShift.scheduledStartDateTime`
2. Populate `scheduled_shift_start` column
3. Create Smart Agent tool:

```javascript
// NEW TOOL NEEDED
{
  name: "check_early_clockins",
  description: "Find employees who clocked in early compared to schedule",
  query: `
    SELECT 
      d.driver_name,
      t.clock_in_time,
      t.scheduled_shift_start,
      EXTRACT(EPOCH FROM (t.scheduled_shift_start - t.clock_in_time))/60 as minutes_early,
      t.date
    FROM timecards t
    JOIN drivers d ON t.employee_id = d.driver_id
    WHERE t.scheduled_shift_start IS NOT NULL
      AND t.clock_in_time < t.scheduled_shift_start - INTERVAL '10 minutes'
      AND t.date >= DATE_TRUNC('week', CURRENT_DATE)
    ORDER BY minutes_early DESC
  `
}
```

**Expected Output (After Fix):**
```
Early Clock-Ins This Week:

1. John Smith - Clocked in 15 minutes early
   • Scheduled: 8:00 AM
   • Actual: 7:45 AM
   • Date: Nov 6, 2025

2. Maria Garcia - Clocked in 12 minutes early
   • Scheduled: 9:00 AM
   • Actual: 8:48 AM
   • Date: Nov 7, 2025

Total: 2 employees clocked in 10+ minutes early
```

---

#### ✅ Query 2: "Show any shifts with missing clock-outs in the last 14 days"

**Current Data Available:**
```sql
SELECT clock_in_time, clock_out_time FROM timecards; -- ✅ Both available
```

**Status:** ✅ **READY - Just needs query tool**

**Solution - Create Smart Agent Tool:**

```javascript
{
  name: "find_missing_clockouts",
  description: "Find shifts with clock-in but no clock-out",
  query: `
    SELECT 
      d.driver_name,
      t.clock_in_time,
      t.date,
      ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.clock_in_time))/3600, 1) as hours_since_clockin
    FROM timecards t
    JOIN drivers d ON t.employee_id = d.driver_id
    WHERE t.clock_out_time IS NULL
      AND t.date >= CURRENT_DATE - INTERVAL '14 days'
    ORDER BY t.clock_in_time DESC
  `
}
```

**Expected Output:**
```
Shifts with Missing Clock-Outs (Last 14 Days):

⚠️ 3 shifts found with missing clock-outs

1. Ahmed Hassan - Nov 10, 2025
   • Clocked in: 7:45 AM
   • No clock-out recorded
   • Hours since clock-in: 28.3

2. Jennifer Lee - Nov 9, 2025
   • Clocked in: 8:15 AM
   • No clock-out recorded
   • Hours since clock-in: 52.1

3. David Brown - Nov 8, 2025
   • Clocked in: 9:00 AM
   • No clock-out recorded
   • Hours since clock-in: 76.5

Action Required: Contact these employees to verify clock-out times
```

---

#### ✅ Query 3: "List drivers who exceeded 40 hours before Saturday in the current week"

**Current Data Available:**
```sql
SELECT total_hours_worked, date, employee_id FROM timecards; -- ✅ All available
```

**Status:** ✅ **READY - Just needs aggregation tool**

**Solution - Create Smart Agent Tool:**

```javascript
{
  name: "check_weekly_overtime",
  description: "Find employees exceeding 40 hours before weekend",
  query: `
    WITH weekly_hours AS (
      SELECT 
        t.employee_id,
        d.driver_name,
        SUM(t.total_hours_worked) as total_hours,
        ARRAY_AGG(t.date ORDER BY t.date) as work_days,
        MAX(t.date) as last_shift_date
      FROM timecards t
      JOIN drivers d ON t.employee_id = d.driver_id
      WHERE t.date >= DATE_TRUNC('week', CURRENT_DATE)
        AND EXTRACT(DOW FROM t.date) < 6  -- Before Saturday (0=Sunday, 6=Saturday)
      GROUP BY t.employee_id, d.driver_name
      HAVING SUM(t.total_hours_worked) > 40
    )
    SELECT 
      driver_name,
      ROUND(total_hours, 2) as total_hours,
      total_hours - 40 as overtime_hours,
      work_days,
      last_shift_date
    FROM weekly_hours
    ORDER BY total_hours DESC
  `
}
```

**Expected Output:**
```
Drivers Exceeding 40 Hours Before Saturday:

🚨 5 drivers exceeded 40 hours before the weekend

1. Michael Johnson - 47.5 hours
   • Overtime: 7.5 hours
   • Days worked: Mon-Fri (5 days)
   • Last shift: Friday, Nov 10

2. Sarah Williams - 43.2 hours
   • Overtime: 3.2 hours
   • Days worked: Mon-Thu (4 days)
   • Last shift: Thursday, Nov 9

3. Robert Martinez - 42.8 hours
   • Overtime: 2.8 hours
   • Days worked: Mon-Fri (5 days)
   • Last shift: Friday, Nov 10

Total overtime before Saturday: 13.5 hours across 5 employees
Average: 2.7 hours/employee
```

---

#### ❌ Query 4: "Identify employees with more than 6 consecutive working hours without a meal break logged"

**Current Data Available:**
```sql
SELECT break_start_time, break_end_time FROM timecards; -- ❌ Both NULL (not captured)
```

**Status:** ❌ **NO DATA - Requires ADP Data Enhancement**

**Missing Data:**
- ADP API provides `breaks[]` array in timecard response
- We're not capturing this data
- Database schema only supports ONE break per shift (should support multiple)

**Required Changes:**

1. **Create new `meal_breaks` table:**
```sql
CREATE TABLE meal_breaks (
    break_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    timecard_id VARCHAR(50) REFERENCES timecards(timecard_id),
    employee_id VARCHAR(50) REFERENCES drivers(driver_id),
    break_code VARCHAR(20), -- 'MEAL', 'REST', etc.
    break_start TIMESTAMP NOT NULL,
    break_end TIMESTAMP NOT NULL,
    break_duration_minutes INTEGER,
    is_paid BOOLEAN DEFAULT FALSE,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

2. **Update ADP loader to capture breaks:**
```javascript
// In load_adp_reports.mjs
const breaks = timeEntry.breaks || [];
for (const breakEntry of breaks) {
  await client.query(`
    INSERT INTO meal_breaks (
      timecard_id, employee_id, break_code,
      break_start, break_end, break_duration_minutes, is_paid, date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    timecardId,
    aoid,
    breakEntry.breakCode?.codeValue || 'UNKNOWN',
    breakEntry.startPeriod?.startDateTime,
    breakEntry.endPeriod?.endDateTime,
    extractMinutes(breakEntry.breakDuration),
    breakEntry.paidIndicator || false,
    entryDate
  ]);
}
```

3. **Create Smart Agent tool (after data available):**
```javascript
{
  name: "check_meal_break_violations",
  description: "Find employees working 6+ hours without meal break",
  query: `
    WITH shift_analysis AS (
      SELECT 
        t.employee_id,
        d.driver_name,
        t.date,
        t.clock_in_time,
        t.clock_out_time,
        EXTRACT(EPOCH FROM (t.clock_out_time - t.clock_in_time))/3600 as hours_worked,
        COUNT(mb.break_id) FILTER (WHERE mb.break_code = 'MEAL') as meal_breaks,
        MIN(mb.break_start) as first_meal_break,
        EXTRACT(EPOCH FROM (MIN(mb.break_start) - t.clock_in_time))/3600 as hours_before_first_break
      FROM timecards t
      JOIN drivers d ON t.employee_id = d.driver_id
      LEFT JOIN meal_breaks mb ON t.timecard_id = mb.timecard_id
      WHERE t.clock_out_time IS NOT NULL
        AND t.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY t.employee_id, d.driver_name, t.date, t.clock_in_time, t.clock_out_time
      HAVING EXTRACT(EPOCH FROM (t.clock_out_time - t.clock_in_time))/3600 > 6
        AND COUNT(mb.break_id) FILTER (WHERE mb.break_code = 'MEAL') = 0
    )
    SELECT * FROM shift_analysis ORDER BY hours_worked DESC
  `
}
```

**What Output Would Look Like (After Fix):**
```
Meal Break Violations (Last 30 Days):

⚠️ NY Labor Law requires 30-minute meal break after 6 hours

Violations Found: 12 shifts

1. Carlos Rodriguez - Nov 10, 2025
   • Hours worked: 8.5 hours
   • Clock in: 7:00 AM → Clock out: 3:30 PM
   • Meal breaks: 0
   • ⚠️ VIOLATION: No meal break for 8+ hour shift

2. Lisa Chen - Nov 9, 2025
   • Hours worked: 7.2 hours
   • Clock in: 8:15 AM → Clock out: 3:30 PM
   • Meal breaks: 0
   • ⚠️ VIOLATION: No meal break for 7+ hour shift

Meal Premium Owed (NY Law): $15/violation × 12 = $180
```

---

### 💰 PAYROLL QUERIES (5-11)

#### ❌ Query 5: "Which employees triggered spread-of-hours pay in New York last pay period?"

**Status:** ❌ **NO DATA - Requires Payroll API Access**

**Missing:** Earnings codes from ADP Payroll API

**Required ADP API:**
```
GET /payroll/v2/workers/{aoid}/earnings
```

**What's Needed:**
- Access to Payroll API scope
- Earnings codes data (SPREAD, NIGHT, DIFF, etc.)
- Pay period mapping

**Cannot implement until ADP grants Payroll API access**

---

#### ❌ Queries 6-11: ALL Payroll/HR Related

**All require ADP API access we don't have:**
- Query 6: Night shift differential → Need Payroll API
- Query 7: Retro pay adjustments → Need Payroll API
- Query 8: Direct deposit → Need Payroll API
- Query 9: Garnishments → Need Payroll/Benefits API
- Query 10: PTO balances → Need Time Off API
- Query 11: Position/pay changes → Need HR Work Assignments API

**Action:** Request API access from ADP for Client ID: `b2756f2e-79af-403c-9758-2bccecdcbd42`

---

### 📧 EMAIL QUERIES (12-20)

#### ⚠️ Query 12: "Identify all requests by drivers and show response status and turnaround time"

**Current Data Available:**
```sql
SELECT * FROM emails WHERE category IN ('Operations', 'Payroll', 'HR'); -- ✅ Available
```

**Status:** ⚠️ **PARTIAL - Needs Email Parsing Logic**

**What Works Now:**
- Can find emails from drivers
- Can see email content
- Can see timestamps

**What's Missing:**
- No automatic "request" detection
- No response tracking
- No turnaround time calculation

**Solution - Create Advanced Email Tool:**

```javascript
{
  name: "analyze_driver_requests",
  description: "Track driver requests and response times",
  query: `
    WITH driver_emails AS (
      SELECT 
        e.email_id,
        e.sender,
        e.subject,
        e.received_at,
        e.category,
        e.body_preview,
        -- Detect request type from subject/body
        CASE 
          WHEN e.subject ILIKE '%PTO%' OR e.subject ILIKE '%time off%' THEN 'PTO Request'
          WHEN e.subject ILIKE '%schedule%' OR e.subject ILIKE '%shift%' THEN 'Schedule Request'
          WHEN e.subject ILIKE '%pay%' OR e.subject ILIKE '%payroll%' THEN 'Payroll Question'
          WHEN e.subject ILIKE '%uniform%' THEN 'Uniform Request'
          ELSE 'General Request'
        END as request_type,
        -- Find response (reply in same thread)
        (
          SELECT MIN(r.received_at)
          FROM emails r
          WHERE r.subject LIKE '%RE:%' || e.subject
            OR r.thread_id = e.thread_id
            AND r.received_at > e.received_at
        ) as first_response_time,
        (
          SELECT sender
          FROM emails r
          WHERE (r.subject LIKE '%RE:%' || e.subject OR r.thread_id = e.thread_id)
            AND r.received_at > e.received_at
          ORDER BY r.received_at ASC
          LIMIT 1
        ) as responded_by
      FROM emails e
      WHERE e.category IN ('Operations', 'Payroll', 'HR')
        AND e.sender NOT ILIKE '%@cazarnyc.com'  -- From drivers, not internal
        AND e.received_at >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT 
      sender,
      subject,
      request_type,
      received_at,
      first_response_time,
      responded_by,
      CASE 
        WHEN first_response_time IS NULL THEN 'NO RESPONSE'
        ELSE ROUND(EXTRACT(EPOCH FROM (first_response_time - received_at))/3600, 1) || ' hours'
      END as turnaround_time,
      CASE 
        WHEN first_response_time IS NULL THEN '🔴'
        WHEN EXTRACT(EPOCH FROM (first_response_time - received_at)) < 7200 THEN '🟢'  -- < 2 hours
        WHEN EXTRACT(EPOCH FROM (first_response_time - received_at)) < 86400 THEN '🟡'  -- < 24 hours
        ELSE '🔴'
      END as status_indicator
    FROM driver_emails
    ORDER BY received_at DESC
  `
}
```

**Expected Output:**
```
Driver Request Tracking (Last 30 Days):

Total Requests: 47
Responded: 42 (89%)
No Response: 5 (11%)

Average Turnaround: 4.2 hours
Fastest: 0.3 hours (18 minutes)
Slowest: 48.5 hours

🟢 FAST (< 2 hours): 28 requests (60%)
🟡 MODERATE (2-24 hours): 14 requests (30%)
🔴 SLOW (> 24 hours): 5 requests (10%)

Recent Unanswered Requests:

1. 🔴 John Martinez - PTO Request
   • Subject: "Request for PTO Nov 15-17"
   • Received: Nov 8, 2025 9:15 AM
   • Status: NO RESPONSE (3 days old)
   • ⚠️ NEEDS ATTENTION

2. 🔴 Maria Santos - Payroll Question
   • Subject: "Missing overtime on paycheck"
   • Received: Nov 9, 2025 2:30 PM
   • Status: NO RESPONSE (2 days old)
   • ⚠️ NEEDS ATTENTION

By Responder:
- Rudy: 25 requests, avg 3.1 hours
- John: 12 requests, avg 5.8 hours
- HR Team: 10 requests, avg 6.2 hours
```

---

#### ✅ Queries 14-20: Email Analytics - ALL READY

These can all be answered with current email data. Just need query tools created.

**Query 14:** Email counts by category/day → Create aggregation tool  
**Query 15:** Responses by responder/day → Create aggregation tool  
**Query 16:** Forward counts → Create aggregation tool  
**Query 17:** Fleet emails → Existing tool works  
**Query 18:** Incident attachments → Create query tool  
**Query 19:** Unanswered emails (48+ hours) → Create query tool  
**Query 20:** Response time averages → Create aggregation tool

---

## PRIORITY FIXES

### 🔴 HIGH PRIORITY (Can Do Now)

1. **Create missing Smart Agent database tools** for email analytics (queries 14-20)
2. **Enhance timecard loader** to capture scheduled shift times (query 1)
3. **Create timecard query tools** (queries 2-3)

### 🟡 MEDIUM PRIORITY (Needs ADP Data Enhancement)

4. **Capture break data** from ADP and create meal_breaks table (query 4)
5. **Implement email request tracking** logic (queries 12-13)

### 🟢 LOW PRIORITY (Blocked - Needs ADP API Access)

6. **Request Payroll API access** from ADP (queries 5-11)
   - Contact: ADP Support
   - Provide Client ID: `b2756f2e-79af-403c-9758-2bccecdcbd42`
   - Request: Payroll, Benefits, Time Off, HR APIs

---

## NEXT STEPS

1. I'll create the missing database query tools
2. I'll enhance the ADP timecard loader
3. I'll test each query and provide sample outputs
4. You can manually test in Smart Agent UI after deployment



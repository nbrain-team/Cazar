# ADP Reports Loader - Usage Guide

**Status:** ✅ Ready to Use  
**Last Updated:** October 21, 2025

---

## 🎯 Overview

This script connects to your ADP account using OAuth 2.0 authentication and loads employee and timecard data directly into your PostgreSQL database.

### Available Data
- ✅ **50 Employees** (6 Active, 43 Terminated)
- ✅ **Timecards** for active workers
- ⚠️ **Payroll Data** (requires additional ADP permissions)

---

## 📋 Available Reports

### 1. EMPLOYEES/WORKERS REPORT ✅
**Endpoint:** `/hr/v2/workers`  
**Data Includes:**
- Employee names, IDs, and status
- Hire dates and employment status
- Contact information (emails)
- Active vs terminated workers

**Database Table:** `drivers`

### 2. TIMECARDS REPORT ✅
**Endpoint:** `/time/v2/workers/{aoid}/team-time-cards`  
**Data Includes:**
- Clock in/out times
- Time periods and pay periods
- Timecard status (submitted, approved, etc.)
- Daily time entries

**Database Table:** `timecards`

### 3. PAYROLL REPORTS ⚠️
**Status:** Requires additional ADP API permissions  
**Action Needed:** Contact ADP support with Client ID: `b2756f2e-79af-403c-9758-2bccecdcbd42`

---

## 🚀 How to Use

### Option 1: Using the Wrapper Script (Recommended)

```bash
# List available reports
./scripts/run_adp_loader.sh list

# Test ADP connection and show summary
./scripts/run_adp_loader.sh test

# Load workers/employees into database
./scripts/run_adp_loader.sh load workers

# Load timecards into database
./scripts/run_adp_loader.sh load timecards

# Load ALL available reports
./scripts/run_adp_loader.sh load all
```

### Option 2: Direct Node Execution

If environment variables are already set in your Render environment:

```bash
node scripts/load_adp_reports.mjs list
node scripts/load_adp_reports.mjs test
node scripts/load_adp_reports.mjs load workers
node scripts/load_adp_reports.mjs load timecards
node scripts/load_adp_reports.mjs load all
```

---

## 💻 Commands Explained

### `list` - Show Available Reports
```bash
./scripts/run_adp_loader.sh list
```
**Output:** Displays all ADP reports you can access with your current permissions.

### `test` - Test Connection
```bash
./scripts/run_adp_loader.sh test
```
**Output:** 
- Tests ADP API authentication
- Shows workforce summary (total, active, terminated)
- Lists recent hires

### `load workers` - Load Employee Data
```bash
./scripts/run_adp_loader.sh load workers
```
**Actions:**
- Fetches all 50 employees from ADP
- Inserts/updates records in `drivers` table
- Shows summary of inserted/updated/skipped records

**Database Impact:**
- Inserts new employees
- Updates existing employee records
- Uses `driver_id` (ADP associate OID) as primary key

### `load timecards` - Load Timecard Data
```bash
./scripts/run_adp_loader.sh load timecards
```
**Actions:**
- Fetches timecards for active workers (up to 20 to avoid timeout)
- Inserts/updates records in `timecards` table
- Shows summary of inserted/updated/skipped records

**Note:** Some workers may not have timecard data if supervisor is not configured in ADP.

### `load all` - Load Everything
```bash
./scripts/run_adp_loader.sh load all
```
**Actions:**
- Runs both `workers` and `timecards` loads sequentially
- Most comprehensive data import

---

## 📊 Database Tables Updated

### `drivers` Table
```sql
Columns:
- driver_id (Primary Key - ADP Associate OID)
- driver_name
- driver_status (active/inactive)
- employment_status (active/terminated)
- hire_date
- created_at
- updated_at
```

### `timecards` Table
```sql
Columns:
- timecard_id (Primary Key - generated from ADP data)
- employee_id (References drivers.driver_id)
- clock_in_time
- clock_out_time
- total_hours_worked
- date
- created_at
- updated_at
```

---

## 🔐 Credentials Configuration

The script uses the following ADP credentials from your environment:

```
ADP_CLIENT_ID=b2756f2e-79af-403c-9758-2bccecdcbd42
ADP_CLIENT_SECRET=9ebde91d-f4ea-4f7e-8d00-7cfdcd6ece66
ADP_CERTIFICATE=[Your SSL Certificate]
ADP_PRIVATE_KEY=[Your Private Key]
DATABASE_URL=postgresql://cazar_admin:***@dpg-d25rt60gjchc73acglmg-a/cazar_ops_hub
```

**Certificate Valid Until:** September 17, 2027

---

## 🎯 Example Workflows

### Daily Employee Sync
```bash
# Run every morning to sync latest employee data
./scripts/run_adp_loader.sh load workers
```

### Weekly Timecard Import
```bash
# Run weekly to import timecards
./scripts/run_adp_loader.sh load timecards
```

### Complete Data Refresh
```bash
# Full refresh of all ADP data
./scripts/run_adp_loader.sh load all
```

---

## 🔍 Testing on Render

To run this script in your Render shell (for testing before deployment):

```bash
# Connect to Render shell
# Your environment variables are already configured

# Test connection
node scripts/load_adp_reports.mjs test

# Load workers
node scripts/load_adp_reports.mjs load workers

# Load timecards
node scripts/load_adp_reports.mjs load timecards
```

---

## ⚡ Sample Output

### Workers Load Example:
```
💾 Loading workers to database...
  ✅ Alexander, Bernard (G3XZQWNKLP9MG9LG) - Active
  ✅ Alonzo, Lamont (G3XZS7CXMJQHPKZZ) - Active
  ✅ Adams, Kamau (G33FP2C9PQVTN34E) - Active
  ...

📊 Workers Summary:
   Inserted: 3
   Updated: 47
   Skipped: 0

✅ All data committed to database successfully!
```

### Timecards Load Example:
```
💾 Loading timecards to database...
  ✅ Alexander, Bernard - 2025-10-15 (8.50 hrs)
  ✅ Alexander, Bernard - 2025-10-16 (9.00 hrs)
  ✅ Alonzo, Lamont - 2025-10-15 (7.75 hrs)
  ...

📊 Timecards Summary:
   Inserted: 45
   Updated: 12
   Skipped: 3

✅ All data committed to database successfully!
```

---

## 🛠️ Troubleshooting

### Error: "ADP_CLIENT_ID not configured"
**Solution:** Make sure you're using `run_adp_loader.sh` wrapper script or that environment variables are set.

### Error: "OAuth token request failed"
**Solution:** 
- Check that ADP credentials are valid
- Verify certificate hasn't expired (valid until Sept 2027)
- Test connection: `./scripts/run_adp_loader.sh test`

### Error: "Supervisor does not exist"
**Cause:** Some workers in ADP don't have supervisors assigned  
**Solution:** This is normal - the script will skip those workers and continue

### Error: "DATABASE_URL required"
**Solution:** Set DATABASE_URL environment variable or use the wrapper script

---

## 📈 Current Data Status

**As of Last Test:**
- ✅ Total Employees: 50
- ✅ Active Workers: 6
- ✅ Terminated Workers: 43
- ✅ Recent Hires: 5 in last 3 months

**Recent Hires:**
1. Alexander, Bernard (Sept 30, 2025)
2. Alonzo, Lamont (Sept 13, 2025)
3. Almonte, Edison (Sept 8, 2025)
4. Alvarez, Cesar (Aug 21, 2025)
5. Adams, Kamau (Aug 5, 2025)

---

## 🔄 Automation Suggestions

### Cron Job for Daily Sync
```bash
# Add to crontab for daily 6 AM sync
0 6 * * * cd /Users/dannydemichele/Cazar && ./scripts/run_adp_loader.sh load all >> /var/log/adp-sync.log 2>&1
```

### Render Deployment Hook
Add to your `render.yaml`:
```yaml
services:
  - type: web
    name: cazar-main
    env: node
    buildCommand: npm install
    startCommand: node server/index.mjs
    
    # Run ADP sync after each deploy
    postDeployCommand: node scripts/load_adp_reports.mjs load all
```

---

## 📞 Support

For ADP API issues or additional permissions:
- **ADP Support:** Contact with Client ID `b2756f2e-79af-403c-9758-2bccecdcbd42`
- **Contact:** rudy@cazarnyc.com
- **Organization:** Cazar Logistics LLC

---

## ✅ Quick Start Checklist

- [x] ADP credentials configured
- [x] Database connection established
- [x] Script tested and working
- [x] Workers data accessible (50 employees)
- [x] Timecards data accessible
- [ ] Run first sync: `./scripts/run_adp_loader.sh load all`
- [ ] Verify data in database
- [ ] Set up automated sync (optional)
- [ ] Request payroll permissions from ADP (optional)

---

**Ready to use!** 🚀

Start with: `./scripts/run_adp_loader.sh test`


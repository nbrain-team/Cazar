# Weekly ADP Timecard Sync - Setup Guide 🔄

**Created:** October 23, 2025  
**Status:** ✅ Configured - Ready to Deploy  
**Schedule:** Every Monday at 6 AM UTC (2 AM EST)

---

## 🎯 What This Does

Automatically syncs ADP timecard data every Monday morning to capture the completed pay period before it rolls off. This builds historical timecard data over time.

**After 12 weeks:** You'll have 3 months of timecard history!

---

## 📋 Setup Instructions

### Step 1: Go to Render Dashboard

1. Go to: https://dashboard.render.com
2. Navigate to your **Cazar** project
3. You should see a new service: **adp-timecard-sync**

### Step 2: Configure Environment Variables

In the Render dashboard for the **adp-timecard-sync** cron job, add these environment variables:

**Required Variables:**
```
ADP_CLIENT_ID=b2756f2e-79af-403c-9758-2bccecdcbd42
ADP_CLIENT_SECRET=9ebde91d-f4ea-4f7e-8d00-7cfdcd6ece66
DATABASE_URL=postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub
```

**For ADP_CERTIFICATE:** (paste this entire block)
```
-----BEGIN CERTIFICATE-----
MIIFTDCCBDSgAwIBAgIQaxQZgOM6tRNeqlAMKfgidzANBgkqhkiG9w0BAQsFADCB
yDELMAkGA1UEBhMCVVMxKDAmBgNVBAoTH0F1dG9tYXRpYyBEYXRhIFByb2Nlc3Np
bmcsIEluYy4xFzAVBgNVBAsTDldlYiBUaWVyIEdyb3VwMTUwMwYDVQQLEywoQykg
MjAxNiBBRFAsIEluYy4gLSBGb3IgYXV0aG9yaXplZCB1c2Ugb25seTE/MD0GA1UE
AxM2QXV0b21hdGljIERhdGEgUHJvY2Vzc2luZyBBcHBsaWNhdGlvbiBTZXJ2aWNl
cyBDQSAtIEczMB4XDTI1MTAxNDE5NDI1NFoXDTI3MTAxNDE5NDI1NFowgZExCzAJ
BgNVBAYTAlVTMQswCQYDVQQIEwJOWTERMA8GA1UEBxMITmV3IFlvcmsxHDAaBgNV
BAoTE0NhemFyIExvZ2lzdGljcyBMTEMxDTALBgNVBAsTBE9wcHMxIDAeBgkqhkiG
9w0BCQEMEXJ1ZHlAY2F6YXJueWMuY29tMRMwEQYDVQQDEwpDYXphciBNYWluMIIB
IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqP+REzal6YvaeMPE0iDiJ5/E
JWLlJy9WvahMzfrE5H8EibyrnyC4zjFPvGo4Z7TWLTwE2CALnk8hl6YmyvptFdqT
NGM+8scnWTMfLxysUeQJpYAMd9kk4x1D1VMElYFXBWD2ilKE4Z1HEr9cP3i6Nzzp
NGJx5iK+mYqWElMBgvDeV/rfLPrhk2VzclI1iW0uJ2f5jRV8O13+rvJYnAk8svim
OKPFgXD5VjpXPOPuPsfPSRXpJI5yh4vll2UKgiujfr7YWWDR7yNEg+zTuKbWXHR2
LPVExhmVBi3p/dGv0pvzaksec19Ng4ZI7ZYbIv717Fm6h1ymhnbScuibWDGl0QID
AQABo4IBZTCCAWEwHwYDVR0jBBgwFoAUrl6sNeCNEBlLSSQiw8kEWFsntsIwCQYD
VR0TBAIwADBZBgNVHR8EUjBQME6gTKBKhkhodHRwOi8vY3JsV1MuYWRwLmNvbS9B
dXRvbWF0aWNEYXRhUHJvY2Vzc2luZ0FwcGxpY2F0aW9uU2VydmljZXNDQS1HMy5j
cmwwgYcGCCsGAQUFBwEBBHsweTBUBggrBgEFBQcwAoZIaHR0cDovL2NydFdTLmFk
cC5jb20vQXV0b21hdGljRGF0YVByb2Nlc3NpbmdBcHBsaWNhdGlvblNlcnZpY2Vz
Q0EtRzMuY3J0MCEGCCsGAQUFBzABhhVodHRwOi8vb2NzcFdTLmFkcC5jb20wDgYD
VR0PAQH/BAQDAgWgMB8GA1UdJQQYMBYGCisGAQQBgjcUAgIGCCsGAQUFBwMCMB0G
A1UdDgQWBBTJd8qCaPRwUajifY+CGDePlzTB/zANBgkqhkiG9w0BAQsFAAOCAQEA
FaK+YYwLXysXQVExIpx7vK5FEFibinxbcbdFMxx5N42jgCkUY6h81JrsTfx0/T1s
JCl3htq9IEVfQW51CYZjO0D313cjsmxlwTVImePxPjQvPGosu9T/k4+DruU+iVjn
WJU27n+gE129MxVQsahI3kZOA8qRY3pBey/VlnREEkzrGBLwUw7Mb/vllR92I9/6
hEoud66XI0jo8SG5wEyb8NyQwXXjUQFM+7P3i1Ttb00kW6DtgA2JBjrFdB8ekhwp
iNTXoXWvjeZ3C//ygjTlGDPPlRT4Tkkuh80b7OSK1imq8nSUt7F1XnGbD5nynGQq
CxujtAzopxM6amFuH7dxeA==
-----END CERTIFICATE-----
```

**For ADP_PRIVATE_KEY:** (paste this entire block)
```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCo/5ETNqXpi9p4
w8TSIOInn8QlYuUnL1a9qEzN+sTkfwSJvKufILjOMU+8ajhntNYtPATYIAueTyGX
pibK+m0V2pM0Yz7yxydZMx8vHKxR5AmlgAx32STjHUPVUwSVgVcFYPaKUoThnUcS
v1w/eLo3POk0YnHmIr6ZipYSUwGC8N5X+t8s+uGTZXNyUjWJbS4nZ/mNFXw7Xf6u
8licCTyy+KY4o8WBcPlWOlc84+4+x89JFekkjnKHi+WXZQqCK6N+vthZYNHvI0SD
7NO4ptZcdHYs9UTGGZUGLen90a/Sm/NqSx5zX02Dhkjtlhsi/vXsWbqHXKaGdtJy
6JtYMaXRAgMBAAECggEACsLDLRMEu3tBPQFSLgMUA2vj5HGIn9ce0dK+mTsHgHkq
A880qlw+CDsRlbC5yLi2DolM0aowszLcs7hLrg8GFScmymYrYvAVbFOZ/7j2q/w2
NQiTQqpb8+4wHIw9tXtX3CrRZ/tbJLaMCQCQUiZQzSWev8wo7nt14Xb2mVIZvYmY
FV2M59/uVXzGLPBu38qJ0LdGJoqvxmtZgrOYyRYzDMPat5MgE3Q4whV0uvq3mZoQ
1nv2NlNengFWkLs8WwbC2CrRKJBPNAWXYxQ4md3EJL6ZB5YQwbg3F1JoE0zrHWg+
Z3MJW9aFByNf7rewG5/Ymvi+aDGdaa/lAg6HjUcJpQKBgQDtp8TbIPdAokNEMZfS
qjKoIvc0JouWHFD4TJRXUPH1AiPnouRKBp+tUPjo7MH1lZiZf/owpmOqsVsCzlgO
T1fq3hPYalNFUcfBJJlPwuGYEhwqLzkLQdadNQ7h1dTaFrHzB87Xrf2Y+dzt/zT4
IwWO/1BwqrDgQtEYolsMVX7IowKBgQC2CxaHPdZ29IA/9O1wK6Qvzz9VdDqelaBi
VwLvxH9BIPqQ2vTv0aqS+t/2WnkMVWe+rYO41+G4WrPjNeReRqKHbpGFVvIUiexT
6QMrvPDcOhqYimXEHLXCaYmRGaIEJ09rVLd84vVQUXF2xuU6G8RiZb7KU2/c4fbo
AwIkN7o6+wKBgQDXEThIxbB7wVv2XpryfiuRlPL5MtinY8CyszqbOhl8jA9KFFNb
2lquUdSvlXKBeHu8jeAwHqObWRzvkSSG7q61UXvMIYxx8uw+kYxcbhQRtnHeixWo
ZlB9vAJXxVb2dgtbz/kTndUdlyCkEIwy8h6Zpdt52j5u9IidLnAO3V/62QKBgQC0
cBMZY+qyp7CDNEMwvqEUHmkZS4Za79Y0AyjO/UZhCM4zTEQhfQGEhBP/fDelSPX2
4sfALIL4Fzdci2tbIsowUSD+OGrkfrz3gut4q+NVdmYsMmmiVA64r6ECaJTVZx1q
NmNU7yTWQpOjdot46FLkcRMGOmOTXYo899ZkjbQShwKBgHlxuy4tZhe2w8tnYFkE
vZngueDAYyzERJfnGHISIUrYHRKX8QigSRk5jUFGRjDZKwsjRWIjuEL/vP/Oodm5
9N0gFc3rUHqOknLbnlPF0t+6/4KJJ2EYnWK4nDU3gxVTy+JTVsKkkK3KPgC1sAw6
T6FuipGtUF7l0kvqYcieTIjE
-----END PRIVATE KEY-----
```

### Step 3: Deploy

The cron job will automatically deploy when you push to `main`. It's already in progress!

---

## ⏰ Schedule Details

**Cron Schedule:** `0 6 * * 1`

**Meaning:**
- **0** = Minute 0
- **6** = Hour 6 (6 AM UTC)
- ***** = Every day of month
- ***** = Every month  
- **1** = Day 1 (Monday)

**Frequency:** Every Monday at 6 AM UTC (2 AM Eastern)

**Why Monday?**
- Captures the completed week (Sunday-Saturday pay period)
- Runs early morning before business hours
- Gives you fresh data for the week ahead

---

## 🚀 How to Run Manually (Right Now!)

### Option 1: In Render Dashboard

1. Go to: https://dashboard.render.com
2. Find the **adp-timecard-sync** cron job
3. Click **"Trigger Run"** button
4. Watch the logs to see it sync

### Option 2: In Render Shell

1. Go to your main **cazar-ops-hub** service
2. Click **"Shell"** tab
3. Run:
```bash
node scripts/load_adp_reports.mjs load timecards
```

### Option 3: Locally (What You've Been Doing)

```bash
cd /Users/dannydemichele/Cazar
bash scripts/run_adp_loader.sh load timecards
```

---

## 📊 What Gets Synced

**Every Monday the cron job will:**

1. ✅ Fetch timecards for all **335+ active workers**
2. ✅ Get the current pay period's data
3. ✅ Extract all clock-in/clock-out times
4. ✅ Load into PostgreSQL `timecards` table
5. ✅ Show summary in logs (inserted/updated counts)

**Data Loaded:**
- Employee ID
- Clock in time
- Clock out time
- Total hours worked
- Date of work

---

## 📈 Building Historical Data

### Week 1 (Today)
Run sync → Get Oct 19-25 data → 491 entries

### Week 2 (Next Monday - Oct 28)
Run sync → Get Oct 26-Nov 1 data → ~500 more entries

### Week 3 (Nov 4)
Run sync → Get Nov 2-8 data → ~500 more entries

**After 12 weeks:** ~6,000 timecard entries covering 3 months! 🎯

---

## 🔍 Monitoring the Sync

### View Logs in Render

1. Go to Render Dashboard
2. Click on **adp-timecard-sync** cron job
3. Click **"Logs"** tab
4. See output like:
```
📋 Fetching timecards for 335 active workers...
  ✅ Ramirez-Castro, Jesse - 2025-10-22 (8.5 hrs)
  ✅ Anthony, Justin - 2025-10-23 (9.2 hrs)
  ...
📊 Timecards Summary:
   Inserted: 500
   Updated: 50
   Skipped: 0
```

### Email Notifications (Optional)

Render can email you when:
- ✅ Sync succeeds
- ❌ Sync fails

Configure in: Render Dashboard → Notifications

---

## ⚡ Running It RIGHT NOW

Want to test it immediately? Run this in your terminal:

```bash
cd /Users/dannydemichele/Cazar
bash scripts/run_adp_loader.sh load timecards
```

**You already have this data!** We loaded it earlier - 491 entries for current week.

To see what's in your database:
```bash
node check_timecards.mjs
```

---

## 🎯 Expected Results

### After First Few Weeks

**Week 1 (Oct 19-25):** 491 entries ✅ Already loaded!  
**Week 2 (Oct 26-Nov 1):** ~500 entries (run sync Monday Oct 28)  
**Week 3 (Nov 2-8):** ~500 entries (run sync Monday Nov 4)  
**Week 4 (Nov 9-15):** ~500 entries (run sync Monday Nov 11)

### After 3 Months (12 weeks)

- **~6,000 timecard entries**
- **Complete 90-day history**
- **All active workers covered**
- **Can answer questions like "who worked 40+ hours last week"**

---

## 🛠️ Troubleshooting

### Cron Job Not Running

**Check:**
1. Environment variables are set in Render dashboard
2. Cron job is "enabled" (not paused)
3. Check logs for errors

### Want to Change Schedule

Edit `render.yaml` and change the schedule line:
```yaml
schedule: "0 6 * * 1"  # Current: Monday 6 AM UTC
```

**Examples:**
- `"0 6 * * *"` = Every day at 6 AM
- `"0 6 * * 0"` = Every Sunday at 6 AM
- `"0 10 * * 1"` = Every Monday at 10 AM

### Manual Test

Trigger manually anytime:
```bash
bash scripts/run_adp_loader.sh load timecards
```

---

## 📝 Quick Reference

**View current data:**
```bash
node check_timecards.mjs
```

**Manual sync:**
```bash
bash scripts/run_adp_loader.sh load timecards
```

**Sync everything (workers + timecards):**
```bash
bash scripts/run_adp_loader.sh load all
```

**Test ADP connection:**
```bash
bash scripts/run_adp_loader.sh test
```

---

## ✅ Setup Checklist

- [x] Cron job added to `render.yaml`
- [x] Changes committed and pushed to GitHub
- [ ] Add environment variables in Render dashboard
- [ ] Verify cron job appears in Render
- [ ] Test manual trigger
- [ ] Verify first automated run (next Monday)
- [ ] Check logs after each run

---

## 🎉 Summary

**Automated Sync:** ✅ Configured  
**Schedule:** Every Monday at 6 AM UTC  
**Data Coverage:** Builds 3 months history over 12 weeks  
**Manual Run:** `bash scripts/run_adp_loader.sh load timecards`

**Next Steps:**
1. Add environment variables in Render dashboard
2. Test manual trigger to verify it works
3. Wait for Monday to see first automated sync!

---

**Status:** Ready to deploy! Push the latest commit and configure environment variables in Render. 🚀


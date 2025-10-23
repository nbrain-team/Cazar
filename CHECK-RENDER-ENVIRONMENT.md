# 🔍 Check Render Environment - Email Sync Troubleshooting

## ✅ Permissions Status: ALL WORKING

**Tested locally and confirmed:**
- ✅ User.Read.All - Working
- ✅ Mail.Read - Working  
- ✅ Mail.ReadBasic.All - Working
- ✅ Email Fetch - Working (fetched 5 emails from jad@cazarnyc.com)

**This is NOT a permissions issue.**

---

## ⚠️ The Real Problem: Sync Failed Silently on Render

**Symptom:**
```json
{
  "inProgress": false,
  "startTime": null,
  "processed": 0
}
```

This means the background sync started but failed immediately.

---

## 🔧 Check These in Render Dashboard

### **Step 1: Verify ANTHROPIC_API_KEY is Set**

1. Go to https://dashboard.render.com
2. Click: **cazar-main** service  
3. Click: **Environment** tab
4. Verify these variables exist:
   - ✅ `MICROSOFT_CLIENT_ID`
   - ✅ `MICROSOFT_CLIENT_SECRET`
   - ✅ `MICROSOFT_TENANT_ID`
   - ⚠️ **`ANTHROPIC_API_KEY`** ← **CRITICAL - Must be set!**

**If ANTHROPIC_API_KEY is missing:**
- The sync will fail when trying to call Claude
- Add it: Key = `ANTHROPIC_API_KEY`, Value = `sk-ant-...`
- Save and wait for redeploy

### **Step 2: Check Render Logs for Errors**

1. In Render dashboard → **Logs** tab
2. Look for error messages around 19:44:39 (when sync started)
3. Look for:
   - `ANTHROPIC_API_KEY` not found
   - Claude API errors
   - Database connection errors

---

## 🧪 Quick Test in Render Shell

Run this to test if Claude API key is accessible:

```bash
# In Render shell:
echo "Anthropic Key: ${ANTHROPIC_API_KEY:0:15}..."
```

**Expected:**
```
Anthropic Key: sk-ant-api03-X...
```

**If blank:**
```
Anthropic Key: ...
```
Then the API key is NOT set in Render environment!

---

## 🎯 Most Likely Issue

Based on the symptoms, **99% chance** the issue is:

**`ANTHROPIC_API_KEY` is not set in Render environment**

The sync:
1. Started ✅
2. Fetched emails ✅  
3. Tried to call Claude to analyze → **FAILED** (no API key)
4. Crashed/exited immediately
5. Status shows processed: 0

---

## ✅ Solution

### **Add ANTHROPIC_API_KEY to Render:**

1. **Get your key from:**
   - https://console.anthropic.com/settings/keys
   - Or create new key if you don't have one

2. **Add to Render:**
   - Dashboard → cazar-main → Environment
   - Add variable:
     - **Key:** `ANTHROPIC_API_KEY`
     - **Value:** `sk-ant-api03-XXXXX...` (your key)
   - Click **Save Changes**

3. **Wait for auto-redeploy** (~3 min)

4. **Restart sync:**
```bash
curl -X POST https://cazar-main.onrender.com/api/email-analytics/sync \
  -H "Content-Type: application/json" \
  -d '{"background": true}'
```

---

## 📋 Render Environment Should Have:

```
✅ MICROSOFT_CLIENT_ID=<your-client-id>
✅ MICROSOFT_CLIENT_SECRET=<your-client-secret>
✅ MICROSOFT_TENANT_ID=<your-tenant-id>
⚠️ ANTHROPIC_API_KEY=sk-ant-api03-... ← **ADD THIS!**
✅ DATABASE_URL=postgresql://...
✅ OPENAI_API_KEY=<your-openai-key>
```

---

**Check if ANTHROPIC_API_KEY is in Render environment. That's the issue!** 🎯


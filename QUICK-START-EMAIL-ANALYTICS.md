# ⚡ Quick Start: Claude 4.5 Email Analytics

## 🎉 What You Got

A complete email intelligence system powered by Claude 4.5 that answers questions like:

> "Show all PTO requests in the last 7 days with response status"  
> "Which driver requests haven't been answered in 48 hours?"  
> "What's the average response time for Fleet emails this month?"

## ⚡ 3-Minute Setup

### 1️⃣ Get Anthropic API Key (2 min)
1. Go to https://console.anthropic.com
2. Sign up → API Keys → Create Key
3. Copy the key (starts with `sk-ant-`)

### 2️⃣ Add to Render (1 min)
1. https://dashboard.render.com
2. Click your service (cazar-main)
3. Environment → Add Variable
   - Key: `ANTHROPIC_API_KEY`
   - Value: `<paste key>`
4. Save (auto-redeploys if needed)

### 3️⃣ Initialize & Sync (After Deploy)

**Wait for deployment** (check Render logs), then:

```bash
# Step 1: Create database (one-time)
curl -X POST https://cazar-main.onrender.com/api/email-analytics/initialize

# Step 2: Sync emails (defaults to last 30 days)
curl -X POST https://cazar-main.onrender.com/api/email-analytics/sync
# Defaults to 30 days - or customize with -d '{"hoursBack": 168}'
```

## 🚀 Start Asking Questions

### Via Smart Agent:
1. Go to `/smart-agent`
2. Enable "Email" database
3. Ask: "Show all PTO requests from last week"

### Via API:
```bash
curl -X POST https://cazar-main.onrender.com/api/email-analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Show all unanswered driver requests"}'
```

## 📋 What You Can Query

✅ All PTO requests and their status  
✅ Uniform requests in last 14 days  
✅ Email volume by category  
✅ Response times by person  
✅ Forwarded emails tracking  
✅ Fleet-related communications  
✅ Incident emails with attachments  
✅ Emails >48hrs without response  
✅ Average response time by category  

## 📚 Full Documentation

- **CLAUDE-EMAIL-ANALYTICS-GUIDE.md** - Complete guide
- **DEPLOYMENT-STATUS.md** - Deployment details

## ✅ Status

**Deployed:** ✅ YES (commit `a5de6df`)  
**Working:** ⏳ After you add ANTHROPIC_API_KEY  
**Ready:** 🎯 3 minutes away!  

---

**That's it!** Add the API key, wait for deployment, initialize, sync, and start asking questions! 🎉


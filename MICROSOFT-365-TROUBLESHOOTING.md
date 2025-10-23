# Microsoft 365 Integration Troubleshooting

**Issue:** Smart Agent shows email sync logs but can't find emails when queried

**Status:** ❌ Requires Admin Consent in Azure Portal

---

## 🔍 What's Happening

Your system is correctly configured with Microsoft 365 credentials, but the API calls are **failing due to missing admin consent** for the required permissions. 

### Current Behavior:
- ✅ Microsoft 365 is **enabled** in Smart Agent (default on)
- ✅ Environment variables are configured
- ✅ OAuth token acquisition attempts are made
- ❌ API calls return **403 Forbidden** errors
- ❌ User sees: "I don't have access to..." instead of email content

### What You're Seeing in Logs:
```
[Microsoft] Acquiring new access token...
[Microsoft] Searching emails for: "captains huddle"
[Microsoft] Error: Forbidden - Admin consent required
```

---

## ✅ Solution: Grant Admin Consent

### Quick Fix (5 minutes):

**1. Go to Azure Portal:**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d
```

**2. Click the button:**
```
⚡ Grant admin consent for [Your Organization Name]
```

**3. Confirm:**
- Click "Yes" in the popup
- Wait for green checkmarks ✅ next to all permissions

**4. Test:**
- Wait 2-5 minutes for propagation
- Ask Smart Agent: "Show me recent emails about captains huddle"
- You should now see results!

---

## 📋 Required Permissions (Application Permissions)

These must all show **"Granted for [Organization]"** status:

| Permission | Purpose | Status |
|------------|---------|--------|
| `User.Read.All` | Read user directory | ⚙️ Needs consent |
| `Mail.Read` | **Search all mailboxes** | ⚙️ Needs consent |
| `Calendars.Read` | Find calendar events | ⚙️ Needs consent |
| `Team.ReadBasic.All` | Access Teams info | ⚙️ Needs consent |
| `ChannelMessage.Read.All` | Read Teams messages | ⚙️ Needs consent |
| `Files.Read.All` | Search OneDrive/SharePoint | ⚙️ Needs consent |
| `Sites.Read.All` | Read SharePoint sites | ⚙️ Needs consent |

---

## 🧪 Testing After Fix

### Test Query 1: Email Search
```
"Show me emails about captains huddle"
```

**Expected Result:**
```
✅ EMAIL: Captains Huddle - Weekly Meeting
   From: John Smith
   Date: Oct 21, 2025
   Snippet: "This week's captains huddle will cover..."
```

### Test Query 2: Calendar Events
```
"What meetings do we have scheduled this week?"
```

**Expected Result:**
```
✅ CALENDAR: Weekly Ops Review
   When: Oct 23, 2025 2:00 PM
   Location: Conference Room A
```

### Test Query 3: Teams Messages
```
"What did the team discuss about Route 405?"
```

**Expected Result:**
```
✅ TEAMS: General Channel - Operations Team
   From: Sarah Johnson
   Message: "Route 405 schedule changes approved..."
```

---

## 🔧 Advanced Troubleshooting

### If Admin Consent Button is Disabled:

**Cause:** You don't have Azure AD Administrator role

**Solution:**
1. Contact your IT administrator
2. Send them this information:
   - App Name: nBrain
   - App ID: `fe9e4018-6e34-4662-8989-18ef789f727d`
   - Required action: Grant admin consent for Microsoft Graph permissions
   - Link: https://portal.azure.com (search for app ID above)

### If Consent Granted but Still Not Working:

**Step 1: Wait for Propagation**
- Azure AD can take 5-10 minutes to propagate permissions
- Try again after waiting

**Step 2: Check Logs**
```bash
# On Render, check recent logs for:
[Microsoft] Successfully acquired access token
[Microsoft] Found X users to search
[Microsoft] Found Y emails for [user]
```

**Step 3: Clear Token Cache**
- Restart the Render service (forces new token acquisition)
- Dashboard → cazar-ops-hub → Manual Deploy → Deploy Latest Commit

**Step 4: Verify Environment Variables**
```bash
# In Render dashboard, check these are set:
MICROSOFT_CLIENT_ID=fe9e4018-6e34-4662-8989-18ef789f727d
MICROSOFT_CLIENT_SECRET=***[should be set]***
MICROSOFT_TENANT_ID=6c2922d6-1e81-4857-a4b6-ee13a30f5b9d
MICROSOFT_REDIRECT_URI=https://cazar-main.onrender.com/auth/microsoft/callback
```

---

## 📊 Improved Error Messages (After Deploy)

After the latest deployment, you'll now see **detailed error messages** in the Smart Agent:

### Before (Generic):
```
"I don't have access to the details..."
```

### After (Specific):
```
⚠️ Microsoft 365 Connection Issue

Microsoft 365 integration requires admin consent in Azure Portal.

App ID: fe9e4018-6e34-4662-8989-18ef789f727d

Required permissions:
- User.Read.All
- Mail.Read  
- Calendars.Read
- Team.ReadBasic.All
- ChannelMessage.Read.All
- Files.Read.All
- Sites.Read.All

See MICROSOFT-365-SETUP-GUIDE.md for instructions.
```

---

## 🎯 Expected Behavior After Fix

### Smart Agent Query:
```
User: "Tell me about the most recent captains huddle we had"
```

### Smart Agent Response:
```
Based on your recent emails and calendar:

**Captains Huddle - October 21, 2025**

From the email thread:
- Subject: "Weekly Captains Huddle - Route Updates"
- Participants: John Smith, Sarah Johnson, Mike Chen
- Key Topics:
  - Route 405 schedule changes
  - Driver training requirements
  - Vehicle maintenance updates

Meeting Notes (from calendar event):
- Started: Oct 21, 2:00 PM
- Duration: 1 hour
- Location: Conference Room B

Action Items:
1. Sarah: Update driver training docs by Friday
2. Mike: Schedule van maintenance this week

Sources:
- EMAIL: Captains Huddle invitation
- CALENDAR: Weekly Captains Huddle event
- TEAMS: General channel discussion
```

---

## 📞 Quick Reference

**App ID:** fe9e4018-6e34-4662-8989-18ef789f727d  
**Tenant ID:** 6c2922d6-1e81-4857-a4b6-ee13a30f5b9d  
**Direct Link:** https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d  

**What to Click:** "Grant admin consent for [Your Organization]"  
**Expected Result:** All 7 permissions show green checkmark ✅  
**Wait Time:** 2-5 minutes for Azure to propagate  
**Test Query:** "Show me emails about captains huddle"  

---

## ✅ Checklist

- [ ] Go to Azure Portal (link above)
- [ ] Find app: fe9e4018-6e34-4662-8989-18ef789f727d
- [ ] Click "API permissions" tab
- [ ] Verify all 7 permissions are listed
- [ ] Click "Grant admin consent" button
- [ ] Click "Yes" to confirm
- [ ] See green checkmarks ✅ next to all permissions
- [ ] Wait 5 minutes
- [ ] Test query in Smart Agent
- [ ] See email results!

---

**Updated:** October 23, 2025  
**Status After Fix:** ✅ Fully Operational  
**Time to Fix:** ~5 minutes (if you have admin access)



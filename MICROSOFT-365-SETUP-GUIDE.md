# Microsoft 365 Integration - Complete Setup Guide

**Status:** ❌ Permissions not configured  
**Tested:** October 14, 2025  
**App Name:** nBrain  
**Client ID:** fe9e4018-6e34-4662-8989-18ef789f727d  

---

## 🎯 **What This Enables**

Once configured, your Smart Agent will be able to:
- ✅ Search emails across all mailboxes
- ✅ Find calendar events and meetings
- ✅ Search Teams messages and conversations
- ✅ Find files in OneDrive and SharePoint
- ✅ Access user directory information

---

## 📋 **Step-by-Step Setup Instructions**

### **Step 1: Go to Azure Portal**

**🔗 Direct Link to Your App:**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d
```

**Or manually navigate:**
1. Go to: https://portal.azure.com
2. Sign in with admin account
3. Search for "Azure Active Directory" in top search bar
4. Click "App registrations" in left menu
5. Search for Client ID: `fe9e4018-6e34-4662-8989-18ef789f727d`
6. Click on the app

---

### **Step 2: Add API Permissions**

**🔗 Direct Link to API Permissions Page:**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d/isMSAApp~/false
```

1. You should now be on the "API permissions" page
2. Click the button: **"+ Add a permission"**
3. In the panel that opens, click **"Microsoft Graph"**
4. Click **"Application permissions"** (NOT "Delegated permissions")

---

### **Step 3: Add Each Permission**

**Search for and add these permissions ONE BY ONE:**

#### **Required Permissions:**

| Permission Name | Purpose | How to Find |
|---|---|---|
| `User.Read.All` | Read all users | Type "user" → Check "User.Read.All" |
| `Mail.Read` | Read all mailboxes | Type "mail" → Check "Mail.Read" |
| `Calendars.Read` | Read all calendars | Type "calendar" → Check "Calendars.Read" |
| `Team.ReadBasic.All` | Read Teams info | Type "team" → Check "Team.ReadBasic.All" |
| `ChannelMessage.Read.All` | Read Teams messages | Type "channel" → Check "ChannelMessage.Read.All" |
| `Files.Read.All` | Read files | Type "files" → Check "Files.Read.All" |
| `Sites.Read.All` | Read SharePoint | Type "sites" → Check "Sites.Read.All" |

**For EACH permission:**
1. Click "+ Add a permission"
2. Click "Microsoft Graph"
3. Click "Application permissions"
4. Search for the permission name in the search box
5. Check the checkbox next to it
6. Click "Add permissions" at bottom
7. Repeat for next permission

---

### **Step 4: Grant Admin Consent** ⚠️ **CRITICAL STEP**

**After adding ALL permissions:**

1. Look at the permissions list - you'll see a "Status" column
2. Currently, all will show "Not granted"
3. At the top of the permissions list, click the button:
   ```
   ⚡ Grant admin consent for [Your Organization Name]
   ```
4. A popup will appear - Click **"Yes"** to confirm
5. Wait for the page to reload
6. **VERIFY:** All permissions should now show a **green checkmark** ✅ in the Status column

**🔗 Direct Link (if you have admin rights):**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d/isMSAApp~/false
```

---

## ✅ **Verification Checklist**

After completing all steps, verify:

- [ ] All 7 permissions are listed on the API permissions page
- [ ] Each permission shows **"Application"** in the Type column
- [ ] Each permission has a **green checkmark** ✅ in the Status column
- [ ] Status says "Granted for [Your Organization]"

---

## 🧪 **Test After Setup**

Wait 2-5 minutes for permissions to propagate, then test Smart Agent:

**Test queries:**
1. "Search emails about scheduling"
2. "Show calendar events this week"
3. "Find Teams messages about compliance"
4. "Who are the users in our organization?"

**Expected:** Real results from your Microsoft 365 data  
**If still failing:** Wait another 5 minutes and retry

---

## 📊 **Current Status (Tested Locally)**

**Test Results:**
```
❌ Read Users       - Missing User.Read.All
❌ Read Mail        - Missing Mail.Read  
❌ Read Calendar    - Missing Calendars.Read
❌ Read Teams       - Missing Team.ReadBasic.All
❌ Read Files       - Missing Files.Read.All
```

**All permissions need to be added and admin consent granted.**

---

## 🔧 **Troubleshooting**

### **Problem: "Grant admin consent" button is grayed out**
**Solution:** You need Azure AD Administrator role. Contact your IT admin.

### **Problem: Permissions don't work after granting consent**
**Solution:** Wait 5-10 minutes for Azure AD to propagate permissions.

### **Problem: "Admin consent required" error**
**Solution:** Make sure you clicked "Grant admin consent" button, not just adding permissions.

### **Problem: Can't find the app in Azure Portal**
**Solution:** Use the direct link above or search for Client ID: `fe9e4018-6e34-4662-8989-18ef789f727d`

---

## 👤 **Who Should Do This?**

**Required Role:** Azure AD Administrator or Global Administrator

**If you're the admin:** Follow the steps above  
**If you're not:** Forward this document to your IT admin with these details:
- App Name: nBrain
- Client ID: fe9e4018-6e34-4662-8989-18ef789f727d
- Purpose: Enable Smart Agent to search Microsoft 365 data
- Security: App uses secure application permissions (service-to-service)

---

## 📞 **Quick Summary for IT Admin**

**App:** nBrain (fe9e4018-6e34-4662-8989-18ef789f727d)  
**Action:** Add Microsoft Graph Application Permissions  
**Permissions:** User.Read.All, Mail.Read, Calendars.Read, Team.ReadBasic.All, ChannelMessage.Read.All, Files.Read.All, Sites.Read.All  
**Critical:** Must grant admin consent after adding permissions  
**Time:** 5-10 minutes total  

**Direct Link:** https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d

---

## 🎉 **After Setup**

Once permissions are granted, the Smart Agent will automatically:
- Search your emails for relevant information
- Find calendar events and meetings
- Search Teams conversations
- Locate files in OneDrive/SharePoint
- Access user directory for contact info

No code changes needed - it will just work!


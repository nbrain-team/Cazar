# Microsoft 365 API Permissions - Complete Step-by-Step Guide

**App Name:** nBrain  
**Client ID:** fe9e4018-6e34-4662-8989-18ef789f727d  
**Tenant ID:** 6c2922d6-1e81-4857-a4b6-ee13a30f5b9d  

---

## 📋 **Complete Walkthrough**

### **STEP 1: Open Azure Portal**

**🔗 Click this link:**
```
https://portal.azure.com
```

**What you'll see:**
- Microsoft Azure login page
- Sign in with your admin account

**Action:** Enter your credentials and sign in

---

### **STEP 2: Navigate to Azure Active Directory**

**Option A - Search Bar (Fastest):**
1. Look at the **very top of the page** - there's a search bar that says "Search (Ctrl+/)"
2. Click in it
3. Type: **"Azure Active Directory"**
4. Click on **"Azure Active Directory"** in the results

**Option B - Left Menu:**
1. Look at the **left sidebar**
2. Click **"Azure Active Directory"** (blue icon with buildings)

**What you'll see:**
- Azure Active Directory Overview page
- Tenant information on the right

---

### **STEP 3: Go to App Registrations**

**From the Azure AD page:**
1. Look at the **left sidebar menu**
2. Under "Manage" section, click **"App registrations"**

**What you'll see:**
- List of all registered applications
- Search bar at the top

---

### **STEP 4: Find Your nBrain App**

**Two ways to find it:**

**Option A - Use Client ID (Recommended):**
1. In the search box at the top, paste this: **`fe9e4018-6e34-4662-8989-18ef789f727d`**
2. Press Enter
3. Click on the app that appears

**Option B - Browse the list:**
1. Look through the list for an app named "nBrain" or similar
2. Click on it
3. Verify the "Application (client) ID" matches: `fe9e4018-6e34-4662-8989-18ef789f727d`

**What you'll see:**
- App overview page
- Application (client) ID displayed
- Left sidebar with various options

---

### **STEP 5: Open API Permissions Page**

**🔗 Or use this DIRECT LINK (faster):**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d/isMSAApp~/false
```

**Or manually:**
1. Look at the **left sidebar**
2. Under "Manage" section, click **"API permissions"**

**What you'll see:**
- Page title: "nBrain - API permissions"
- A button: **"+ Add a permission"**
- A button: **"Grant admin consent for [Your Organization]"**
- A table showing current permissions with columns:
  - **Permission** (name of the permission)
  - **Type** (Application or Delegated)
  - **Status** (Granted or Not granted)

---

### **STEP 6: Review Current Permissions**

**Look at the permissions table.**

**You should see ~7 existing permissions:**
- Group-Conversation.ReadWrite.All
- OnlineMeetings.Read.All
- OnlineMeetingArtifact.Read.All
- ChannelMessage.Read.All
- (and a few more meeting-related ones)

**All should show:**
- Type: **Application**
- Status: **Granted for [Your Organization]** ✅

**What you DON'T see yet (we need to add these):**
- ❌ User.Read.All
- ❌ Mail.Read
- ❌ Calendars.Read
- ❌ Team.ReadBasic.All
- ❌ Files.Read.All
- ❌ Sites.Read.All

---

### **STEP 7: Add Permission #1 - User.Read.All**

1. Click the **"+ Add a permission"** button (top left)
   
2. A panel opens on the right side with title "Request API permissions"
   
3. Click the **"Microsoft Graph"** tile (big blue icon)
   
4. You'll see two options:
   - ⭕ Delegated permissions
   - ⭕ Application permissions
   
5. Click **"Application permissions"** (NOT Delegated!)
   
6. You'll see a search box at the top and a list of permission categories
   
7. Type **"User"** in the search box
   
8. Look for the **"User"** category in the results (with a dropdown arrow)
   
9. Click the arrow to **expand it**
   
10. You'll see a list of permissions starting with "User."
   
11. Find and **check the box** next to: **"User.Read.All"**
    - Description says something like "Read all users' full profiles"
   
12. Click the **"Add permissions"** button at the bottom of the panel
   
13. The panel closes and you're back at the permissions list

**What you'll see:**
- "User.Read.All" now appears in the permissions table
- Type: Application
- Status: **"Not granted for [Your Organization]"** (red X)

---

### **STEP 8: Add Permission #2 - Mail.Read**

1. Click **"+ Add a permission"** again
2. Click **"Microsoft Graph"**
3. Click **"Application permissions"**
4. Type **"Mail"** in search box
5. Expand the **"Mail"** category
6. Check the box next to: **"Mail.Read"**
   - Description: "Read mail in all mailboxes"
7. Click **"Add permissions"**

**Repeat this process for each remaining permission:**

---

### **STEP 9: Add Permission #3 - Calendars.Read**

1. "+ Add a permission" → Microsoft Graph → Application permissions
2. Search: **"Calendars"**
3. Expand "Calendars" category
4. Check: **"Calendars.Read"**
5. "Add permissions"

---

### **STEP 10: Add Permission #4 - Team.ReadBasic.All**

1. "+ Add a permission" → Microsoft Graph → Application permissions
2. Search: **"Team"**
3. Expand "Team" category
4. Check: **"Team.ReadBasic.All"**
5. "Add permissions"

---

### **STEP 11: Add Permission #5 - Files.Read.All**

1. "+ Add a permission" → Microsoft Graph → Application permissions
2. Search: **"Files"**
3. Expand "Files" category
4. Check: **"Files.Read.All"**
5. "Add permissions"

---

### **STEP 12: Add Permission #6 - Sites.Read.All**

1. "+ Add a permission" → Microsoft Graph → Application permissions
2. Search: **"Sites"**
3. Expand "Sites" category
4. Check: **"Sites.Read.All"**
5. "Add permissions"

---

### **STEP 13: CRITICAL - Grant Admin Consent**

**After adding ALL 6 new permissions above:**

**What the page looks like now:**
- You should see ~13-14 total permissions in the table
- The 7 old ones have Status: "Granted" ✅
- The 6 NEW ones have Status: "Not granted" ❌

**NOW - the most important step:**

1. Look at the **TOP of the permissions table**
   
2. You'll see a button that says: **"⚡ Grant admin consent for [Your Organization Name]"**
   - It might say "Grant admin consent for Cazar" or whatever your org is called
   
3. Click that button
   
4. A popup appears asking: **"Grant consent"** with explanation text
   
5. Read it and click **"Yes"** to confirm
   
6. The page will **reload/refresh**
   
7. **VERIFY:** Look at the Status column - ALL permissions should now show:
   - Status: **"Granted for [Your Organization]"** with green checkmark ✅

**What if the button is grayed out?**
- You don't have admin rights
- Contact your IT admin
- They need "Application Administrator" or "Global Administrator" role

---

### **STEP 14: Final Verification**

**After granting consent, the permissions table should show:**

| Permission | Type | Status |
|---|---|---|
| User.Read.All | Application | ✅ Granted for [Your Org] |
| Mail.Read | Application | ✅ Granted for [Your Org] |
| Calendars.Read | Application | ✅ Granted for [Your Org] |
| Team.ReadBasic.All | Application | ✅ Granted for [Your Org] |
| Files.Read.All | Application | ✅ Granted for [Your Org] |
| Sites.Read.All | Application | ✅ Granted for [Your Org] |
| ChannelMessage.Read.All | Application | ✅ Granted for [Your Org] |
| OnlineMeetings.Read.All | Application | ✅ Granted for [Your Org] |
| *(and the other meeting permissions)* | Application | ✅ Granted for [Your Org] |

**All should have green checkmarks!**

---

### **STEP 15: Wait and Test**

1. **Wait 2-5 minutes** for permissions to propagate through Microsoft's systems
   
2. **Let me know** and I'll run the test again
   
3. **Or test yourself:** Ask Smart Agent → "Search emails about scheduling"

---

## 🎯 **Quick Reference Links**

### **Direct Link to Your App's API Permissions:**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/fe9e4018-6e34-4662-8989-18ef789f727d/isMSAApp~/false
```

### **Direct Link to App Overview:**
```
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/fe9e4018-6e34-4662-8989-18ef789f727d
```

### **Azure Portal Home:**
```
https://portal.azure.com
```

---

## ⚠️ **Common Mistakes to Avoid**

1. ❌ **Adding "Delegated" permissions** instead of "Application" permissions
   - Always choose "Application permissions" tab

2. ❌ **Forgetting to grant admin consent**
   - Adding permissions isn't enough - MUST click "Grant admin consent" button

3. ❌ **Wrong app**
   - Always verify Client ID: `fe9e4018-6e34-4662-8989-18ef789f727d`

4. ❌ **Not waiting**
   - Permissions take 2-5 minutes to propagate

---

## 📸 **What Each Screen Should Look Like**

### **Screen 1: Azure Portal Home**
- Top: Blue bar with Microsoft Azure logo
- Search bar in the middle
- Left sidebar with icons

### **Screen 2: Azure Active Directory**
- Left sidebar with options: Overview, Users, Groups, App registrations, etc.
- Main area shows tenant information

### **Screen 3: App Registrations List**
- Table of apps
- Search box at top
- Your app should appear when searching for Client ID

### **Screen 4: Your App Overview**
- Top shows: App name, Client ID, Tenant ID
- Left sidebar: Overview, Authentication, Certificates & secrets, API permissions, etc.

### **Screen 5: API Permissions (THIS IS WHERE YOU NEED TO BE!)**
- Top buttons: "+ Add a permission", "Grant admin consent for..."
- Table with 3 columns: Permission, Type, Status
- Each permission has a row

---

## ✅ **Success Checklist**

After completing all steps:
- [ ] I found my app using Client ID: fe9e4018-6e34-4662-8989-18ef789f727d
- [ ] I'm on the "API permissions" page
- [ ] I see ~13-14 total permissions in the list
- [ ] I can see "Calendars.Read" in the list
- [ ] I can see "Mail.Read" in the list
- [ ] Type column says "Application" for all new permissions
- [ ] I clicked "Grant admin consent for [My Org]" button
- [ ] I clicked "Yes" to confirm
- [ ] ALL permissions now show green checkmarks ✅
- [ ] I waited 2-5 minutes

---

## 🆘 **Still Stuck?**

If you're having trouble, tell me:
1. Which step you're on
2. What you see on the screen
3. Any error messages

I'll help you through it! 🎯






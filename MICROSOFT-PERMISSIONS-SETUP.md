# Microsoft 365 API Permissions Setup

## 🎯 **Required Actions in Azure Portal**

Your Azure AD app is authenticating successfully but needs additional API permissions to access data.

---

## 📋 **Step-by-Step Instructions**

### **1. Go to Azure Portal**
URL: https://portal.azure.com

### **2. Navigate to App Registration**
1. Click "Azure Active Directory" in left menu
2. Click "App registrations"
3. Find and click your Cazar app:
   - Application (client) ID: `fe9e4018-6e34-4662-8989-18ef789f727d`
   - Name: Should show as "nBrain" or similar

### **3. Add API Permissions**
1. Click "API permissions" in the left menu
2. Click "+ Add a permission"
3. Click "Microsoft Graph"
4. Click "Application permissions" (NOT Delegated)

### **4. Add These Specific Permissions:**

**For Email Search:**
- ✅ `Mail.Read` - Read mail in all mailboxes

**For Calendar Search:**
- ✅ `Calendars.Read` - Read calendars in all mailboxes

**For Teams Search:**
- ✅ `Team.ReadBasic.All` - Read the names and descriptions of teams
- ✅ `ChannelMessage.Read.All` - Read all channel messages

**For File Search:**
- ✅ `Files.Read.All` - Read all files
- ✅ `Sites.Read.All` - Read items in all site collections

**For User Info:**
- ✅ `User.Read.All` - Read all users' full profiles

### **5. Grant Admin Consent** (Critical Step!)
1. After adding all permissions, you'll see them listed
2. Click the button: **"Grant admin consent for [Your Organization]"**
3. Click "Yes" to confirm
4. All permissions should now show a green checkmark in the "Status" column

### **6. Wait 2-5 Minutes**
- Permissions can take a few minutes to propagate
- No redeploy needed - changes take effect immediately

---

## ✅ **Verification**

After granting permissions, test by asking Smart Agent:
- "Search emails about scheduling"
- "Show me calendar events this week"
- "Find Teams messages about compliance"

You should see actual results instead of permission errors.

---

## 🔐 **Security Note**

These are **Application permissions** (app-only access), which means:
- The app can access data on behalf of itself, not a specific user
- Requires admin consent (which you're granting)
- Appropriate for service-to-service integration
- Follows Microsoft's security best practices

---

## 📞 **Who Can Do This?**

You need someone with **Azure AD Administrator** role in your organization to grant these permissions.

If you don't have access:
1. Contact your IT admin
2. Share this document with them
3. They can complete in 5-10 minutes


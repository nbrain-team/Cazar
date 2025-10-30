# 📁 Microsoft OneDrive & SharePoint Document Access API

**Created:** October 30, 2025  
**Status:** ✅ Fully Operational

---

## 🎉 Overview

You now have **full API access** to all documents stored in Microsoft 365 OneDrive and SharePoint accounts, including Rudy@CazarNYC.com's extensive document library.

### ✅ What You Can Access:

- **OneDrive files and folders** (all users)
- **SharePoint sites and documents**
- **File metadata** (size, modified date, author)
- **Download URLs** for files
- **Search across all documents**

---

## 📊 Rudy's OneDrive Summary

**Account:** Rudy@CazarNYC.com  
**Storage Used:** 103.46 GB / 1,024 GB (10.1%)  
**Total Items:** 47 folders/files in root  

### 📁 Key Document Folders:

1. **1-Biz Owner Folder (Critical)** - 1.1 GB, 56 items
2. **2-The Organization (High)** - 81 GB, 16 folders 🔥 
3. **3-Leadership Folder (Elevated)** - 8.5 GB, 8 folders
4. **4-Management Folder (Guarded)** - 107 MB, 1 folder
5. **Microsoft Teams Chat Files** - 2.2 GB, 97 files
6. **Documents** - Standard documents folder
7. **Amazon DSP** - Amazon-related documents
8. **FedEx Joint Ops** - FedEx partnership docs
9. **EMBA** - Education materials

### 📄 Key Files Available:

- Organizational Scorecard (Excel)
- AI Implementation at Cazar (Excel)
- Meeting Schedules (Excel)
- Critical Information Triggers (Word)
- Master Team Email List (Excel)
- Process documentation & SOPs
- Org charts & diagrams

---

## 🚀 API Endpoints

### 1. Get OneDrive Info

Get storage information and quota for a user's OneDrive.

```bash
GET /api/documents/drive/:email
```

**Example:**
```bash
curl https://cazar-main.onrender.com/api/documents/drive/Rudy@CazarNYC.com
```

**Response:**
```json
{
  "id": "b!S6ei_oz1tkmxhQTZbdAYCniOkxlpK8VGv4A6xuFHeM9KzCHIMC0tTrHxcgmemotS",
  "driveType": "business",
  "owner": "Rudy Cazares",
  "quota": {
    "used": 111069184000,
    "total": 1099511627776,
    "usedGB": "103.46",
    "totalGB": "1024.00",
    "percentUsed": "10.1"
  }
}
```

---

### 2. List OneDrive Contents

List files and folders in a specific directory.

```bash
GET /api/documents/list/:email?path=root&limit=50
```

**Parameters:**
- `email` (required) - User email address
- `path` (optional) - Folder path or ID (default: "root")
- `limit` (optional) - Max items to return (default: 50)

**Example - List root folder:**
```bash
curl "https://cazar-main.onrender.com/api/documents/list/Rudy@CazarNYC.com?path=root&limit=50"
```

**Example - List specific folder by ID:**
```bash
curl "https://cazar-main.onrender.com/api/documents/list/Rudy@CazarNYC.com?path=01ABCDEF12345&limit=20"
```

**Response:**
```json
{
  "items": [
    {
      "id": "01ABCDEF12345",
      "name": "1-Biz Owner Folder (Critical)",
      "type": "folder",
      "size": 1178017587,
      "sizeKB": "1150407.8",
      "modified": "2024-03-25T10:30:00Z",
      "modifiedBy": "Rudy Cazares",
      "webUrl": "https://...",
      "childCount": 56,
      "path": "/drive/root:"
    },
    {
      "id": "01GHIJK67890",
      "name": "AI Implementation at Cazar.xlsx",
      "type": "file",
      "size": 10752,
      "sizeKB": "10.5",
      "modified": "2025-07-28T14:22:00Z",
      "modifiedBy": "Rudy Cazares",
      "webUrl": "https://...",
      "downloadUrl": "https://...",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  ],
  "count": 47,
  "path": "root"
}
```

---

### 3. Search Documents

Search for files and folders by keyword.

```bash
GET /api/documents/search/:email?q=query&limit=20
```

**Parameters:**
- `email` (required) - User email address
- `q` (required) - Search query
- `limit` (optional) - Max results (default: 20)

**Example - Search for "scorecard":**
```bash
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=scorecard&limit=10"
```

**Example - Search for "Amazon":**
```bash
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=Amazon"
```

**Response:**
```json
{
  "items": [
    {
      "id": "01XYZ...",
      "name": "01-NEW Organizational Scorecard.xlsm",
      "type": "file",
      "size": 265523,
      "sizeKB": "259.3",
      "modified": "2025-05-19T09:15:00Z",
      "modifiedBy": "Rudy Cazares",
      "webUrl": "https://...",
      "downloadUrl": "https://...",
      "path": "/drive/root:",
      "mimeType": "application/vnd.ms-excel.sheet.macroEnabled.12"
    }
  ],
  "query": "scorecard",
  "count": 1
}
```

---

### 4. Get File Metadata

Get detailed information about a specific file or folder.

```bash
GET /api/documents/file/:email/:fileId
```

**Example:**
```bash
curl "https://cazar-main.onrender.com/api/documents/file/Rudy@CazarNYC.com/01ABCDEF12345"
```

**Response:**
```json
{
  "id": "01ABCDEF12345",
  "name": "AI Implementation at Cazar.xlsx",
  "type": "file",
  "size": 10752,
  "sizeKB": "10.5",
  "sizeMB": "0.01",
  "created": "2025-07-28T12:00:00Z",
  "modified": "2025-07-28T14:22:00Z",
  "createdBy": "Rudy Cazares",
  "modifiedBy": "Rudy Cazares",
  "webUrl": "https://emeritusinvestmentpartners.sharepoint.com/...",
  "downloadUrl": "https://...",
  "path": "/drive/root:",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

---

### 5. Get File Download URL

Get a temporary download URL for a specific file.

```bash
GET /api/documents/download/:email/:fileId
```

**Example:**
```bash
curl "https://cazar-main.onrender.com/api/documents/download/Rudy@CazarNYC.com/01ABCDEF12345"
```

**Response:**
```json
{
  "name": "AI Implementation at Cazar.xlsx",
  "size": 10752,
  "downloadUrl": "https://emeritusinvestmentpartners.sharepoint.com/...",
  "webUrl": "https://emeritusinvestmentpartners.sharepoint.com/...",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

**Note:** The `downloadUrl` is temporary and expires after a short time (usually 1-2 hours).

---

### 6. List SharePoint Sites

Get all SharePoint sites accessible to your organization.

```bash
GET /api/documents/sharepoint?limit=20
```

**Example:**
```bash
curl "https://cazar-main.onrender.com/api/documents/sharepoint?limit=20"
```

**Response:**
```json
{
  "sites": [
    {
      "id": "emeritusinvestmentpartners.sharepoint.com,10a6807a-520b-41c3-818b-8030026249e5,e43b9e58-f663-4302-838c-3603c78442cd",
      "name": "Management Team - 7- Offboarding",
      "description": "Team site for offboarding processes",
      "webUrl": "https://emeritusinvestmentpartners.sharepoint.com/sites/CazarJointOpsLeadershipTeam-7-Offboarding",
      "created": "2024-01-15T10:00:00Z"
    }
  ],
  "count": 10
}
```

---

### 7. Get Folders by Name

Search for specific folders by name.

```bash
GET /api/documents/folders/:email?names=folder1,folder2,folder3
```

**Parameters:**
- `email` (required) - User email address
- `names` (required) - Comma-separated folder names

**Example:**
```bash
curl "https://cazar-main.onrender.com/api/documents/folders/Rudy@CazarNYC.com?names=Documents,Amazon,FedEx"
```

**Response:**
```json
{
  "Documents": [
    {
      "id": "01ABC...",
      "name": "Documents",
      "type": "folder",
      "childCount": 4,
      "webUrl": "https://..."
    }
  ],
  "Amazon": [
    {
      "id": "01DEF...",
      "name": "Amazon DSP",
      "type": "folder",
      "childCount": 19,
      "webUrl": "https://..."
    }
  ],
  "FedEx": [
    {
      "id": "01GHI...",
      "name": "FedEx Joint Ops",
      "type": "folder",
      "childCount": 7,
      "webUrl": "https://..."
    }
  ]
}
```

---

## 💡 Common Use Cases

### Use Case 1: Browse Rudy's Root Folder

```bash
# Get storage info
curl https://cazar-main.onrender.com/api/documents/drive/Rudy@CazarNYC.com

# List root contents
curl "https://cazar-main.onrender.com/api/documents/list/Rudy@CazarNYC.com?path=root&limit=50"
```

### Use Case 2: Find All Excel Files

```bash
# Search for Excel files
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=.xlsx&limit=50"
```

### Use Case 3: Get Organizational Documents

```bash
# Search for organizational docs
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=organizational"

# Search for scorecards
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=scorecard"
```

### Use Case 4: Access Critical Business Folder

```bash
# Search for the critical folder
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=Biz+Owner+Folder"

# Get folder ID from response, then list contents
curl "https://cazar-main.onrender.com/api/documents/list/Rudy@CazarNYC.com?path=FOLDER_ID_HERE"
```

### Use Case 5: Download a Specific File

```bash
# First, search for the file
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=AI+Implementation"

# Get the file ID from response, then get download URL
curl "https://cazar-main.onrender.com/api/documents/download/Rudy@CazarNYC.com/FILE_ID_HERE"

# Use the downloadUrl from response to download
wget "DOWNLOAD_URL_FROM_RESPONSE"
```

### Use Case 6: Find Amazon-Related Documents

```bash
# Search Amazon folder
curl "https://cazar-main.onrender.com/api/documents/folders/Rudy@CazarNYC.com?names=Amazon"

# Or search for Amazon documents
curl "https://cazar-main.onrender.com/api/documents/search/Rudy@CazarNYC.com?q=Amazon"
```

---

## 🔒 Permissions & Access

### Current Permissions:
- ✅ **User.Read.All** - Read user profiles
- ✅ **Files.Read.All** - Read all OneDrive files
- ✅ **Sites.Read.All** - Read all SharePoint sites
- ✅ **Mail.Read** - Read emails (already working)

### What You Can Do:
- ✅ Read any file or folder
- ✅ Search across all documents
- ✅ Get file metadata
- ✅ Get download URLs
- ✅ Access SharePoint sites
- ❌ Cannot write/modify files (read-only)
- ❌ Cannot delete files

---

## 📋 Supported File Types

All file types are supported. Common ones include:

- **Office Documents:** .docx, .xlsx, .pptx, .xlsm
- **PDFs:** .pdf
- **Images:** .jpg, .png, .gif, .webp
- **Videos:** .mp4, .webm, .mov
- **Diagrams:** .vsdx (Visio)
- **Archives:** .zip
- **Text:** .txt, .csv

---

## 🎯 Next Steps

### Immediate Actions:
1. **Test the API** - Try the endpoints with Rudy's account
2. **Browse Key Folders** - Explore "Biz Owner Folder" and "The Organization"
3. **Search for Documents** - Find specific files you need

### Integration Ideas:
1. **Smart Agent Enhancement** - Add document search to AI agent
2. **Document Dashboard** - Build UI to browse documents
3. **Automatic Backups** - Download critical files periodically
4. **Document Analytics** - Track document usage and changes
5. **Cross-Reference** - Link documents with emails and other data

---

## 📊 File Statistics

Based on Rudy's OneDrive:

| Category | Count/Size |
|----------|------------|
| **Total Storage** | 103.46 GB |
| **Root Items** | 47 |
| **Largest Folder** | "The Organization" (81 GB) |
| **Teams Files** | 97 files (2.2 GB) |
| **SharePoint Sites** | 10+ accessible |

---

## 🔧 Troubleshooting

### Error: "get_drive_failed"
- Check that the email address is correct
- Verify Microsoft Graph permissions

### Error: "File not found"
- The file ID may be incorrect
- The file may have been deleted or moved

### Error: "search_failed"
- Check your search query syntax
- Ensure the user has files to search

### Download URL Expired
- Download URLs are temporary (1-2 hours)
- Request a new download URL if expired

---

## ✨ Summary

You now have **full read access** to:
- ✅ Rudy@CazarNYC.com's 103 GB of documents
- ✅ All other user OneDrive accounts
- ✅ SharePoint sites and team documents
- ✅ File search across entire organization
- ✅ Download capabilities for all files

**API Base URL:** `https://cazar-main.onrender.com/api/documents/`  
**Authentication:** Handled automatically via Microsoft Graph  
**Rate Limits:** Microsoft Graph API limits apply  

---

**Ready to use!** Test the endpoints and start accessing your documents. 🚀


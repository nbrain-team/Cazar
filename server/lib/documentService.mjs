import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

// Microsoft Graph configuration
const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  },
};

let msalClient = null;
let accessToken = null;
let tokenExpiry = null;

function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
}

async function getAccessToken() {
  try {
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
      return accessToken;
    }

    const client = getMsalClient();
    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    const response = await client.acquireTokenByClientCredential(tokenRequest);
    
    if (response && response.accessToken) {
      accessToken = response.accessToken;
      tokenExpiry = Date.now() + ((response.expiresOn?.getTime() || Date.now() + 3600000) - Date.now() - 300000);
      return accessToken;
    }

    throw new Error('Failed to acquire access token');
  } catch (error) {
    console.error('[Document Service] Auth error:', error.message);
    throw error;
  }
}

function getGraphClient(token) {
  return Client.init({
    authProvider: (done) => {
      done(null, token);
    },
  });
}

/**
 * Get user's OneDrive information
 * @param {string} userEmail - User email address
 */
export async function getUserDrive(userEmail) {
  try {
    const token = await getAccessToken();
    const client = getGraphClient(token);

    const drive = await client.api(`/users/${userEmail}/drive`).get();
    
    return {
      id: drive.id,
      driveType: drive.driveType,
      owner: drive.owner?.user?.displayName,
      quota: drive.quota ? {
        used: drive.quota.used,
        total: drive.quota.total,
        usedGB: (drive.quota.used / 1024 / 1024 / 1024).toFixed(2),
        totalGB: (drive.quota.total / 1024 / 1024 / 1024).toFixed(2),
        percentUsed: ((drive.quota.used / drive.quota.total) * 100).toFixed(1)
      } : null
    };
  } catch (error) {
    console.error('[Document Service] Get drive error:', error.message);
    throw error;
  }
}

/**
 * List files and folders in a directory
 * @param {string} userEmail - User email address
 * @param {string} path - Folder path (default: root)
 * @param {number} limit - Max items to return
 */
export async function listDriveContents(userEmail, path = 'root', limit = 50) {
  try {
    const token = await getAccessToken();
    const client = getGraphClient(token);

    const endpoint = path === 'root' 
      ? `/users/${userEmail}/drive/root/children`
      : `/users/${userEmail}/drive/items/${path}/children`;

    const result = await client.api(endpoint).top(limit).get();

    return {
      items: (result.value || []).map(item => ({
        id: item.id,
        name: item.name,
        type: item.folder ? 'folder' : 'file',
        size: item.size,
        sizeKB: item.size ? (item.size / 1024).toFixed(1) : null,
        modified: item.lastModifiedDateTime,
        modifiedBy: item.lastModifiedBy?.user?.displayName,
        webUrl: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl'],
        childCount: item.folder?.childCount,
        path: item.parentReference?.path,
        mimeType: item.file?.mimeType
      })),
      count: result.value?.length || 0,
      path: path
    };
  } catch (error) {
    console.error('[Document Service] List contents error:', error.message);
    throw error;
  }
}

/**
 * Search for files and folders
 * @param {string} userEmail - User email address
 * @param {string} query - Search query
 * @param {number} limit - Max results to return
 */
export async function searchDriveContents(userEmail, query, limit = 20) {
  try {
    const token = await getAccessToken();
    const client = getGraphClient(token);

    const result = await client
      .api(`/users/${userEmail}/drive/root/search(q='${query}')`)
      .top(limit)
      .get();

    return {
      items: (result.value || []).map(item => ({
        id: item.id,
        name: item.name,
        type: item.folder ? 'folder' : 'file',
        size: item.size,
        sizeKB: item.size ? (item.size / 1024).toFixed(1) : null,
        modified: item.lastModifiedDateTime,
        modifiedBy: item.lastModifiedBy?.user?.displayName,
        webUrl: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl'],
        path: item.parentReference?.path,
        mimeType: item.file?.mimeType
      })),
      query: query,
      count: result.value?.length || 0
    };
  } catch (error) {
    console.error('[Document Service] Search error:', error.message);
    throw error;
  }
}

/**
 * Get file metadata
 * @param {string} userEmail - User email address
 * @param {string} itemId - File or folder ID
 */
export async function getFileMetadata(userEmail, itemId) {
  try {
    const token = await getAccessToken();
    const client = getGraphClient(token);

    const item = await client.api(`/users/${userEmail}/drive/items/${itemId}`).get();

    return {
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      size: item.size,
      sizeKB: item.size ? (item.size / 1024).toFixed(1) : null,
      sizeMB: item.size ? (item.size / 1024 / 1024).toFixed(2) : null,
      created: item.createdDateTime,
      modified: item.lastModifiedDateTime,
      createdBy: item.createdBy?.user?.displayName,
      modifiedBy: item.lastModifiedBy?.user?.displayName,
      webUrl: item.webUrl,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      path: item.parentReference?.path,
      mimeType: item.file?.mimeType,
      childCount: item.folder?.childCount
    };
  } catch (error) {
    console.error('[Document Service] Get metadata error:', error.message);
    throw error;
  }
}

/**
 * Get download URL for a file
 * @param {string} userEmail - User email address
 * @param {string} itemId - File ID
 */
export async function getFileDownloadUrl(userEmail, itemId) {
  try {
    const token = await getAccessToken();
    const client = getGraphClient(token);

    const item = await client.api(`/users/${userEmail}/drive/items/${itemId}`).get();

    if (item.folder) {
      throw new Error('Cannot download folders - only files');
    }

    return {
      name: item.name,
      size: item.size,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      webUrl: item.webUrl,
      mimeType: item.file?.mimeType
    };
  } catch (error) {
    console.error('[Document Service] Get download URL error:', error.message);
    throw error;
  }
}

/**
 * List all SharePoint sites
 * @param {number} limit - Max sites to return
 */
export async function listSharePointSites(limit = 20) {
  try {
    const token = await getAccessToken();
    const client = getGraphClient(token);

    const result = await client.api('/sites?search=*').top(limit).get();

    return {
      sites: (result.value || []).map(site => ({
        id: site.id,
        name: site.displayName || site.name,
        description: site.description,
        webUrl: site.webUrl,
        created: site.createdDateTime
      })),
      count: result.value?.length || 0
    };
  } catch (error) {
    console.error('[Document Service] List SharePoint sites error:', error.message);
    throw error;
  }
}

/**
 * Get specific folders by name pattern
 * @param {string} userEmail - User email address
 * @param {Array<string>} folderNames - Array of folder names to search for
 */
export async function getFoldersByName(userEmail, folderNames) {
  try {
    const results = {};
    
    for (const folderName of folderNames) {
      const searchResult = await searchDriveContents(userEmail, folderName, 10);
      results[folderName] = searchResult.items.filter(item => item.type === 'folder');
    }
    
    return results;
  } catch (error) {
    console.error('[Document Service] Get folders error:', error.message);
    throw error;
  }
}


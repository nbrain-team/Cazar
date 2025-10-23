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

// Initialize MSAL client
function getMsalClient() {
  if (!msalClient) {
    msalClient = new ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
}

// Get access token
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
    console.error('Microsoft Graph auth error:', error);
    throw error;
  }
}

// Get Graph client
async function getGraphClient() {
  const token = await getAccessToken();
  
  return Client.init({
    authProvider: (done) => {
      done(null, token);
    },
  });
}

/**
 * Fetch all users with mailboxes
 */
export async function getMailboxUsers() {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api('/users')
      .select('id,displayName,mail,userPrincipalName')
      .filter("assignedLicenses/any(x:x/skuId ne null)")
      .top(999)
      .get();
    
    return response.value || [];
  } catch (error) {
    console.error('Error fetching mailbox users:', error);
    return [];
  }
}

/**
 * Fetch emails from a specific mailbox
 * @param {string} userId - User ID or email address
 * @param {Object} options - Query options
 */
export async function fetchUserEmails(userId, options = {}) {
  try {
    const {
      top = 50,
      skip = 0,
      filter = null,
      orderby = 'receivedDateTime DESC',
      select = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,body,hasAttachments,conversationId,parentFolderId,isRead,importance,categories'
    } = options;

    const client = await getGraphClient();
    
    let request = client
      .api(`/users/${userId}/messages`)
      .select(select)
      .orderby(orderby)
      .top(top)
      .skip(skip);
    
    if (filter) {
      request = request.filter(filter);
    }
    
    const response = await request.get();
    return response.value || [];
    
  } catch (error) {
    console.error(`Error fetching emails for user ${userId}:`, error);
    return [];
  }
}

/**
 * Fetch emails from a specific shared mailbox or folder
 * @param {string} mailboxEmail - Shared mailbox email
 * @param {Object} options - Query options
 */
export async function fetchSharedMailboxEmails(mailboxEmail, options = {}) {
  try {
    const {
      top = 50,
      filter = null,
      since = null
    } = options;

    const client = await getGraphClient();
    
    // Build filter
    let filterQuery = '';
    if (since) {
      const sinceDate = new Date(since).toISOString();
      filterQuery = `receivedDateTime ge ${sinceDate}`;
    }
    if (filter) {
      filterQuery = filterQuery ? `${filterQuery} and ${filter}` : filter;
    }
    
    let request = client
      .api(`/users/${mailboxEmail}/messages`)
      .select('id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,body,hasAttachments,conversationId,isRead,importance')
      .orderby('receivedDateTime DESC')
      .top(top);
    
    if (filterQuery) {
      request = request.filter(filterQuery);
    }
    
    const response = await request.get();
    return response.value || [];
    
  } catch (error) {
    console.error(`Error fetching shared mailbox emails for ${mailboxEmail}:`, error);
    return [];
  }
}

/**
 * Fetch recent emails from all accessible mailboxes
 * @param {Object} options - Query options
 */
export async function fetchAllRecentEmails(options = {}) {
  try {
    const {
      hoursBack = 720, // 30 days default
      maxPerMailbox = 500
    } = options;

    console.log(`[Email Fetch] Fetching emails from last ${hoursBack} hours...`);
    
    const users = await getMailboxUsers();
    console.log(`[Email Fetch] Found ${users.length} mailbox users`);
    
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    
    const allEmails = [];
    
    for (const user of users) {
      try {
        const emails = await fetchUserEmails(user.id, {
          top: maxPerMailbox,
          filter: `receivedDateTime ge ${since}`,
          orderby: 'receivedDateTime DESC'
        });
        
        console.log(`[Email Fetch] User ${user.displayName}: ${emails.length} emails`);
        
        // Add user context to each email
        emails.forEach(email => {
          email.mailboxOwner = user.displayName;
          email.mailboxEmail = user.mail || user.userPrincipalName;
        });
        
        allEmails.push(...emails);
      } catch (error) {
        console.error(`[Email Fetch] Error for user ${user.displayName}:`, error.message);
      }
    }
    
    console.log(`[Email Fetch] Total emails fetched: ${allEmails.length}`);
    return allEmails;
    
  } catch (error) {
    console.error('[Email Fetch] Error fetching all emails:', error);
    return [];
  }
}

/**
 * Fetch emails for a specific date range
 */
export async function fetchEmailsByDateRange(startDate, endDate, options = {}) {
  try {
    const {
      maxPerMailbox = 500
    } = options;

    const users = await getMailboxUsers();
    const allEmails = [];
    
    const startISO = new Date(startDate).toISOString();
    const endISO = new Date(endDate).toISOString();
    
    for (const user of users) {
      const emails = await fetchUserEmails(user.id, {
        top: maxPerMailbox,
        filter: `receivedDateTime ge ${startISO} and receivedDateTime le ${endISO}`,
        orderby: 'receivedDateTime DESC'
      });
      
      emails.forEach(email => {
        email.mailboxOwner = user.displayName;
        email.mailboxEmail = user.mail || user.userPrincipalName;
      });
      
      allEmails.push(...emails);
    }
    
    return allEmails;
    
  } catch (error) {
    console.error('Error fetching emails by date range:', error);
    return [];
  }
}

/**
 * Fetch email attachments
 * @param {string} userId - User ID
 * @param {string} messageId - Message ID
 */
export async function fetchEmailAttachments(userId, messageId) {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api(`/users/${userId}/messages/${messageId}/attachments`)
      .get();
    
    return response.value || [];
    
  } catch (error) {
    console.error('Error fetching attachments:', error);
    return [];
  }
}

/**
 * Get email thread/conversation
 * @param {string} userId - User ID
 * @param {string} conversationId - Conversation ID
 */
export async function fetchEmailThread(userId, conversationId) {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api(`/users/${userId}/messages`)
      .filter(`conversationId eq '${conversationId}'`)
      .orderby('receivedDateTime ASC')
      .select('id,subject,from,receivedDateTime,bodyPreview,body')
      .get();
    
    return response.value || [];
    
  } catch (error) {
    console.error('Error fetching email thread:', error);
    return [];
  }
}

/**
 * Search emails across all mailboxes
 * @param {string} query - Search query
 */
export async function searchEmails(query) {
  try {
    const users = await getMailboxUsers();
    const allResults = [];
    
    for (const user of users) {
      try {
        const client = await getGraphClient();
        
        const response = await client
          .api(`/users/${user.id}/messages`)
          .filter(`contains(subject,'${query}') or contains(bodyPreview,'${query}')`)
          .select('id,subject,from,receivedDateTime,bodyPreview')
          .top(20)
          .get();
        
        const emails = response.value || [];
        emails.forEach(email => {
          email.mailboxOwner = user.displayName;
          email.mailboxEmail = user.mail || user.userPrincipalName;
        });
        
        allResults.push(...emails);
      } catch (error) {
        console.error(`Search error for user ${user.displayName}:`, error.message);
      }
    }
    
    return allResults;
    
  } catch (error) {
    console.error('Email search error:', error);
    return [];
  }
}

export default {
  getMailboxUsers,
  fetchUserEmails,
  fetchSharedMailboxEmails,
  fetchAllRecentEmails,
  fetchEmailsByDateRange,
  fetchEmailAttachments,
  fetchEmailThread,
  searchEmails
};


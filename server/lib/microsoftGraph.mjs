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

// Get access token using client credentials flow
async function getAccessToken() {
  try {
    // Return cached token if still valid
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
      // Set expiry to 5 minutes before actual expiry for safety
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

// Search emails
export async function searchEmails(query, maxResults = 5) {
  try {
    const client = await getGraphClient();
    
    // Search across all users (requires admin consent)
    const response = await client
      .api('/users')
      .top(10)
      .get();
    
    const users = response.value || [];
    const allResults = [];
    
    // Search each user's mailbox
    for (const user of users.slice(0, 3)) { // Limit to first 3 users for performance
      try {
        const messages = await client
          .api(`/users/${user.id}/messages`)
          .filter(`contains(subject,'${query}') or contains(bodyPreview,'${query}')`)
          .top(maxResults)
          .select('subject,from,receivedDateTime,bodyPreview')
          .orderby('receivedDateTime DESC')
          .get();
        
        if (messages.value) {
          allResults.push(...messages.value.map(msg => ({
            type: 'email',
            title: msg.subject,
            from: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address,
            date: msg.receivedDateTime,
            snippet: msg.bodyPreview?.substring(0, 200),
            user: user.displayName,
          })));
        }
      } catch (err) {
        console.error(`Error searching user ${user.displayName}:`, err.message);
      }
    }
    
    return allResults.slice(0, maxResults);
  } catch (error) {
    console.error('Email search error:', error);
    return [];
  }
}

// Search calendar events
export async function searchCalendarEvents(query, daysAhead = 7) {
  try {
    const client = await getGraphClient();
    
    const startDateTime = new Date();
    const endDateTime = new Date();
    endDateTime.setDate(endDateTime.getDate() + daysAhead);
    
    const response = await client
      .api('/users')
      .top(10)
      .get();
    
    const users = response.value || [];
    const allEvents = [];
    
    for (const user of users.slice(0, 3)) {
      try {
        const events = await client
          .api(`/users/${user.id}/calendar/events`)
          .filter(`(contains(subject,'${query}') or contains(bodyPreview,'${query}')) and start/dateTime ge '${startDateTime.toISOString()}' and end/dateTime le '${endDateTime.toISOString()}'`)
          .top(5)
          .select('subject,start,end,location,organizer,bodyPreview')
          .orderby('start/dateTime ASC')
          .get();
        
        if (events.value) {
          allEvents.push(...events.value.map(evt => ({
            type: 'calendar',
            title: evt.subject,
            start: evt.start?.dateTime,
            end: evt.end?.dateTime,
            location: evt.location?.displayName,
            organizer: evt.organizer?.emailAddress?.name,
            snippet: evt.bodyPreview?.substring(0, 200),
            user: user.displayName,
          })));
        }
      } catch (err) {
        console.error(`Error searching calendar for ${user.displayName}:`, err.message);
      }
    }
    
    return allEvents.slice(0, 5);
  } catch (error) {
    console.error('Calendar search error:', error);
    return [];
  }
}

// Search Teams messages
export async function searchTeamsMessages(query, maxResults = 5) {
  try {
    const client = await getGraphClient();
    
    // Get all teams
    const teams = await client
      .api('/teams')
      .top(10)
      .get();
    
    const allMessages = [];
    
    for (const team of (teams.value || []).slice(0, 3)) {
      try {
        // Get channels in team
        const channels = await client
          .api(`/teams/${team.id}/channels`)
          .get();
        
        for (const channel of (channels.value || []).slice(0, 3)) {
          try {
            // Get messages in channel
            const messages = await client
              .api(`/teams/${team.id}/channels/${channel.id}/messages`)
              .top(20)
              .get();
            
            // Filter messages by query
            const filtered = (messages.value || [])
              .filter(msg => 
                msg.body?.content?.toLowerCase().includes(query.toLowerCase()) ||
                msg.subject?.toLowerCase().includes(query.toLowerCase())
              )
              .slice(0, maxResults);
            
            allMessages.push(...filtered.map(msg => ({
              type: 'teams',
              title: msg.subject || 'Teams message',
              team: team.displayName,
              channel: channel.displayName,
              from: msg.from?.user?.displayName,
              date: msg.createdDateTime,
              snippet: msg.body?.content?.substring(0, 200).replace(/<[^>]*>/g, ''),
            })));
          } catch (err) {
            console.error(`Error searching channel ${channel.displayName}:`, err.message);
          }
        }
      } catch (err) {
        console.error(`Error searching team ${team.displayName}:`, err.message);
      }
    }
    
    return allMessages.slice(0, maxResults);
  } catch (error) {
    console.error('Teams search error:', error);
    return [];
  }
}

// Search OneDrive/SharePoint files
export async function searchFiles(query, maxResults = 5) {
  try {
    const client = await getGraphClient();
    
    // Search across all drives
    const response = await client
      .api('/drives')
      .top(5)
      .get();
    
    const drives = response.value || [];
    const allFiles = [];
    
    for (const drive of drives) {
      try {
        const searchResults = await client
          .api(`/drives/${drive.id}/root/search(q='${query}')`)
          .top(maxResults)
          .get();
        
        if (searchResults.value) {
          allFiles.push(...searchResults.value.map(file => ({
            type: 'file',
            title: file.name,
            url: file.webUrl,
            size: file.size,
            modified: file.lastModifiedDateTime,
            modifiedBy: file.lastModifiedBy?.user?.displayName,
            snippet: `${file.name} - ${(file.size / 1024).toFixed(2)} KB`,
          })));
        }
      } catch (err) {
        console.error(`Error searching drive ${drive.name}:`, err.message);
      }
    }
    
    return allFiles.slice(0, maxResults);
  } catch (error) {
    console.error('File search error:', error);
    return [];
  }
}

// Main search function that combines all sources
export async function searchMicrosoft365(query) {
  try {
    const [emails, events, messages, files] = await Promise.allSettled([
      searchEmails(query),
      searchCalendarEvents(query),
      searchTeamsMessages(query),
      searchFiles(query),
    ]);
    
    const results = [];
    
    if (emails.status === 'fulfilled' && emails.value.length > 0) {
      results.push(...emails.value);
    }
    if (events.status === 'fulfilled' && events.value.length > 0) {
      results.push(...events.value);
    }
    if (messages.status === 'fulfilled' && messages.value.length > 0) {
      results.push(...messages.value);
    }
    if (files.status === 'fulfilled' && files.value.length > 0) {
      results.push(...files.value);
    }
    
    return results;
  } catch (error) {
    console.error('Microsoft 365 search error:', error);
    throw error;
  }
}


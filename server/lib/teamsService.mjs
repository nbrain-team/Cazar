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
      console.log('[Microsoft Teams] Using cached access token');
      return accessToken;
    }

    console.log('[Microsoft Teams] Acquiring new access token...');
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

/**
 * List all teams
 */
export async function listTeams() {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api('/teams')
      .select('id,displayName,description')
      .get();
    
    return response.value || [];
  } catch (error) {
    console.error('Error listing teams:', error);
    throw error;
  }
}

/**
 * List channels in a team
 */
export async function listChannels(teamId) {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api(`/teams/${teamId}/channels`)
      .select('id,displayName,description')
      .get();
    
    return response.value || [];
  } catch (error) {
    console.error('Error listing channels:', error);
    throw error;
  }
}

/**
 * List team members
 */
export async function listTeamMembers(teamId) {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api(`/teams/${teamId}/members`)
      .select('id,displayName,email')
      .get();
    
    return (response.value || []).map(member => ({
      id: member.id,
      name: member.displayName,
      email: member.email || ''
    }));
  } catch (error) {
    console.error('Error listing team members:', error);
    throw error;
  }
}

/**
 * List messages in a channel (threads)
 */
export async function listChannelMessages(teamId, channelId, limit = 50) {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .top(limit)
      .select('id,subject,body,from,createdDateTime,replyToId')
      .orderby('createdDateTime DESC')
      .get();
    
    return (response.value || []).map(msg => ({
      id: msg.id,
      subject: msg.subject || '',
      content: msg.body?.content || '',
      from: msg.from?.user?.displayName || 'Unknown',
      createdDateTime: msg.createdDateTime,
      replyToId: msg.replyToId
    }));
  } catch (error) {
    console.error('Error listing channel messages:', error);
    throw error;
  }
}

/**
 * Get replies to a message/thread
 */
export async function getMessageReplies(teamId, channelId, messageId) {
  try {
    const client = await getGraphClient();
    
    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
      .select('id,body,from,createdDateTime')
      .get();
    
    return (response.value || []).map(reply => ({
      id: reply.id,
      content: reply.body?.content || '',
      from: reply.from?.user?.displayName || 'Unknown',
      createdDateTime: reply.createdDateTime
    }));
  } catch (error) {
    console.error('Error getting message replies:', error);
    throw error;
  }
}

/**
 * Create a new message/thread in a channel
 */
export async function createChannelMessage(teamId, channelId, { subject, content, mentionMember }) {
  try {
    const client = await getGraphClient();
    
    let messageBody = content;
    const mentions = [];

    // If mentioning a member, add mention syntax
    if (mentionMember) {
      // Get team members to find the user
      const members = await listTeamMembers(teamId);
      const member = members.find(m => m.name === mentionMember);
      
      if (member) {
        // Add mention to content
        messageBody = `<at id="0">${member.name}</at> ${content}`;
        
        // Add mention object
        mentions.push({
          id: 0,
          mentionText: member.name,
          mentioned: {
            user: {
              id: member.id,
              displayName: member.name,
              userIdentityType: 'aadUser'
            }
          }
        });
      }
    }

    const message = {
      subject: subject,
      body: {
        contentType: 'html',
        content: messageBody
      }
    };

    if (mentions.length > 0) {
      message.mentions = mentions;
    }

    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .post(message);
    
    return {
      id: response.id,
      subject: response.subject,
      content: response.body?.content || ''
    };
  } catch (error) {
    console.error('Error creating channel message:', error);
    throw error;
  }
}

/**
 * Reply to a message/thread
 */
export async function replyToMessage(teamId, channelId, messageId, { content, mentionMember }) {
  try {
    const client = await getGraphClient();
    
    let messageBody = content;
    const mentions = [];

    // If mentioning a member, add mention syntax
    if (mentionMember) {
      // Get team members to find the user
      const members = await listTeamMembers(teamId);
      const member = members.find(m => m.name === mentionMember);
      
      if (member) {
        // Add mention to content
        messageBody = `<at id="0">${member.name}</at> ${content}`;
        
        // Add mention object
        mentions.push({
          id: 0,
          mentionText: member.name,
          mentioned: {
            user: {
              id: member.id,
              displayName: member.name,
              userIdentityType: 'aadUser'
            }
          }
        });
      }
    }

    const reply = {
      body: {
        contentType: 'html',
        content: messageBody
      }
    };

    if (mentions.length > 0) {
      reply.mentions = mentions;
    }

    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
      .post(reply);
    
    return {
      id: response.id,
      content: response.body?.content || ''
    };
  } catch (error) {
    console.error('Error replying to message:', error);
    throw error;
  }
}

/**
 * Get member by name
 */
export async function getMemberByName(teamId, name) {
  try {
    const members = await listTeamMembers(teamId);
    return members.find(m => m.name === name) || null;
  } catch (error) {
    console.error('Error getting member by name:', error);
    throw error;
  }
}


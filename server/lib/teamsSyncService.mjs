/**
 * Teams Sync Service
 * Syncs Teams messages from Microsoft Graph to PostgreSQL with Claude analysis
 */

import { getGraphClient } from './microsoftGraph.mjs';
import { analyzeTeamsMessage } from './claudeTeamsService.mjs';
import pg from 'pg';

const { Pool } = pg;

/**
 * Sync Teams messages for all teams
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} options - Sync options
 * @returns {Object} - Sync statistics
 */
export async function syncTeamsMessages(pool, options = {}) {
  const {
    daysBack = 30,
    maxPerChannel = 100,
    analyzeWithClaude = true
  } = options;

  console.log('[Teams Sync] Starting Teams messages sync...');
  console.log(`[Teams Sync] Options: ${daysBack} days back, max ${maxPerChannel} per channel`);

  const stats = {
    teamsProcessed: 0,
    channelsProcessed: 0,
    messagesProcessed: 0,
    messagesAdded: 0,
    messagesUpdated: 0,
    errors: 0,
    startTime: new Date()
  };

  try {
    // Get all teams
    const teams = await getJoinedTeams();
    console.log(`[Teams Sync] Found ${teams.length} teams to process`);

    // Calculate date range
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    // Process each team
    for (const team of teams) {
      try {
        console.log(`[Teams Sync] Processing team: ${team.displayName}`);

        // Get channels for this team
        const channels = await getTeamChannels(team.id);
        console.log(`[Teams Sync] Found ${channels.length} channels in ${team.displayName}`);

        // Process each channel
        for (const channel of channels) {
          try {
            console.log(`[Teams Sync] Syncing channel: ${channel.displayName}`);

            // Fetch messages from channel
            const messages = await fetchChannelMessages(team.id, channel.id, sinceDate, maxPerChannel);
            console.log(`[Teams Sync] Fetched ${messages.length} messages from ${channel.displayName}`);

            // Process each message
            for (const message of messages) {
              try {
                stats.messagesProcessed++;

                // Analyze with Claude if enabled
                let analysis = {};
                if (analyzeWithClaude && message.body?.content) {
                  try {
                    analysis = await analyzeTeamsMessage(message);
                  } catch (analysisError) {
                    console.error(`[Teams Sync] Analysis error for message ${message.id}:`, analysisError.message);
                    // Continue with empty analysis
                  }
                }

                // Store in PostgreSQL
                const stored = await storeTeamsMessage(pool, message, team, channel, analysis);
                if (stored.isNew) {
                  stats.messagesAdded++;
                } else {
                  stats.messagesUpdated++;
                }

              } catch (messageError) {
                console.error(`[Teams Sync] Error processing message ${message.id}:`, messageError.message);
                stats.errors++;
              }
            }

            stats.channelsProcessed++;

          } catch (channelError) {
            console.error(`[Teams Sync] Error processing channel ${channel.displayName}:`, channelError.message);
            stats.errors++;
          }
        }

        stats.teamsProcessed++;

      } catch (teamError) {
        console.error(`[Teams Sync] Error processing team ${team.displayName}:`, teamError.message);
        stats.errors++;
      }
    }

    stats.endTime = new Date();
    stats.duration = (stats.endTime - stats.startTime) / 1000;

    console.log('[Teams Sync] Sync complete!');
    console.log(`[Teams Sync] Stats:`, stats);

    return stats;

  } catch (error) {
    console.error('[Teams Sync] Fatal error:', error);
    throw error;
  }
}

/**
 * Get all joined teams
 * @returns {Array} - Teams
 */
async function getJoinedTeams() {
  try {
    const client = await getGraphClient();

    const response = await client
      .api('/me/joinedTeams')
      .select('id,displayName,description')
      .get();

    return response.value || [];

  } catch (error) {
    if (error.statusCode === 403 || error.message.includes('Access is denied')) {
      console.error('[Teams Sync] Access denied - missing Team.ReadBasic.All permission');
      return [];
    }
    throw error;
  }
}

/**
 * Get channels for a team
 * @param {string} teamId - Team ID
 * @returns {Array} - Channels
 */
async function getTeamChannels(teamId) {
  try {
    const client = await getGraphClient();

    const response = await client
      .api(`/teams/${teamId}/channels`)
      .select('id,displayName,description')
      .get();

    return response.value || [];

  } catch (error) {
    if (error.statusCode === 403) {
      console.error(`[Teams Sync] Access denied for team ${teamId} channels`);
      return [];
    }
    throw error;
  }
}

/**
 * Fetch messages from a channel
 * @param {string} teamId - Team ID
 * @param {string} channelId - Channel ID
 * @param {Date} sinceDate - Fetch messages since this date
 * @param {number} maxMessages - Max messages to fetch
 * @returns {Array} - Messages
 */
async function fetchChannelMessages(teamId, channelId, sinceDate, maxMessages = 100) {
  try {
    const client = await getGraphClient();

    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .select('id,createdDateTime,lastModifiedDateTime,importance,messageType,from,body,mentions,attachments,reactions,replyToId')
      .top(maxMessages)
      .orderby('createdDateTime desc')
      .get();

    const messages = response.value || [];

    // Filter by date
    return messages.filter(msg => new Date(msg.createdDateTime) >= sinceDate);

  } catch (error) {
    if (error.statusCode === 403) {
      console.error(`[Teams Sync] Access denied for team ${teamId} channel ${channelId} messages`);
      return [];
    }
    throw error;
  }
}

/**
 * Store Teams message in PostgreSQL
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} message - Teams message
 * @param {Object} team - Team object
 * @param {Object} channel - Channel object
 * @param {Object} analysis - Claude analysis results
 * @returns {Object} - Storage result
 */
async function storeTeamsMessage(pool, message, team, channel, analysis = {}) {
  try {
    const query = `
      INSERT INTO teams_messages (
        message_id,
        team_id,
        team_name,
        channel_id,
        channel_name,
        from_user_id,
        from_name,
        from_email,
        content,
        content_type,
        created_date,
        last_modified,
        message_type,
        importance,
        mentions,
        attachments,
        reactions,
        reply_to_id,
        category,
        sentiment,
        priority,
        key_topics,
        action_items,
        people_mentioned,
        urgency_level,
        synced_at,
        analyzed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27
      )
      ON CONFLICT (message_id) DO UPDATE SET
        content = EXCLUDED.content,
        last_modified = EXCLUDED.last_modified,
        mentions = EXCLUDED.mentions,
        attachments = EXCLUDED.attachments,
        reactions = EXCLUDED.reactions,
        category = EXCLUDED.category,
        sentiment = EXCLUDED.sentiment,
        priority = EXCLUDED.priority,
        key_topics = EXCLUDED.key_topics,
        action_items = EXCLUDED.action_items,
        people_mentioned = EXCLUDED.people_mentioned,
        urgency_level = EXCLUDED.urgency_level,
        synced_at = EXCLUDED.synced_at,
        analyzed_at = EXCLUDED.analyzed_at
      RETURNING (xmax = 0) AS is_new
    `;

    const values = [
      message.id,
      team.id,
      team.displayName,
      channel.id,
      channel.displayName,
      message.from?.user?.id,
      message.from?.user?.displayName,
      message.from?.user?.userPrincipalName,
      message.body?.content?.substring(0, 10000), // Limit content size
      message.body?.contentType,
      new Date(message.createdDateTime),
      message.lastModifiedDateTime ? new Date(message.lastModifiedDateTime) : null,
      message.messageType,
      message.importance,
      JSON.stringify(message.mentions || []),
      JSON.stringify(message.attachments || []),
      JSON.stringify(message.reactions || []),
      message.replyToId,
      analysis.category,
      analysis.sentiment,
      analysis.priority,
      JSON.stringify(analysis.key_topics || []),
      JSON.stringify(analysis.action_items || []),
      JSON.stringify(analysis.people_mentioned || []),
      analysis.urgency_level,
      new Date(),
      analysis.analyzed_at ? new Date(analysis.analyzed_at) : null
    ];

    const result = await pool.query(query, values);
    return { isNew: result.rows[0].is_new };

  } catch (error) {
    console.error('[Teams Sync] Database error:', error.message);
    throw error;
  }
}

export default {
  syncTeamsMessages
};


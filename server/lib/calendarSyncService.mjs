/**
 * Calendar Sync Service
 * Syncs calendar events from Microsoft Graph to PostgreSQL with Claude analysis
 */

import { getMailboxUsers } from './emailFetchService.mjs';
import { getGraphClient } from './microsoftGraph.mjs';
import { analyzeCalendarEvent } from './claudeCalendarService.mjs';
import pg from 'pg';

const { Pool } = pg;

/**
 * Sync calendar events for all users
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} options - Sync options
 * @returns {Object} - Sync statistics
 */
export async function syncCalendarEvents(pool, options = {}) {
  const {
    daysBack = 30,
    daysForward = 90,
    maxPerUser = 200,
    analyzeWithClaude = true
  } = options;

  console.log('[Calendar Sync] Starting calendar sync...');
  console.log(`[Calendar Sync] Options: ${daysBack} days back, ${daysForward} days forward, max ${maxPerUser} per user`);

  const stats = {
    usersProcessed: 0,
    eventsProcessed: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    errors: 0,
    startTime: new Date()
  };

  try {
    // Get all mailbox users
    const users = await getMailboxUsers();
    console.log(`[Calendar Sync] Found ${users.length} users to process`);

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysForward);

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    // Process each user's calendar
    for (const user of users) {
      try {
        console.log(`[Calendar Sync] Syncing calendar for ${user.displayName} (${user.mail || user.userPrincipalName})`);
        
        const userEvents = await fetchUserCalendar(user.id, startISO, endISO, maxPerUser);
        console.log(`[Calendar Sync] Fetched ${userEvents.length} events for ${user.displayName}`);

        // Process each event
        for (const event of userEvents) {
          try {
            stats.eventsProcessed++;

            // Analyze with Claude if enabled
            let analysis = {};
            if (analyzeWithClaude) {
              try {
                analysis = await analyzeCalendarEvent(event);
              } catch (analysisError) {
                console.error(`[Calendar Sync] Analysis error for event ${event.id}:`, analysisError.message);
                // Continue with empty analysis
              }
            }

            // Store in PostgreSQL
            const stored = await storeCalendarEvent(pool, event, user, analysis);
            if (stored.isNew) {
              stats.eventsAdded++;
            } else {
              stats.eventsUpdated++;
            }

          } catch (eventError) {
            console.error(`[Calendar Sync] Error processing event ${event.id}:`, eventError.message);
            stats.errors++;
          }
        }

        stats.usersProcessed++;

      } catch (userError) {
        console.error(`[Calendar Sync] Error processing user ${user.displayName}:`, userError.message);
        stats.errors++;
      }
    }

    stats.endTime = new Date();
    stats.duration = (stats.endTime - stats.startTime) / 1000;

    console.log('[Calendar Sync] Sync complete!');
    console.log(`[Calendar Sync] Stats:`, stats);

    return stats;

  } catch (error) {
    console.error('[Calendar Sync] Fatal error:', error);
    throw error;
  }
}

/**
 * Fetch calendar events for a specific user
 * @param {string} userId - User ID
 * @param {string} startDate - Start date ISO string
 * @param {string} endDate - End date ISO string
 * @param {number} maxResults - Max results to fetch
 * @returns {Array} - Calendar events
 */
async function fetchUserCalendar(userId, startDate, endDate, maxResults = 200) {
  try {
    const client = await getGraphClient();

    const response = await client
      .api(`/users/${userId}/calendar/events`)
      .filter(`start/dateTime ge '${startDate}' and start/dateTime le '${endDate}'`)
      .select('id,subject,bodyPreview,body,organizer,attendees,start,end,location,isAllDay,isCancelled,isOnlineMeeting,onlineMeetingUrl,importance,sensitivity,showAs,createdDateTime,lastModifiedDateTime')
      .top(maxResults)
      .orderby('start/dateTime')
      .get();

    return response.value || [];

  } catch (error) {
    if (error.statusCode === 403 || error.message.includes('Access is denied')) {
      console.error(`[Calendar Sync] Access denied for user ${userId} - missing Calendar.Read permission`);
      return [];
    }
    throw error;
  }
}

/**
 * Store calendar event in PostgreSQL
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {Object} event - Calendar event
 * @param {Object} user - User object
 * @param {Object} analysis - Claude analysis results
 * @returns {Object} - Storage result
 */
async function storeCalendarEvent(pool, event, user, analysis = {}) {
  try {
    const query = `
      INSERT INTO calendar_events (
        event_id,
        subject,
        organizer_email,
        organizer_name,
        attendees,
        start_time,
        end_time,
        location,
        body_preview,
        body_content,
        is_all_day,
        is_cancelled,
        is_online_meeting,
        online_meeting_url,
        importance,
        sensitivity,
        show_as,
        category,
        priority,
        meeting_type,
        key_topics,
        action_items,
        participants_count,
        synced_at,
        analyzed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25
      )
      ON CONFLICT (event_id) DO UPDATE SET
        subject = EXCLUDED.subject,
        organizer_email = EXCLUDED.organizer_email,
        organizer_name = EXCLUDED.organizer_name,
        attendees = EXCLUDED.attendees,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        location = EXCLUDED.location,
        body_preview = EXCLUDED.body_preview,
        body_content = EXCLUDED.body_content,
        is_all_day = EXCLUDED.is_all_day,
        is_cancelled = EXCLUDED.is_cancelled,
        is_online_meeting = EXCLUDED.is_online_meeting,
        online_meeting_url = EXCLUDED.online_meeting_url,
        importance = EXCLUDED.importance,
        sensitivity = EXCLUDED.sensitivity,
        show_as = EXCLUDED.show_as,
        category = EXCLUDED.category,
        priority = EXCLUDED.priority,
        meeting_type = EXCLUDED.meeting_type,
        key_topics = EXCLUDED.key_topics,
        action_items = EXCLUDED.action_items,
        participants_count = EXCLUDED.participants_count,
        synced_at = EXCLUDED.synced_at,
        analyzed_at = EXCLUDED.analyzed_at
      RETURNING (xmax = 0) AS is_new
    `;

    const values = [
      event.id,
      event.subject || '(No subject)',
      event.organizer?.emailAddress?.address || user.mail || user.userPrincipalName,
      event.organizer?.emailAddress?.name || user.displayName,
      JSON.stringify(event.attendees || []),
      event.start?.dateTime || event.start,
      event.end?.dateTime || event.end,
      event.location?.displayName || event.location,
      event.bodyPreview,
      event.body?.content?.substring(0, 5000), // Limit body size
      event.isAllDay || false,
      event.isCancelled || false,
      event.isOnlineMeeting || false,
      event.onlineMeetingUrl,
      event.importance,
      event.sensitivity,
      event.showAs,
      analysis.category,
      analysis.priority,
      analysis.meeting_type,
      JSON.stringify(analysis.key_topics || []),
      JSON.stringify(analysis.action_items || []),
      analysis.participants_count,
      new Date(),
      analysis.analyzed_at ? new Date(analysis.analyzed_at) : null
    ];

    const result = await pool.query(query, values);
    return { isNew: result.rows[0].is_new };

  } catch (error) {
    console.error('[Calendar Sync] Database error:', error.message);
    throw error;
  }
}

/**
 * Initialize calendar_events table
 * @param {Pool} pool - PostgreSQL connection pool
 */
export async function initializeCalendarTable(pool) {
  try {
    console.log('[Calendar Sync] Initializing calendar_events table...');
    
    // Read and execute schema file
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.join(__dirname, '../../database/calendar_teams_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    
    console.log('[Calendar Sync] Table initialized successfully');
    return { success: true };

  } catch (error) {
    console.error('[Calendar Sync] Initialization error:', error.message);
    throw error;
  }
}

export default {
  syncCalendarEvents,
  initializeCalendarTable
};


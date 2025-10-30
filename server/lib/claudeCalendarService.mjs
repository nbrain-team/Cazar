/**
 * Claude Calendar Analysis Service
 * Analyzes calendar events using Claude to extract categories, priorities, and insights
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-3-opus-20240229';

/**
 * Analyze a calendar event with Claude
 * @param {Object} event - Calendar event from Microsoft Graph
 * @returns {Object} - Analysis results
 */
export async function analyzeCalendarEvent(event) {
  try {
    const prompt = `Analyze this calendar event and extract key information:

Subject: ${event.subject}
Organizer: ${event.organizer?.emailAddress?.name || 'Unknown'}
Start: ${event.start?.dateTime}
End: ${event.end?.dateTime}
Attendees: ${event.attendees?.map(a => a.emailAddress?.name).join(', ') || 'None'}
Location: ${event.location?.displayName || 'Not specified'}
Body: ${event.bodyPreview || event.body?.content?.substring(0, 500) || 'No description'}

Extract and return ONLY a JSON object with:
{
  "category": "<Meeting|Review|Planning|Training|Interview|Client Meeting|Team Sync|All Hands|One-on-One|Project Review|etc>",
  "priority": "<high|medium|low>",
  "meeting_type": "<one-on-one|team|all-hands|client|vendor|internal|external>",
  "key_topics": ["topic1", "topic2", ...],
  "action_items": ["action1", "action2", ...],
  "participants_count": <number>
}

Guidelines:
- Priority "high" if: urgent keywords, executive attendees, deadline-related, decision-making
- Priority "medium" if: regular team meetings, planning, reviews
- Priority "low" if: optional, informational, recurring check-ins
- Extract 2-5 key topics maximum
- Extract concrete action items only (not vague statements)`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].text.trim();
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      category: analysis.category || 'Meeting',
      priority: analysis.priority || 'medium',
      meeting_type: analysis.meeting_type || 'team',
      key_topics: analysis.key_topics || [],
      action_items: analysis.action_items || [],
      participants_count: analysis.participants_count || event.attendees?.length || 0,
      analyzed_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('[Calendar Analysis] Error:', error.message);
    // Return default analysis if Claude fails
    return {
      category: 'Meeting',
      priority: 'medium',
      meeting_type: 'team',
      key_topics: [],
      action_items: [],
      participants_count: event.attendees?.length || 0,
      analyzed_at: new Date().toISOString()
    };
  }
}

/**
 * Generate SQL query for calendar events based on natural language
 * @param {string} userQuery - Natural language query
 * @returns {Object} - SQL query and parameters
 */
export async function generateCalendarQuery(userQuery) {
  try {
    const prompt = `Generate a PostgreSQL query for calendar events based on this question:

"${userQuery}"

Database schema:
- Table: calendar_events
- Columns: event_id, subject, organizer_email, organizer_name, attendees (JSONB), start_time, end_time, location, body_preview, is_all_day, is_cancelled, is_online_meeting, importance, category, priority, meeting_type, key_topics (JSONB), action_items (JSONB), participants_count, created_at, synced_at

Return ONLY a JSON object:
{
  "sql": "<PostgreSQL query>",
  "params": [<array of parameters if using $1, $2, etc>],
  "explanation": "<brief explanation of what the query does>"
}

Guidelines:
- Use parameterized queries for dates/values ($1, $2, etc)
- Filter out cancelled meetings unless specifically asked
- Order by start_time by default
- Use ILIKE for case-insensitive text search
- For "this week": start_time >= date_trunc('week', NOW()) AND start_time < date_trunc('week', NOW()) + interval '1 week'
- For "today": start_time >= CURRENT_DATE AND start_time < CURRENT_DATE + interval '1 day'
- For "upcoming": start_time >= NOW() AND is_cancelled = FALSE
- Limit to 50 results max`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1536,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = message.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    return {
      sql: result.sql,
      params: result.params || [],
      explanation: result.explanation || 'Calendar query'
    };

  } catch (error) {
    console.error('[Calendar Query Generation] Error:', error.message);
    throw error;
  }
}

/**
 * Format calendar query results into natural language
 * @param {Array} results - Query results
 * @param {string} originalQuery - Original user query
 * @returns {string} - Formatted response
 */
export async function formatCalendarResults(results, originalQuery) {
  try {
    if (!results || results.length === 0) {
      return `No calendar events found matching: "${originalQuery}"`;
    }

    const prompt = `Format these calendar events into a clear, natural language response for the question: "${originalQuery}"

Events:
${results.map((evt, i) => `
${i + 1}. ${evt.subject}
   Organizer: ${evt.organizer_name}
   Time: ${new Date(evt.start_time).toLocaleString()} - ${new Date(evt.end_time).toLocaleString()}
   Location: ${evt.location || 'Not specified'}
   Type: ${evt.category} (${evt.priority} priority)
   ${evt.key_topics?.length ? `Topics: ${evt.key_topics.join(', ')}` : ''}
   ${evt.action_items?.length ? `Action Items: ${evt.action_items.join('; ')}` : ''}
   Attendees: ${evt.participants_count} people
`).join('\n')}

Create a professional summary that:
1. Starts with a count ("Found X meetings...")
2. Groups by category or time period if relevant
3. Highlights high-priority items
4. Lists action items if present
5. Uses markdown formatting (headers, lists, bold)
6. Is concise but informative`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    return message.content[0].text.trim();

  } catch (error) {
    console.error('[Calendar Formatting] Error:', error.message);
    // Fallback to simple formatting
    return `Found ${results.length} calendar events:\n\n${results.map(evt => 
      `- ${evt.subject} (${new Date(evt.start_time).toLocaleDateString()})`
    ).join('\n')}`;
  }
}

export default {
  analyzeCalendarEvent,
  generateCalendarQuery,
  formatCalendarResults
};


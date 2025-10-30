/**
 * Claude Teams Analysis Service
 * Analyzes Teams messages using Claude to extract categories, sentiment, and insights
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-3-opus-20240229';

/**
 * Analyze a Teams message with Claude
 * @param {Object} message - Teams message from Microsoft Graph
 * @returns {Object} - Analysis results
 */
export async function analyzeTeamsMessage(message) {
  try {
    const prompt = `Analyze this Microsoft Teams message and extract key information:

From: ${message.from?.user?.displayName || 'Unknown'}
Channel: ${message.channelIdentity?.displayName || 'Unknown'}
Content: ${message.body?.content?.substring(0, 1000) || 'No content'}
Created: ${message.createdDateTime}
Importance: ${message.importance || 'normal'}

Extract and return ONLY a JSON object with:
{
  "category": "<Announcement|Question|Update|Decision|Discussion|Request|FYI|Alert|etc>",
  "sentiment": "<positive|neutral|negative>",
  "priority": "<high|medium|low>",
  "urgency_level": "<urgent|normal|low>",
  "key_topics": ["topic1", "topic2", ...],
  "action_items": ["action1", "action2", ...],
  "people_mentioned": ["person1", "person2", ...]
}

Guidelines:
- Priority "high" if: decisions, critical updates, blockers, urgent requests
- Urgency "urgent" if: time-sensitive, requires immediate action, uses urgent language
- Extract 2-4 key topics maximum
- Extract concrete action items only
- Identify people mentioned in the content`;

    const apiMessage = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = apiMessage.content[0].text.trim();
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      category: analysis.category || 'Discussion',
      sentiment: analysis.sentiment || 'neutral',
      priority: analysis.priority || 'medium',
      urgency_level: analysis.urgency_level || 'normal',
      key_topics: analysis.key_topics || [],
      action_items: analysis.action_items || [],
      people_mentioned: analysis.people_mentioned || [],
      analyzed_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('[Teams Analysis] Error:', error.message);
    // Return default analysis if Claude fails
    return {
      category: 'Discussion',
      sentiment: 'neutral',
      priority: 'medium',
      urgency_level: 'normal',
      key_topics: [],
      action_items: [],
      people_mentioned: [],
      analyzed_at: new Date().toISOString()
    };
  }
}

/**
 * Generate SQL query for Teams messages based on natural language
 * @param {string} userQuery - Natural language query
 * @returns {Object} - SQL query and parameters
 */
export async function generateTeamsQuery(userQuery) {
  try {
    const prompt = `Generate a PostgreSQL query for Teams messages based on this question:

"${userQuery}"

Database schema:
- Table: teams_messages
- Columns: message_id, team_id, team_name, channel_id, channel_name, from_user_id, from_name, from_email, content, created_date, message_type, importance, category, sentiment, priority, key_topics (JSONB), action_items (JSONB), people_mentioned (JSONB), urgency_level, created_at, synced_at

Return ONLY a JSON object:
{
  "sql": "<PostgreSQL query>",
  "params": [<array of parameters if using $1, $2, etc>],
  "explanation": "<brief explanation>"
}

Guidelines:
- Use parameterized queries for values ($1, $2, etc)
- Order by created_date DESC by default
- Use ILIKE for case-insensitive text search
- For "recent": created_date >= NOW() - interval '7 days'
- For "this week": created_date >= date_trunc('week', NOW())
- For "today": created_date >= CURRENT_DATE
- Limit to 50 results max`;

    const apiMessage = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1536,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = apiMessage.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);
    
    return {
      sql: result.sql,
      params: result.params || [],
      explanation: result.explanation || 'Teams query'
    };

  } catch (error) {
    console.error('[Teams Query Generation] Error:', error.message);
    throw error;
  }
}

/**
 * Format Teams query results into natural language
 * @param {Array} results - Query results
 * @param {string} originalQuery - Original user query
 * @returns {string} - Formatted response
 */
export async function formatTeamsResults(results, originalQuery) {
  try {
    if (!results || results.length === 0) {
      return `No Teams messages found matching: "${originalQuery}"`;
    }

    const prompt = `Format these Teams messages into a clear, natural language response for the question: "${originalQuery}"

Messages:
${results.map((msg, i) => `
${i + 1}. From: ${msg.from_name} in ${msg.team_name}/${msg.channel_name}
   Date: ${new Date(msg.created_date).toLocaleString()}
   Type: ${msg.category} (${msg.priority} priority, ${msg.urgency_level} urgency)
   Content: ${msg.content?.substring(0, 200)}...
   ${msg.key_topics?.length ? `Topics: ${msg.key_topics.join(', ')}` : ''}
   ${msg.action_items?.length ? `Action Items: ${msg.action_items.join('; ')}` : ''}
`).join('\n')}

Create a professional summary that:
1. Starts with a count ("Found X messages...")
2. Groups by team/channel or category if relevant
3. Highlights urgent/high-priority items first
4. Summarizes key topics and decisions
5. Lists action items if present
6. Uses markdown formatting
7. Is concise but captures key points`;

    const apiMessage = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });

    return apiMessage.content[0].text.trim();

  } catch (error) {
    console.error('[Teams Formatting] Error:', error.message);
    // Fallback to simple formatting
    return `Found ${results.length} Teams messages:\n\n${results.map(msg => 
      `- ${msg.from_name}: ${msg.content?.substring(0, 100)}... (${new Date(msg.created_date).toLocaleDateString()})`
    ).join('\n')}`;
  }
}

export default {
  analyzeTeamsMessage,
  generateTeamsQuery,
  formatTeamsResults
};


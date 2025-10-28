import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'; // Claude 4.5

/**
 * Analyze an email using Claude 4.5 to extract metadata and categorize
 * @param {Object} email - Email object from Microsoft Graph
 * @returns {Object} - Analyzed email data
 */
export async function analyzeEmailWithClaude(email) {
  try {
    const prompt = `You are an email classification and analysis expert for a logistics operations company (Cazar Logistics). 

Analyze the following email and extract structured information in JSON format.

Email Details:
- From: ${email.from?.emailAddress?.name || 'Unknown'} <${email.from?.emailAddress?.address || 'unknown'}>
- To: ${email.toRecipients?.map(r => r.emailAddress?.address).join(', ') || 'None'}
- Subject: ${email.subject || 'No Subject'}
- Body Preview: ${email.bodyPreview || ''}
- Has Attachments: ${email.hasAttachments ? 'Yes' : 'No'}
- Received: ${email.receivedDateTime}

Return a JSON object with these fields:
{
  "category": "Operations|Payroll|Fleet|HR|Uniform|PTO|Scheduling|Incident|General",
  "sub_category": "string (more specific)",
  "request_type": "PTO|Scheduling|Payroll|Uniform|Incident|Vehicle|Maintenance|Timecard|Other|null",
  "is_request": boolean (true if asking for something),
  "is_response": boolean (true if replying to something),
  "is_forward": boolean,
  "is_internal": boolean (true if from company domain),
  "priority": "low|medium|high|urgent",
  "sentiment": "positive|neutral|negative|frustrated",
  "urgency": "low|medium|high|critical",
  "requires_action": boolean,
  "is_incident_related": boolean (accidents, safety issues),
  "key_entities": ["string array - names, dates, locations mentioned"],
  "action_items": ["string array - specific actions needed"],
  "topics": ["string array - main topics"],
  "mentioned_drivers": ["string array - driver names if mentioned"],
  "ai_summary": "string (1-2 sentence summary)",
  "ai_confidence": number (0-1, how confident in categorization)
}

Be thorough and accurate. If unsure, indicate lower confidence.`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      temperature: 0.3, // Lower temperature for more consistent categorization
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = message.content[0].text;
    
    // Extract JSON from response (Claude sometimes wraps in markdown)
    let jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not extract JSON from Claude response');
    }
    
    const analysis = JSON.parse(jsonMatch[0]);
    
    return {
      ...analysis,
      claude_model: CLAUDE_MODEL,
      analyzed_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Claude email analysis error:', error);
    
    // Return basic classification on error
    return {
      category: 'General',
      sub_category: 'Unclassified',
      request_type: null,
      is_request: false,
      is_response: false,
      is_forward: false,
      is_internal: false,
      priority: 'medium',
      sentiment: 'neutral',
      urgency: 'low',
      requires_action: false,
      is_incident_related: false,
      key_entities: [],
      action_items: [],
      topics: [],
      mentioned_drivers: [],
      ai_summary: 'Failed to analyze email',
      ai_confidence: 0,
      error: error.message
    };
  }
}

/**
 * Analyze email thread context using Claude 4.5
 * @param {Array} emails - Array of emails in a thread
 * @returns {Object} - Thread analysis
 */
export async function analyzeEmailThread(emails) {
  try {
    const threadSummary = emails.map((email, idx) => `
Email ${idx + 1}:
From: ${email.from?.emailAddress?.name}
Subject: ${email.subject}
Date: ${email.receivedDateTime}
Preview: ${email.bodyPreview}
`).join('\n---\n');

    const prompt = `Analyze this email thread and provide insights:

${threadSummary}

Return JSON with:
{
  "thread_summary": "string (summary of entire conversation)",
  "key_participants": ["string array"],
  "main_topic": "string",
  "resolution_status": "resolved|pending|escalated|ignored",
  "sentiment_trend": "improving|neutral|deteriorating",
  "requires_followup": boolean,
  "action_owner": "string (who should act next)"
}`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    
  } catch (error) {
    console.error('Thread analysis error:', error);
    return null;
  }
}

/**
 * Generate smart query from natural language using Claude
 * @param {string} userQuery - Natural language query
 * @returns {Object} - SQL query and parameters
 */
export async function generateEmailQuery(userQuery) {
  try {
    const prompt = `You are an SQL expert for an email analytics system. Generate a PostgreSQL query based on this natural language request:

User Query: "${userQuery}"

Database Schema:
- email_analytics table with columns: message_id, from_name, from_email, subject, category, request_type, 
  received_date, is_request, is_response, status, responded_by, response_time_hours, has_attachment, 
  forwarded_to, priority, urgency, sentiment, etc.

Available views:
- unanswered_requests: Shows pending requests with hours_waiting
- driver_requests_summary: Summarizes requests by driver
- response_metrics: Response statistics by responder
- email_volume_by_category: Daily email counts by category

Common Categories: Operations, Payroll, Fleet, HR, Uniform, PTO, Scheduling, Incident
Request Types: PTO, Scheduling, Payroll, Uniform, Incident, Vehicle, Maintenance
Status: pending, responded, escalated, closed, ignored

Return JSON:
{
  "sql": "SELECT ... (complete SQL query)",
  "params": [array of parameters for $1, $2, etc.],
  "explanation": "string (what the query does)",
  "result_type": "list|count|summary|metric"
}

Make queries efficient with proper WHERE clauses and LIMIT when appropriate.`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1536,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Could not extract SQL query from Claude response');
    }
    
    return JSON.parse(jsonMatch[0]);
    
  } catch (error) {
    console.error('Query generation error:', error);
    throw error;
  }
}

/**
 * Format email query results using Claude for natural language response
 * @param {Array} results - Query results from database
 * @param {string} originalQuery - User's original question
 * @returns {string} - Formatted response
 */
export async function formatEmailQueryResults(results, originalQuery) {
  try {
    const prompt = `You are a helpful assistant for Cazar Logistics operations. 

The user asked: "${originalQuery}"

Query Results (JSON):
${JSON.stringify(results, null, 2)}

Provide a clear, concise, professional response that:
1. Directly answers their question
2. Highlights key insights or patterns
3. Mentions specific numbers/metrics
4. Identifies any concerning trends (e.g., long response times, pending items)
5. Suggests next actions if relevant

Keep response under 200 words but informative.`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    return message.content[0].text;
    
  } catch (error) {
    console.error('Results formatting error:', error);
    return `Found ${results.length} results. ${JSON.stringify(results.slice(0, 5))}`;
  }
}

/**
 * Detect if a query is email-related
 * @param {string} query - User query
 * @returns {boolean}
 */
export function isEmailQuery(query) {
  const emailKeywords = [
    'email', 'message', 'request', 'response', 'pto', 'payroll', 
    'uniform', 'fleet', 'incident', 'forwarded', 'pending',
    'turnaround', 'response time', 'attachment', 'driver request',
    'hours without response', 'average response', 'submitted',
    'handled', 'assigned', 'category', 'policy', 'insurance',
    'liability', 'claim', 'renewal', 'expiration', 'expiring',
    'broker', 'coverage', 'premium', 'correspondence', 'communication',
    'sent yesterday', 'sent today', 'sent last week', 'received from',
    'thread', 'conversation', 'inbox', 'mailbox'
  ];
  
  const lowerQuery = query.toLowerCase();
  return emailKeywords.some(keyword => lowerQuery.includes(keyword));
}

export default {
  analyzeEmailWithClaude,
  analyzeEmailThread,
  generateEmailQuery,
  formatEmailQueryResults,
  isEmailQuery
};


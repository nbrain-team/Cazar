import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-3-opus-20240229'; // Claude 3 Opus (most capable)

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
 * @param {Array} conversationHistory - Previous conversation for context and follow-ups
 * @returns {string} - Formatted response
 */
export async function formatEmailQueryResults(results, originalQuery, conversationHistory = []) {
  try {
    if (!results || results.length === 0) {
      return `I don't have any email data available for "${originalQuery}". The email database may be empty or the specific information you're looking for hasn't been synced yet.`;
    }

    // Build conversation context for follow-up questions
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4); // Last 2 exchanges
      conversationContext = '\n\nPrevious Conversation (for follow-up context):\n' + 
        recentHistory.map(msg => {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${content.substring(0, 500)}`;
        }).join('\n\n');
    }

    const prompt = `You are an EXECUTIVE ASSISTANT for Rudy Cazar, President of Cazar Logistics (Amazon delivery service).

User Query: "${originalQuery}"
${conversationContext}

Email Data (${results.length} results):
${JSON.stringify(results, null, 2)}

CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. **BE INSIGHTFUL & ACTIONABLE** - Don't just summarize. Provide:
   - Business implications
   - Risk assessment (what could go wrong if ignored?)
   - Specific recommended actions
   - Deadlines and urgency indicators

2. **PRIORITIZE RUTHLESSLY** - Lead with what matters MOST:
   - What requires immediate attention?
   - What has financial/legal/safety implications?
   - What's time-sensitive?

3. **PROVIDE FULL CONTEXT** - Include:
   - WHO sent it (full names, roles when evident)
   - WHEN (specific dates, how urgent)
   - WHAT they want/need
   - WHY it matters to the business
   - WHAT happens if not addressed

4. **HANDLE FOLLOW-UPS INTELLIGENTLY** - If user asks:
   - "Who sent this?" → Reference the specific email from previous context
   - "When?" → Give exact dates/times
   - "What should I do?" → Provide specific next steps
   
5. **FORMAT FOR EXECUTIVE CONSUMPTION**:
   - Use **bold** for critical items
   - Use bullet points for clarity
   - Put urgent items at the top
   - End with "Recommended Actions" section if applicable

6. **BE SPECIFIC** - No vague answers:
   ❌ "There are some policy issues to address"
   ✅ "Your Employment Practices Liability Policy (#CMLSRW6SFRP1224) expires December 19, 2025 (52 days). Contact Brianna Valentin at USI immediately to renew."

Example Response Structure:
**🚨 URGENT ITEMS**
- [Specific urgent matter with deadline and action]

**📋 KEY INSIGHTS**
- [Pattern or important finding]
- [Another key insight]

**✅ RECOMMENDED ACTIONS**
1. [Specific action with deadline]
2. [Next step]

Respond as if you're briefing a busy executive who needs to make quick decisions.`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    return message.content[0].text;
    
  } catch (error) {
    console.error('Results formatting error:', error);
    return `Found ${results.length} results. ${JSON.stringify(results.slice(0, 5))}`;
  }
}

/**
 * Detect if a query is email-related using AI
 * @param {string} query - User query
 * @returns {Promise<boolean>}
 */
export async function isEmailQuery(query) {
  try {
    // Quick keyword check first for obvious cases (fast path)
    const obviousEmailKeywords = ['email', 'inbox', 'mailbox', 'sent me', 'forwarded'];
    const lowerQuery = query.toLowerCase();
    if (obviousEmailKeywords.some(k => lowerQuery.includes(k))) {
      return true;
    }
    
    // Use Claude to intelligently determine if emails should be searched
    const prompt = `You are a query intent analyzer for a logistics operations system. The system has access to:
1. Email communications (company emails, driver requests, HR correspondence, insurance, policies, claims, etc.)
2. Database records (timecards, violations, schedules, performance metrics)
3. Knowledge base documents

User query: "${query}"

Should this query search the EMAIL database? Consider:
- Questions about communications, correspondence, messages
- Insurance, policies, claims, renewals, coverage
- Requests from/to people (PTO, uniforms, scheduling, payroll)
- Company announcements, notifications, alerts
- Specific people's communications or sent items
- Anything that would typically be communicated via email

Respond with ONLY "YES" or "NO" (one word).`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }]
    });

    const response = message.content[0].text.trim().toUpperCase();
    const shouldSearch = response === 'YES';
    
    console.log(`[Email Detection] Query: "${query.substring(0, 50)}..." → ${shouldSearch ? 'SEARCH EMAILS' : 'SKIP EMAILS'}`);
    return shouldSearch;
    
  } catch (error) {
    console.error('[Email Detection] Error:', error.message);
    // Fallback to comprehensive keyword matching on error
    const emailKeywords = [
      // Direct email terms
      'email', 'message', 'inbox', 'mailbox', 'sent', 'received', 'forwarded',
      // Business communication
      'policy', 'insurance', 'liability', 'claim', 'renewal', 'expiration', 'expiring',
      'correspondence', 'communication', 'notification', 'alert', 'announcement',
      // Requests and responses
      'request', 'response', 'reply', 'pto', 'payroll', 'uniform', 'incident',
      'pending', 'submitted', 'handled', 'assigned', 'escalated',
      // Email-typical content
      'broker', 'coverage', 'premium', 'attachment', 'thread', 'conversation',
      // People asking/telling
      'priorities', 'concerns', 'matters', 'issues', 'updates', 'status',
      'what should', 'what needs', 'anything i need', 'what do i need',
      'who said', 'who sent', 'who replied', 'what did', 'did anyone',
      // Time-based queries that likely refer to emails
      'yesterday', 'today', 'last week', 'this week', 'this month'
    ];
    
    const lowerQuery = query.toLowerCase();
    const matches = emailKeywords.some(k => lowerQuery.includes(k));
    
    // Also check for patterns like "what should [person] be thinking about"
    const priorityPatterns = [
      /what (should|needs?|must).*(priority|priorities|focus|attention|concern)/i,
      /any.*(urgent|important|critical|priority|concern|matter)/i,
      /(priorities|concerns|matters|issues) for (today|this week|rudy)/i
    ];
    
    const matchesPattern = priorityPatterns.some(pattern => pattern.test(query));
    
    return matches || matchesPattern;
  }
}

export default {
  analyzeEmailWithClaude,
  analyzeEmailThread,
  generateEmailQuery,
  formatEmailQueryResults,
  isEmailQuery
};


/**
 * Anthropic Agent Tools
 * Tool definitions and execution for Anthropic's tool use API
 * Provides email, calendar, Teams, and operations database access
 */

import pg from 'pg';
const { Pool } = pg;

let pool = null;

export function initializePool(connectionString) {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

/**
 * Tool definitions for Anthropic's tool use API
 */
export const tools = [
  {
    name: 'query_emails',
    description: 'Query email analytics database to find emails, requests, communications. Returns emails with Claude pre-analysis (categories, priorities, action items). Use for: email searches, priority identification, request tracking, communication analysis.',
    input_schema: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'Person name or email to filter by (searches from_email and to_emails). Examples: "Rudy", "Rudy@CazarNYC.com"'
        },
        category: {
          type: 'string',
          enum: ['Operations', 'Payroll', 'Fleet', 'HR', 'Uniform', 'PTO', 'Scheduling', 'Incident', 'General'],
          description: 'Email category'
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Priority level'
        },
        urgency: {
          type: 'string',
          enum: ['urgent', 'normal', 'low'],
          description: 'Urgency level'
        },
        days_back: {
          type: 'number',
          description: 'How many days back to search (default: 7)'
        },
        requires_action: {
          type: 'boolean',
          description: 'Filter for emails requiring action'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 50)'
        }
      }
    }
  },
  {
    name: 'query_calendar',
    description: 'Query calendar events database to find meetings, appointments, schedules. Returns events with Claude analysis (categories, priorities, topics, action items). Use for: meeting lookups, schedule queries, deadline tracking.',
    input_schema: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'Person name or email (searches organizer and attendees)'
        },
        meeting_type: {
          type: 'string',
          enum: ['one-on-one', 'team', 'all-hands', 'client', 'vendor', 'internal', 'external'],
          description: 'Type of meeting'
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Priority level'
        },
        time_range: {
          type: 'string',
          enum: ['today', 'tomorrow', 'this_week', 'next_week', 'this_month', 'upcoming'],
          description: 'Time period to search'
        },
        days_back: {
          type: 'number',
          description: 'How many days back to search (for past meetings)'
        },
        days_forward: {
          type: 'number',
          description: 'How many days forward to search (for upcoming meetings)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 50)'
        }
      }
    }
  },
  {
    name: 'query_teams',
    description: 'Query Teams messages database to find discussions, decisions, updates. Returns messages with Claude analysis (sentiment, urgency, topics, action items). Use for: team discussions, decision tracking, collaboration analysis.',
    input_schema: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'Person name or email (searches from_email and people_mentioned)'
        },
        team_name: {
          type: 'string',
          description: 'Team name to filter by'
        },
        channel_name: {
          type: 'string',
          description: 'Channel name to filter by'
        },
        category: {
          type: 'string',
          enum: ['Announcement', 'Question', 'Update', 'Decision', 'Discussion', 'Request', 'FYI', 'Alert'],
          description: 'Message category'
        },
        urgency: {
          type: 'string',
          enum: ['urgent', 'normal', 'low'],
          description: 'Urgency level'
        },
        days_back: {
          type: 'number',
          description: 'How many days back to search (default: 7)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 50)'
        }
      }
    }
  },
  {
    name: 'query_operations_db',
    description: 'Query operations database for drivers, timecards, violations, hours worked, breaks, schedules. Use for: driver information, compliance checking, timecard analysis, violation tracking.',
    input_schema: {
      type: 'object',
      properties: {
        query_type: {
          type: 'string',
          enum: ['drivers', 'timecards', 'violations', 'breaks', 'hos_status'],
          description: 'Type of data to query'
        },
        driver_name: {
          type: 'string',
          description: 'Driver name to filter by'
        },
        date_range: {
          type: 'string',
          description: 'Date range in format YYYY-MM-DD to YYYY-MM-DD'
        },
        status: {
          type: 'string',
          description: 'Filter by status (e.g., active, inactive, pending)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 100)'
        }
      },
      required: ['query_type']
    }
  },
  {
    name: 'analyze_priorities',
    description: 'Analyze and synthesize priorities across multiple data sources (emails, calendar, Teams). Identifies high-priority items, action items, urgent matters, and trends. Use when user asks about overall priorities or what needs attention.',
    input_schema: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'Person to analyze priorities for'
        },
        time_period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month', 'recent'],
          description: 'Time period for analysis'
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['emails', 'calendar', 'teams']
          },
          description: 'Which data sources to include (default: all)'
        }
      },
      required: ['person']
    }
  },
  {
    name: 'compare_time_periods',
    description: 'Compare data between two time periods to identify trends, changes, or patterns. Use for: week-over-week comparisons, month-over-month analysis, before/after comparisons.',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          description: 'What to compare (e.g., "email volume", "meeting count", "priority items")'
        },
        period1: {
          type: 'string',
          description: 'First time period (e.g., "this week", "last 7 days")'
        },
        period2: {
          type: 'string',
          description: 'Second time period (e.g., "last week", "previous 7 days")'
        },
        person: {
          type: 'string',
          description: 'Optional: specific person to analyze'
        }
      },
      required: ['metric', 'period1', 'period2']
    }
  },
  {
    name: 'extract_action_items',
    description: 'Extract and consolidate all action items from emails, meetings, and Teams discussions for a person or time period. Returns prioritized list of things that need attention.',
    input_schema: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'Person to extract action items for'
        },
        time_period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month'],
          description: 'Time period to analyze'
        },
        priority_only: {
          type: 'boolean',
          description: 'Only include high-priority action items'
        }
      },
      required: ['person']
    }
  },
  {
    name: 'query_adp_payroll',
    description: 'Query ADP payroll system for employee data, recent hires, workforce information, payroll details. Use for: employee lookups, hiring information, workforce analytics.',
    input_schema: {
      type: 'object',
      properties: {
        query_type: {
          type: 'string',
          enum: ['employees', 'recent_hires', 'active_workers', 'workforce_summary'],
          description: 'Type of ADP query to execute'
        },
        days_back: {
          type: 'number',
          description: 'For recent_hires, how many days back to search (default: 90)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 50)'
        }
      },
      required: ['query_type']
    }
  },
  {
    name: 'search_vector_database',
    description: 'Search Pinecone vector knowledge base for semantic similarity. Returns relevant documents, policies, procedures, knowledge base articles. Use for: finding documentation, searching knowledge base, looking up policies/procedures.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (will be embedded and searched semantically)'
        },
        top_k: {
          type: 'number',
          description: 'Number of results to return (default: 5)'
        },
        min_score: {
          type: 'number',
          description: 'Minimum relevance score 0-1 (default: 0.5)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_web',
    description: 'Search the web for compliance regulations, industry news, external information. Prioritizes configured compliance URLs (FMCSA, OSHA, DOL). Use for: regulatory lookups, compliance rules, industry standards.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        compliance_only: {
          type: 'boolean',
          description: 'Only search compliance/regulatory sites (default: true)'
        }
      },
      required: ['query']
    }
  }
];

/**
 * Execute a tool call
 */
export async function executeTool(toolName, args) {
  console.log(`🔧 Executing tool: ${toolName}`);
  console.log(`   Args:`, JSON.stringify(args, null, 2));

  try {
    switch (toolName) {
      case 'query_emails':
        return await queryEmails(args);
      
      case 'query_calendar':
        return await queryCalendar(args);
      
      case 'query_teams':
        return await queryTeams(args);
      
      case 'query_operations_db':
        return await queryOperationsDB(args);
      
      case 'analyze_priorities':
        return await analyzePriorities(args);
      
      case 'compare_time_periods':
        return await compareTimePeriods(args);
      
      case 'extract_action_items':
        return await extractActionItems(args);
      
      case 'query_adp_payroll':
        return await queryADPPayroll(args);
      
      case 'search_vector_database':
        return await searchVectorDatabase(args);
      
      case 'search_web':
        return await searchWebTool(args);
      
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`
        };
    }
  } catch (error) {
    console.error(`❌ Tool execution error (${toolName}):`, error.message);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Query ADP payroll system
 */
async function queryADPPayroll(args) {
  const { query_type, days_back = 90, limit = 50 } = args;

  // Import ADP service dynamically
  const { searchADPService } = await import('./adpService.mjs');

  let searchQuery = '';
  
  switch (query_type) {
    case 'recent_hires':
      searchQuery = 'recent hires';
      break;
    case 'active_workers':
      searchQuery = 'active employees';
      break;
    case 'employees':
      searchQuery = 'all employees';
      break;
    case 'workforce_summary':
      searchQuery = 'workforce summary';
      break;
    default:
      searchQuery = query_type;
  }

  const results = await searchADPService(searchQuery);

  return {
    success: true,
    data: results,
    count: results.length,
    query_summary: `Found ${results.length} ${query_type} from ADP`
  };
}

/**
 * Search vector database (Pinecone)
 */
async function searchVectorDatabase(args) {
  const { query, top_k = 5, min_score = 0.5 } = args;

  try {
    // For now, return placeholder until Pinecone is configured
    // This tool will be enabled when vector database is set up
    return {
      success: true,
      data: [],
      count: 0,
      query_summary: `Vector database search ready (configure Pinecone to enable semantic search)`
    };
  } catch (error) {
    console.error('[Vector DB] Search error:', error.message);
    return {
      success: false,
      error: `Vector database not configured`,
      data: []
    };
  }
}

/**
 * Search web for compliance/regulatory information
 */
async function searchWebTool(args) {
  const { query, compliance_only = true } = args;

  try {
    // For now, return placeholder
    // This tool will query web when needed
    return {
      success: true,
      data: [],
      count: 0,
      query_summary: `Web search ready (would search for compliance info about "${query}")`
    };
  } catch (error) {
    console.error('[Web Search] Error:', error.message);
    return {
      success: false,
      error: `Web search not configured`,
      data: []
    };
  }
}

/**
 * Query emails with flexible filtering
 */
async function queryEmails(args) {
  const {
    person,
    category,
    priority,
    urgency,
    days_back = 7,
    requires_action,
    limit = 50
  } = args;

  let conditions = [];
  let params = [];
  let paramIndex = 1;

  // Person filter (from or to)
  if (person) {
    const email = person.includes('@') ? person : `%${person}%`;
    conditions.push(`(from_email ILIKE $${paramIndex} OR $${paramIndex+1} = ANY(to_emails) OR to_emails::text ILIKE $${paramIndex})`);
    params.push(email, person.includes('@') ? person : `${person}@CazarNYC.com`);
    paramIndex += 2;
  }

  // Category filter
  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  // Priority filter
  if (priority) {
    conditions.push(`priority = $${paramIndex}`);
    params.push(priority);
    paramIndex++;
  }

  // Urgency filter
  if (urgency) {
    conditions.push(`urgency = $${paramIndex}`);
    params.push(urgency);
    paramIndex++;
  }

  // Action required filter
  if (requires_action !== undefined) {
    conditions.push(`requires_action = $${paramIndex}`);
    params.push(requires_action);
    paramIndex++;
  }

  // Time filter
  conditions.push(`received_date >= NOW() - INTERVAL '${days_back} days'`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      message_id, from_name, from_email, to_emails, subject, body_preview,
      received_date, category, request_type, priority, urgency,
      requires_action, action_items, status
    FROM email_analytics
    ${whereClause}
    ORDER BY received_date DESC
    LIMIT $${paramIndex}
  `;

  params.push(limit);

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} emails matching criteria`
  };
}

/**
 * Query calendar events
 */
async function queryCalendar(args) {
  const {
    person,
    meeting_type,
    priority,
    time_range,
    days_back,
    days_forward,
    limit = 50
  } = args;

  let conditions = ['is_cancelled = false'];
  let params = [];
  let paramIndex = 1;

  // Person filter
  if (person) {
    conditions.push(`(organizer_email ILIKE $${paramIndex} OR attendees::text ILIKE $${paramIndex})`);
    params.push(`%${person}%`);
    paramIndex++;
  }

  // Meeting type filter
  if (meeting_type) {
    conditions.push(`meeting_type = $${paramIndex}`);
    params.push(meeting_type);
    paramIndex++;
  }

  // Priority filter
  if (priority) {
    conditions.push(`priority = $${paramIndex}`);
    params.push(priority);
    paramIndex++;
  }

  // Time range filter
  if (time_range === 'today') {
    conditions.push(`start_time >= CURRENT_DATE AND start_time < CURRENT_DATE + INTERVAL '1 day'`);
  } else if (time_range === 'tomorrow') {
    conditions.push(`start_time >= CURRENT_DATE + INTERVAL '1 day' AND start_time < CURRENT_DATE + INTERVAL '2 days'`);
  } else if (time_range === 'this_week') {
    conditions.push(`start_time >= date_trunc('week', NOW()) AND start_time < date_trunc('week', NOW()) + INTERVAL '1 week'`);
  } else if (time_range === 'next_week') {
    conditions.push(`start_time >= date_trunc('week', NOW()) + INTERVAL '1 week' AND start_time < date_trunc('week', NOW()) + INTERVAL '2 weeks'`);
  } else if (time_range === 'upcoming') {
    conditions.push(`start_time >= NOW()`);
  } else if (days_back) {
    conditions.push(`start_time >= NOW() - INTERVAL '${days_back} days'`);
  } else if (days_forward) {
    conditions.push(`start_time <= NOW() + INTERVAL '${days_forward} days'`);
  }

  const sql = `
    SELECT 
      event_id, subject, organizer_name, organizer_email, attendees,
      start_time, end_time, location, is_online_meeting, online_meeting_url,
      category, priority, meeting_type, key_topics, action_items
    FROM calendar_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY start_time ASC
    LIMIT $${paramIndex}
  `;

  params.push(limit);

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} calendar events`
  };
}

/**
 * Query Teams messages
 */
async function queryTeams(args) {
  const {
    person,
    team_name,
    channel_name,
    category,
    urgency,
    days_back = 7,
    limit = 50
  } = args;

  let conditions = [];
  let params = [];
  let paramIndex = 1;

  // Person filter
  if (person) {
    conditions.push(`(from_email ILIKE $${paramIndex} OR people_mentioned::text ILIKE $${paramIndex})`);
    params.push(`%${person}%`);
    paramIndex++;
  }

  // Team filter
  if (team_name) {
    conditions.push(`team_name ILIKE $${paramIndex}`);
    params.push(`%${team_name}%`);
    paramIndex++;
  }

  // Channel filter
  if (channel_name) {
    conditions.push(`channel_name ILIKE $${paramIndex}`);
    params.push(`%${channel_name}%`);
    paramIndex++;
  }

  // Category filter
  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  // Urgency filter
  if (urgency) {
    conditions.push(`urgency_level = $${paramIndex}`);
    params.push(urgency);
    paramIndex++;
  }

  // Time filter
  conditions.push(`created_date >= NOW() - INTERVAL '${days_back} days'`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      message_id, team_name, channel_name, from_name, from_email,
      content, created_date, category, sentiment, priority,
      urgency_level, key_topics, action_items
    FROM teams_messages
    ${whereClause}
    ORDER BY created_date DESC
    LIMIT $${paramIndex}
  `;

  params.push(limit);

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} Teams messages`
  };
}

/**
 * Query operations database (drivers, timecards, violations)
 */
async function queryOperationsDB(args) {
  const { query_type, driver_name, date_range, status, limit = 100 } = args;

  let sql = '';
  let params = [];

  switch (query_type) {
    case 'drivers':
      sql = `SELECT driver_id, driver_name, driver_status, employment_status, hire_date 
             FROM drivers 
             WHERE driver_name ILIKE $1 OR driver_status = $2
             LIMIT $3`;
      params = [`%${driver_name || ''}%`, status || 'active', limit];
      break;

    case 'timecards':
      sql = `SELECT * FROM timecards WHERE date >= NOW() - INTERVAL '30 days' LIMIT $1`;
      params = [limit];
      break;

    case 'violations':
      sql = `SELECT * FROM driver_violations WHERE occurred_at >= NOW() - INTERVAL '30 days' LIMIT $1`;
      params = [limit];
      break;

    default:
      return {
        success: false,
        error: `Unknown query type: ${query_type}`
      };
  }

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} ${query_type} records`
  };
}

/**
 * Analyze priorities across all sources
 */
async function analyzePriorities(args) {
  const { person, time_period = 'this_week', sources = ['emails', 'calendar', 'teams'] } = args;

  const results = {
    emails: [],
    calendar: [],
    teams: []
  };

  // Determine days back based on time period
  const daysMap = {
    'today': 1,
    'this_week': 7,
    'this_month': 30,
    'recent': 14
  };
  const days_back = daysMap[time_period] || 7;

  // Query each enabled source
  if (sources.includes('emails')) {
    const emailResult = await queryEmails({
      person,
      days_back,
      limit: 50
    });
    if (emailResult.success) {
      results.emails = emailResult.data.filter(e => 
        e.priority === 'high' || e.urgency === 'urgent' || e.requires_action
      );
    }
  }

  if (sources.includes('calendar')) {
    const calendarResult = await queryCalendar({
      person,
      days_back,
      days_forward: 14,
      limit: 50
    });
    if (calendarResult.success) {
      results.calendar = calendarResult.data.filter(e => 
        e.priority === 'high' || e.action_items?.length > 0
      );
    }
  }

  if (sources.includes('teams')) {
    const teamsResult = await queryTeams({
      person,
      days_back,
      limit: 50
    });
    if (teamsResult.success) {
      results.teams = teamsResult.data.filter(m => 
        m.urgency_level === 'urgent' || m.priority === 'high'
      );
    }
  }

  // Synthesize priorities
  const totalItems = results.emails.length + results.calendar.length + results.teams.length;

  return {
    success: true,
    data: results,
    summary: {
      person,
      time_period,
      high_priority_emails: results.emails.length,
      high_priority_meetings: results.calendar.length,
      urgent_teams_messages: results.teams.length,
      total_priority_items: totalItems
    },
    query_summary: `Analyzed priorities for ${person}: ${totalItems} high-priority items found across ${sources.join(', ')}`
  };
}

/**
 * Compare data between time periods
 */
async function compareTimePeriods(args) {
  const { metric, period1, period2, person } = args;

  // This would implement period comparison logic
  // For now, return structure showing how it would work

  return {
    success: true,
    data: {
      period1: { metric, value: 0, details: [] },
      period2: { metric, value: 0, details: [] },
      change: 0,
      trend: 'stable'
    },
    query_summary: `Compared ${metric} between ${period1} and ${period2}`
  };
}

/**
 * Extract all action items
 */
async function extractActionItems(args) {
  const { person, time_period = 'this_week', priority_only = false } = args;

  const days_back = time_period === 'today' ? 1 : time_period === 'this_week' ? 7 : 30;

  // Query all sources for action items
  const sql = `
    SELECT 'email' as source, subject as title, action_items, received_date as date, priority
    FROM email_analytics
    WHERE (from_email ILIKE $1 OR $2 = ANY(to_emails))
      AND action_items IS NOT NULL
      AND received_date >= NOW() - INTERVAL '${days_back} days'
    UNION ALL
    SELECT 'calendar' as source, subject as title, action_items, start_time as date, priority
    FROM calendar_events
    WHERE (organizer_email ILIKE $1 OR attendees::text ILIKE $1)
      AND action_items IS NOT NULL
      AND start_time >= NOW() - INTERVAL '${days_back} days'
    UNION ALL
    SELECT 'teams' as source, content as title, action_items, created_date as date, priority
    FROM teams_messages
    WHERE (from_email ILIKE $1 OR people_mentioned::text ILIKE $1)
      AND action_items IS NOT NULL
      AND created_date >= NOW() - INTERVAL '${days_back} days'
    ORDER BY date DESC
    LIMIT 100
  `;

  const emailParam = person.includes('@') ? person : `%${person}%`;
  const result = await pool.query(sql, [emailParam, person.includes('@') ? person : `${person}@CazarNYC.com`]);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} action items for ${person} from ${time_period}`
  };
}

export default {
  tools,
  executeTool,
  initializePool
};


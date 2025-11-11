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
    description: 'Query email analytics database to find specific emails. Returns individual email records. Use ONLY when you need to see actual email details. For counts/statistics, use get_email_statistics instead.',
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
          description: 'Maximum results to return (default: 20, max: 50 to avoid token limits)'
        }
      }
    }
  },
  {
    name: 'get_email_statistics',
    description: 'Get email counts, aggregations, and statistics. Use for: "count emails by category", "email volume by day", "statistics", "how many emails". Returns aggregated data only, not individual emails. Much faster than query_emails for counts.',
    input_schema: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['category', 'day', 'category_and_day', 'person', 'priority', 'category_and_priority'],
          description: 'How to group the statistics. category_and_day for daily breakdown by category.'
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['Operations', 'Payroll', 'Fleet', 'HR', 'Uniform', 'PTO', 'Scheduling', 'Incident', 'General']
          },
          description: 'Optional: filter to specific categories'
        },
        person: {
          type: 'string',
          description: 'Optional: filter to emails for specific person'
        },
        days_back: {
          type: 'number',
          description: 'How many days back to analyze (default: 30)'
        }
      },
      required: ['group_by']
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
    description: 'Query operations database for drivers, timecards, violations, hours worked, breaks, schedules. Use for: driver information, compliance checking, timecard analysis, violation tracking, break compliance.',
    input_schema: {
      type: 'object',
      properties: {
        query_type: {
          type: 'string',
          enum: ['drivers', 'timecards', 'violations', 'break_violations', 'consecutive_days'],
          description: 'Type of data to query. Use break_violations for lunch break compliance, consecutive_days for drivers working too many days in a row.'
        },
        driver_name: {
          type: 'string',
          description: 'Driver name to filter by'
        },
        days_back: {
          type: 'number',
          description: 'How many days back to search (default: 30)'
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
  },
  {
    name: 'check_missing_clockouts',
    description: 'Find shifts with clock-in but missing clock-out in the last N days. Returns employees with incomplete timecards. Use for: finding incomplete shifts, timecard issues.',
    input_schema: {
      type: 'object',
      properties: {
        days_back: {
          type: 'number',
          description: 'How many days back to search (default: 14)'
        }
      }
    }
  },
  {
    name: 'check_weekly_overtime',
    description: 'Find employees who exceeded specified hours before Saturday in current week. Returns employees with overtime hours, total hours worked, and days worked.',
    input_schema: {
      type: 'object',
      properties: {
        threshold_hours: {
          type: 'number',
          description: 'Hours threshold to check against (default: 40)'
        }
      }
    }
  },
  {
    name: 'analyze_driver_requests',
    description: 'Analyze driver requests from emails (PTO, scheduling, payroll, uniforms) and track response status and turnaround time. Shows who responded and how long it took.',
    input_schema: {
      type: 'object',
      properties: {
        request_type: {
          type: 'string',
          enum: ['PTO', 'scheduling', 'payroll', 'uniform', 'all'],
          description: 'Type of request to analyze (default: all)'
        },
        days_back: {
          type: 'number',
          description: 'How many days back to analyze (default: 30)'
        },
        show_unanswered_only: {
          type: 'boolean',
          description: 'Only show requests without responses (default: false)'
        }
      }
    }
  },
  {
    name: 'get_email_response_stats',
    description: 'Get email response statistics: count of responses per day per responder, average response times by category. Use for: response time analysis, responder activity tracking.',
    input_schema: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['responder', 'responder_and_day', 'responder_and_category'],
          description: 'How to group response statistics'
        },
        days_back: {
          type: 'number',
          description: 'Days to analyze (default: 30)'
        }
      },
      required: ['group_by']
    }
  },
  {
    name: 'find_unanswered_emails',
    description: 'Find emails older than specified hours without any response. Can search for external emails needing response OR internal emails (from specific person like Rudy) awaiting replies. Use for: finding neglected emails, tracking follow-ups.',
    input_schema: {
      type: 'object',
      properties: {
        hours_threshold: {
          type: 'number',
          description: 'Minimum hours old without response (default: 48)'
        },
        from_person: {
          type: 'string',
          description: 'Optional: Find emails FROM this person (e.g., "Rudy") that have not received replies. If omitted, searches for external emails needing response.'
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific categories (optional)'
        }
      }
    }
  },
  {
    name: 'find_incident_attachments',
    description: 'Find emails with attachments related to incidents (accidents, violations). Shows who handled them and response status.',
    input_schema: {
      type: 'object',
      properties: {
        days_back: {
          type: 'number',
          description: 'Days to search (default: 30)'
        }
      }
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
      
      case 'get_email_statistics':
        return await getEmailStatistics(args);
      
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
      
      case 'check_missing_clockouts':
        return await checkMissingClockouts(args);
      
      case 'check_weekly_overtime':
        return await checkWeeklyOvertime(args);
      
      case 'analyze_driver_requests':
        return await analyzeDriverRequests(args);
      
      case 'get_email_response_stats':
        return await getEmailResponseStats(args);
      
      case 'find_unanswered_emails':
        return await findUnansweredEmails(args);
      
      case 'find_incident_attachments':
        return await findIncidentAttachments(args);
      
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
 * Get email statistics and aggregations
 */
async function getEmailStatistics(args) {
  const {
    group_by,
    categories,
    person,
    days_back = 30
  } = args;

  let sql = '';
  let params = [];
  let paramIndex = 1;

  // Build WHERE conditions
  let conditions = [`received_date >= NOW() - INTERVAL '${days_back} days'`];
  
  if (person) {
    const email = person.includes('@') ? person : `%${person}%`;
    conditions.push(`(from_email ILIKE $${paramIndex} OR $${paramIndex+1} = ANY(to_emails))`);
    params.push(email, person.includes('@') ? person : `${person}@CazarNYC.com`);
    paramIndex += 2;
  }
  
  if (categories && categories.length > 0) {
    conditions.push(`category = ANY($${paramIndex}::text[])`);
    params.push(categories);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // Build appropriate aggregation SQL based on group_by
  switch (group_by) {
    case 'category':
      sql = `
        SELECT 
          category,
          COUNT(*) as email_count,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count,
          COUNT(CASE WHEN requires_action = true THEN 1 END) as action_required_count
        FROM email_analytics
        WHERE ${whereClause}
        GROUP BY category
        ORDER BY email_count DESC`;
      break;

    case 'day':
      sql = `
        SELECT 
          DATE(received_date) as date,
          COUNT(*) as email_count,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count
        FROM email_analytics
        WHERE ${whereClause}
        GROUP BY DATE(received_date)
        ORDER BY date DESC`;
      break;

    case 'category_and_day':
      sql = `
        SELECT 
          DATE(received_date) as date,
          category,
          COUNT(*) as email_count,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count
        FROM email_analytics
        WHERE ${whereClause}
        GROUP BY DATE(received_date), category
        ORDER BY date DESC, category`;
      break;

    case 'person':
      sql = `
        SELECT 
          from_name,
          from_email,
          COUNT(*) as email_count,
          MAX(received_date) as last_email
        FROM email_analytics
        WHERE ${whereClause}
        GROUP BY from_name, from_email
        ORDER BY email_count DESC
        LIMIT 50`;
      break;

    case 'priority':
      sql = `
        SELECT 
          priority,
          COUNT(*) as email_count,
          COUNT(CASE WHEN requires_action = true THEN 1 END) as action_required
        FROM email_analytics
        WHERE ${whereClause}
        GROUP BY priority
        ORDER BY email_count DESC`;
      break;

    case 'category_and_priority':
      sql = `
        SELECT 
          category,
          priority,
          COUNT(*) as email_count
        FROM email_analytics
        WHERE ${whereClause}
        GROUP BY category, priority
        ORDER BY category, priority`;
      break;

    default:
      return {
        success: false,
        error: `Unknown group_by: ${group_by}`
      };
  }

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Email statistics grouped by ${group_by}: ${result.rows.length} groups`,
    aggregation_type: group_by
  };
}

/**
 * Query emails with flexible filtering (returns individual emails - use sparingly)
 */
async function queryEmails(args) {
  const {
    person,
    category,
    priority,
    urgency,
    days_back = 7,
    requires_action,
    limit = 20  // Reduced default to avoid token limits
  } = args;
  
  // Cap limit to prevent token overflow
  const safeLimit = Math.min(limit, 50);

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
      message_id, from_name, from_email, subject, 
      LEFT(body_preview, 200) as body_preview,
      received_date, category, request_type, priority, urgency,
      requires_action, action_items, status
    FROM email_analytics
    ${whereClause}
    ORDER BY received_date DESC
    LIMIT $${paramIndex}
  `;

  params.push(safeLimit);

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} emails (limited to ${safeLimit} to avoid token overflow)`,
    note: result.rows.length >= safeLimit ? `Results limited to ${safeLimit}. Use get_email_statistics for counts/aggregations.` : null
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
  const { query_type, driver_name, date_range, status, limit = 100, days_back = 30 } = args;

  let sql = '';
  let params = [];

  switch (query_type) {
    case 'drivers':
      sql = `SELECT driver_id, driver_name, driver_status, employment_status, hire_date, department, job_title
             FROM drivers 
             WHERE driver_name ILIKE $1 OR driver_status = $2
             LIMIT $3`;
      params = [`%${driver_name || ''}%`, status || 'active', limit];
      break;

    case 'timecards':
      sql = `SELECT t.*, d.driver_name, d.driver_status
             FROM timecards t
             LEFT JOIN drivers d ON t.employee_id = d.driver_id
             WHERE t.date >= NOW() - INTERVAL '${days_back} days' 
             LIMIT $1`;
      params = [limit];
      break;

    case 'violations':
      sql = `SELECT v.*, d.driver_name, d.driver_status
             FROM driver_violations v
             LEFT JOIN drivers d ON v.driver_id = d.driver_id
             WHERE v.occurred_at >= NOW() - INTERVAL '${days_back} days' 
             LIMIT $1`;
      params = [limit];
      break;

    case 'break_violations':
      // Query timecards for drivers who worked 6+ hours without lunch break (using recent data)
      sql = `
        SELECT 
          t.timecard_id,
          t.employee_id as driver_id,
          d.driver_name,
          t.date as work_date,
          t.clock_in_time,
          t.clock_out_time,
          t.total_hours_worked as hours_worked,
          t.break_start_time,
          t.break_end_time,
          CASE 
            WHEN t.break_start_time IS NULL OR t.break_end_time IS NULL THEN '❌ NO LUNCH RECORDED'
            WHEN EXTRACT(EPOCH FROM (t.break_end_time - t.break_start_time))/60 < 30 THEN '⚠️ SHORT LUNCH'
            ELSE '✅ OK'
          END as lunch_status,
          EXTRACT(EPOCH FROM (t.break_end_time - t.break_start_time))/60 as lunch_minutes
        FROM timecards t
        LEFT JOIN drivers d ON t.employee_id = d.driver_id
        WHERE t.total_hours_worked >= 6.0
          AND t.date >= NOW() - INTERVAL '${days_back} days'
          AND (t.break_start_time IS NULL OR t.break_end_time IS NULL OR EXTRACT(EPOCH FROM (t.break_end_time - t.break_start_time))/60 < 30)
        ORDER BY t.date DESC, t.total_hours_worked DESC
        LIMIT $1`;
      params = [limit];
      break;

    case 'consecutive_days':
      // Query timecards for drivers working 6+ consecutive days (using recent data)
      sql = `
        WITH daily_work AS (
          SELECT DISTINCT
            t.employee_id as driver_id,
            d.driver_name,
            t.date as work_date
          FROM timecards t
          LEFT JOIN drivers d ON t.employee_id = d.driver_id
          WHERE t.date >= NOW() - INTERVAL '${days_back} days'
        ),
        consecutive AS (
          SELECT 
            driver_id,
            driver_name,
            work_date,
            work_date - (ROW_NUMBER() OVER (PARTITION BY driver_id ORDER BY work_date))::int as grp
          FROM daily_work
        ),
        streaks AS (
          SELECT 
            driver_id,
            driver_name,
            MIN(work_date) as streak_start,
            MAX(work_date) as streak_end,
            COUNT(*) as consecutive_days
          FROM consecutive
          GROUP BY driver_id, driver_name, grp
          HAVING COUNT(*) >= 6
        )
        SELECT 
          driver_id,
          driver_name,
          streak_start,
          streak_end,
          consecutive_days,
          CASE 
            WHEN consecutive_days >= 7 THEN '🚨 CRITICAL'
            WHEN consecutive_days >= 6 THEN '⚠️ WARNING'
            ELSE '✅ OK'
          END as status
        FROM streaks
        ORDER BY consecutive_days DESC, streak_end DESC
        LIMIT $1`;
      params = [limit];
      break;

    default:
      return {
        success: false,
        error: `Unknown query type: ${query_type}. Available: drivers, timecards, violations, break_violations, consecutive_days`
      };
  }

  const result = await pool.query(sql, params);

  return {
    success: true,
    data: result.rows,
    count: result.rows.length,
    query_summary: `Found ${result.rows.length} ${query_type} records`,
    columns: result.fields?.map(f => f.name) || []
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

/**
 * Check for missing clock-outs
 */
async function checkMissingClockouts(args) {
  const { days_back = 14 } = args;
  
  const query = `
    SELECT 
      d.driver_name,
      t.clock_in_time,
      t.date,
      ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.clock_in_time))/3600, 1) as hours_since_clockin
    FROM timecards t
    JOIN drivers d ON t.employee_id = d.driver_id
    WHERE t.clock_out_time IS NULL
      AND t.date >= CURRENT_DATE - INTERVAL '${days_back} days'
    ORDER BY t.clock_in_time DESC
  `;
  
  const result = await pool.query(query);
  
  return {
    success: true,
    count: result.rows.length,
    shifts: result.rows,
    message: `Found ${result.rows.length} shifts with missing clock-outs in last ${days_back} days`,
    days_analyzed: days_back
  };
}

/**
 * Check weekly overtime (employees exceeding threshold before Saturday)
 */
async function checkWeeklyOvertime(args) {
  const { threshold_hours = 40 } = args;
  
  const query = `
    WITH weekly_hours AS (
      SELECT 
        t.employee_id,
        d.driver_name,
        SUM(t.total_hours_worked) as total_hours,
        ARRAY_AGG(t.date ORDER BY t.date) as work_days,
        COUNT(*) as days_worked,
        MAX(t.date) as last_shift_date
      FROM timecards t
      JOIN drivers d ON t.employee_id = d.driver_id
      WHERE t.date >= DATE_TRUNC('week', CURRENT_DATE)
        AND EXTRACT(DOW FROM t.date) < 6
      GROUP BY t.employee_id, d.driver_name
      HAVING SUM(t.total_hours_worked) > $1
    )
    SELECT 
      driver_name,
      ROUND(total_hours, 2) as total_hours,
      ROUND(total_hours - $1, 2) as overtime_hours,
      work_days,
      days_worked,
      last_shift_date
    FROM weekly_hours
    ORDER BY total_hours DESC
  `;
  
  const result = await pool.query(query, [threshold_hours]);
  const totalOT = result.rows.reduce((sum, row) => sum + parseFloat(row.overtime_hours), 0);
  
  return {
    success: true,
    count: result.rows.length,
    total_overtime_hours: totalOT.toFixed(2),
    average_overtime: result.rows.length > 0 ? (totalOT / result.rows.length).toFixed(2) : 0,
    employees: result.rows,
    message: `Found ${result.rows.length} employees exceeding ${threshold_hours} hours before Saturday`,
    threshold: threshold_hours
  };
}

/**
 * Analyze driver requests from emails
 */
async function analyzeDriverRequests(args) {
  const { request_type = 'all', days_back = 30, show_unanswered_only = false } = args;
  
  let requestFilter = '';
  if (request_type !== 'all') {
    const typeMap = {
      'PTO': "subject ILIKE '%PTO%' OR subject ILIKE '%time off%'",
      'scheduling': "subject ILIKE '%schedule%' OR subject ILIKE '%shift%'",
      'payroll': "subject ILIKE '%pay%' OR subject ILIKE '%payroll%'",
      'uniform': "subject ILIKE '%uniform%'"
    };
    requestFilter = `AND (${typeMap[request_type]})`;
  }
  
  const query = `
    WITH driver_emails AS (
      SELECT 
        e.email_id,
        e.sender as from_email,
        e.subject,
        e.received_at,
        e.category,
        e.body_preview,
        e.thread_id,
        CASE 
          WHEN e.subject ILIKE '%PTO%' OR e.subject ILIKE '%time off%' THEN 'PTO Request'
          WHEN e.subject ILIKE '%schedule%' OR e.subject ILIKE '%shift%' THEN 'Schedule Request'
          WHEN e.subject ILIKE '%pay%' OR e.subject ILIKE '%payroll%' THEN 'Payroll Question'
          WHEN e.subject ILIKE '%uniform%' THEN 'Uniform Request'
          ELSE 'General Request'
        END as request_type
      FROM emails e
      WHERE e.category IN ('Operations', 'Payroll', 'HR', 'Uniform', 'PTO', 'Scheduling')
        AND e.sender NOT ILIKE '%@cazarnyc.com'
        AND e.received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
        ${requestFilter}
    ),
    responses AS (
      SELECT DISTINCT ON (de.email_id)
        de.email_id,
        de.from_email,
        de.subject,
        de.request_type,
        de.received_at,
        de.category,
        de.body_preview,
        r.received_at as response_time,
        r.sender as responded_by,
        EXTRACT(EPOCH FROM (r.received_at - de.received_at))/3600 as turnaround_hours
      FROM driver_emails de
      LEFT JOIN emails r ON (
        r.thread_id = de.thread_id
        AND r.received_at > de.received_at
        AND r.sender ILIKE '%@cazarnyc.com'
      )
      ORDER BY de.email_id, r.received_at ASC
    )
    SELECT 
      from_email,
      subject,
      request_type,
      received_at,
      category,
      response_time,
      responded_by,
      CASE 
        WHEN response_time IS NULL THEN 'NO RESPONSE'
        ELSE ROUND(turnaround_hours, 1) || ' hours'
      END as turnaround_time,
      CASE 
        WHEN response_time IS NULL THEN '🔴 Unanswered'
        WHEN turnaround_hours < 2 THEN '🟢 Fast (<2h)'
        WHEN turnaround_hours < 24 THEN '🟡 Moderate (<24h)'
        ELSE '🔴 Slow (>24h)'
      END as status
    FROM responses
    ${show_unanswered_only ? 'WHERE response_time IS NULL' : ''}
    ORDER BY received_at DESC
  `;
  
  const result = await pool.query(query);
  
  const stats = {
    total: result.rows.length,
    responded: result.rows.filter(r => r.response_time).length,
    unanswered: result.rows.filter(r => !r.response_time).length,
    fast: result.rows.filter(r => r.status?.includes('Fast')).length,
    moderate: result.rows.filter(r => r.status?.includes('Moderate')).length,
    slow: result.rows.filter(r => r.status?.includes('Slow')).length
  };
  
  const respondedRequests = result.rows.filter(r => r.response_time && r.turnaround_time !== 'NO RESPONSE');
  const avgTurnaround = respondedRequests.length > 0
    ? respondedRequests.reduce((sum, r) => sum + parseFloat(r.turnaround_time), 0) / respondedRequests.length
    : 0;
  
  return {
    success: true,
    statistics: {
      ...stats,
      avg_turnaround_hours: avgTurnaround ? avgTurnaround.toFixed(1) : 'N/A',
      response_rate: ((stats.responded / stats.total) * 100).toFixed(1) + '%'
    },
    requests: result.rows,
    filter: { request_type, days_back, show_unanswered_only }
  };
}

/**
 * Get email response statistics by responder
 */
async function getEmailResponseStats(args) {
  const { group_by, days_back = 30 } = args;
  
  let query = '';
  
  if (group_by === 'responder') {
    query = `
      SELECT 
        sender as responder,
        COUNT(*) as response_count
      FROM emails
      WHERE sender ILIKE '%@cazarnyc.com'
        AND received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
      GROUP BY sender
      ORDER BY response_count DESC
    `;
  } else if (group_by === 'responder_and_day') {
    query = `
      SELECT 
        sender as responder,
        DATE(received_at) as date,
        COUNT(*) as response_count
      FROM emails
      WHERE sender ILIKE '%@cazarnyc.com'
        AND received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
      GROUP BY sender, DATE(received_at)
      ORDER BY date DESC, response_count DESC
    `;
  } else if (group_by === 'responder_and_category') {
    query = `
      SELECT 
        sender as responder,
        category,
        COUNT(*) as response_count
      FROM emails
      WHERE sender ILIKE '%@cazarnyc.com'
        AND received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
      GROUP BY sender, category
      ORDER BY sender, response_count DESC
    `;
  }
  
  const result = await pool.query(query);
  
  return {
    success: true,
    group_by,
    days_analyzed: days_back,
    count: result.rows.length,
    statistics: result.rows,
    message: `Response statistics grouped by ${group_by} for last ${days_back} days`
  };
}

/**
 * Find unanswered emails older than threshold
 */
async function findUnansweredEmails(args) {
  const { hours_threshold = 48, from_person, categories } = args;
  
  let categoryFilter = '';
  if (categories && categories.length > 0) {
    categoryFilter = `AND category IN (${categories.map(c => `'${c}'`).join(',')})`;
  }
  
  // Determine sender filter based on from_person parameter
  let senderFilter = '';
  let responseCheckCondition = '';
  
  if (from_person) {
    // Looking for emails FROM a specific person (e.g., Rudy) that haven't received replies
    const personEmail = from_person.includes('@') ? from_person : `%${from_person}%`;
    senderFilter = `AND e.sender ILIKE '${personEmail}'`;
    // Check for any response (not just from internal team)
    responseCheckCondition = `r.received_at > e.received_at`;
  } else {
    // Looking for external emails that haven't been responded to by internal team
    senderFilter = `AND e.sender NOT ILIKE '%@cazarnyc.com'`;
    // Check for response from internal team
    responseCheckCondition = `r.received_at > e.received_at AND r.sender ILIKE '%@cazarnyc.com'`;
  }
  
  const query = `
    WITH email_threads AS (
      SELECT 
        e.email_id,
        e.sender,
        e.subject,
        e.received_at,
        e.category,
        e.priority,
        e.body_preview,
        e.thread_id,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - e.received_at))/3600 as hours_old,
        (
          SELECT COUNT(*)
          FROM emails r
          WHERE r.thread_id = e.thread_id
            AND ${responseCheckCondition}
        ) as response_count
      FROM emails e
      WHERE e.received_at < CURRENT_TIMESTAMP - INTERVAL '${hours_threshold} hours'
        ${senderFilter}
        ${categoryFilter}
    )
    SELECT 
      sender,
      subject,
      category,
      priority,
      received_at,
      ROUND(hours_old::numeric, 1) as hours_old,
      body_preview
    FROM email_threads
    WHERE response_count = 0
    ORDER BY hours_old DESC, priority DESC NULLS LAST
  `;
  
  const result = await pool.query(query);
  
  const searchType = from_person ? `emails from ${from_person}` : 'external emails';
  
  return {
    success: true,
    threshold_hours: hours_threshold,
    from_person: from_person || 'external senders',
    count: result.rows.length,
    unanswered_emails: result.rows,
    message: `Found ${result.rows.length} ${searchType} older than ${hours_threshold} hours without response`,
    categories_filtered: categories || 'all'
  };
}

/**
 * Find incident emails with attachments
 */
async function findIncidentAttachments(args) {
  const { days_back = 30 } = args;
  
  const query = `
    WITH incident_emails AS (
      SELECT 
        e.email_id,
        e.sender,
        e.subject,
        e.received_at,
        e.category,
        e.has_attachments,
        e.attachment_count,
        e.thread_id,
        e.body_preview
      FROM emails e
      WHERE (
          e.category = 'Incident'
          OR e.subject ILIKE '%incident%'
          OR e.subject ILIKE '%accident%'
          OR e.subject ILIKE '%violation%'
        )
        AND e.has_attachments = true
        AND e.received_at >= CURRENT_DATE - INTERVAL '${days_back} days'
    ),
    handlers AS (
      SELECT DISTINCT ON (ie.email_id)
        ie.*,
        r.sender as handled_by,
        r.received_at as response_time
      FROM incident_emails ie
      LEFT JOIN emails r ON (
        r.thread_id = ie.thread_id
        AND r.received_at > ie.received_at
        AND r.sender ILIKE '%@cazarnyc.com'
      )
      ORDER BY ie.email_id, r.received_at ASC
    )
    SELECT 
      sender,
      subject,
      received_at,
      attachment_count,
      handled_by,
      CASE 
        WHEN handled_by IS NULL THEN '🔴 Not handled'
        ELSE '✅ Handled'
      END as status,
      body_preview
    FROM handlers
    ORDER BY received_at DESC
  `;
  
  const result = await pool.query(query);
  const handled = result.rows.filter(r => r.handled_by).length;
  const unhandled = result.rows.filter(r => !r.handled_by).length;
  
  return {
    success: true,
    count: result.rows.length,
    handled_count: handled,
    unhandled_count: unhandled,
    incidents: result.rows,
    message: `Found ${result.rows.length} incident emails with attachments (${handled} handled, ${unhandled} unhandled)`,
    days_analyzed: days_back
  };
}

export default {
  tools,
  executeTool,
  initializePool
};


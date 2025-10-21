/**
 * Smart Agent Tools - Function Calling for Multi-Step Reasoning
 * 
 * This module provides tool definitions for OpenAI function calling,
 * enabling the agent to execute multiple steps, query databases,
 * perform calculations, and reason through complex problems.
 */

import pg from 'pg';

// Database connection pool
let pool = null;

export function initializePool(connectionString) {
  if (!pool) {
    pool = new pg.Pool({ 
      connectionString, 
      ssl: { rejectUnauthorized: false } 
    });
  }
  return pool;
}

// ============================================================================
// TOOL DEFINITIONS for OpenAI Function Calling
// ============================================================================

export const tools = [
  {
    type: "function",
    function: {
      name: "query_database",
      description: "Execute a SQL query against the PostgreSQL database. Use this to retrieve employee data, timecards, violations, breaks, schedules, or any other operational data. Returns rows of data.",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "The SQL query to execute. Can include JOINs, WHERE clauses, aggregations, CTEs, etc. Always use proper SQL syntax for PostgreSQL."
          },
          explanation: {
            type: "string",
            description: "Brief explanation of what this query is trying to find or calculate"
          }
        },
        required: ["sql", "explanation"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform mathematical calculations, data analysis, or statistical operations. Use for computing percentages, averages, totals, comparisons, etc.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            description: "Description of the calculation to perform"
          },
          values: {
            type: "object",
            description: "Key-value pairs of numbers or data to use in calculation",
            additionalProperties: true
          }
        },
        required: ["operation", "values"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_compliance",
      description: "Analyze compliance violations, HOS rules, break requirements, or safety metrics. Checks data against regulatory requirements.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["break_violations", "hos_violations", "safety_violations", "schedule_compliance"],
            description: "Type of compliance analysis to perform"
          },
          date_range: {
            type: "object",
            properties: {
              start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
              end_date: { type: "string", description: "End date (YYYY-MM-DD)" }
            }
          },
          driver_id: {
            type: "string",
            description: "Optional: Specific driver ID to analyze"
          }
        },
        required: ["type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_employees",
      description: "Search for employees/drivers by name, ID, status, department, or other criteria. Returns matching employee records.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "Name, ID, or other search criteria"
          },
          filters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["active", "inactive", "terminated"] },
              department: { type: "string" },
              hired_after: { type: "string" },
              hired_before: { type: "string" }
            }
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
            default: 10
          }
        },
        required: ["search_term"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_statistics",
      description: "Get aggregate statistics and metrics about employees, operations, compliance, or performance. Returns summary data.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["employees", "timecards", "violations", "breaks", "hours", "performance"],
            description: "Category of statistics to retrieve"
          },
          groupBy: {
            type: "string",
            description: "Optional: Group results by field (e.g., 'department', 'status', 'date')"
          },
          dateRange: {
            type: "object",
            properties: {
              start: { type: "string" },
              end: { type: "string" }
            }
          }
        },
        required: ["category"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_data",
      description: "Compare two sets of data, time periods, drivers, departments, or metrics. Identifies differences, trends, and changes.",
      parameters: {
        type: "object",
        properties: {
          comparison_type: {
            type: "string",
            description: "What to compare (e.g., 'week_over_week', 'driver_vs_driver', 'department_performance')"
          },
          dataset_a: {
            type: "object",
            description: "First dataset or criteria"
          },
          dataset_b: {
            type: "object",
            description: "Second dataset or criteria"
          }
        },
        required: ["comparison_type", "dataset_a", "dataset_b"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate a formatted report summarizing findings, analysis, or data. Creates structured output with sections, tables, and insights.",
      parameters: {
        type: "object",
        properties: {
          report_type: {
            type: "string",
            enum: ["compliance", "performance", "violations", "employee_summary", "custom"],
            description: "Type of report to generate"
          },
          data: {
            type: "object",
            description: "Data to include in report"
          },
          include_sections: {
            type: "array",
            items: { type: "string" },
            description: "Sections to include (e.g., 'summary', 'details', 'recommendations')"
          }
        },
        required: ["report_type", "data"]
      }
    }
  }
];

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

export async function queryDatabase(sql, explanation) {
  console.log(`[Tool: query_database] ${explanation}`);
  console.log(`[SQL] ${sql}`);
  
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    console.log(`[Result] ${result.rows.length} rows returned`);
    return {
      success: true,
      rows: result.rows,
      rowCount: result.rows.length,
      explanation
    };
  } catch (error) {
    console.error(`[Tool Error] ${error.message}`);
    return {
      success: false,
      error: error.message,
      explanation
    };
  } finally {
    client.release();
  }
}

export async function calculate(operation, values) {
  console.log(`[Tool: calculate] ${operation}`);
  console.log(`[Values]`, values);
  
  try {
    // Perform the calculation based on operation description
    let result;
    
    // Common calculations
    if (operation.toLowerCase().includes('percentage') || operation.toLowerCase().includes('percent')) {
      const { numerator, denominator } = values;
      result = denominator > 0 ? (numerator / denominator * 100).toFixed(2) : 0;
    } else if (operation.toLowerCase().includes('average') || operation.toLowerCase().includes('mean')) {
      const nums = Object.values(values).filter(v => typeof v === 'number');
      result = nums.reduce((a, b) => a + b, 0) / nums.length;
    } else if (operation.toLowerCase().includes('sum') || operation.toLowerCase().includes('total')) {
      result = Object.values(values).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
    } else if (operation.toLowerCase().includes('difference') || operation.toLowerCase().includes('delta')) {
      const vals = Object.values(values).filter(v => typeof v === 'number');
      result = vals[0] - vals[1];
    } else {
      // Generic calculation - return the values
      result = values;
    }
    
    return {
      success: true,
      result,
      operation,
      values
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      operation
    };
  }
}

export async function analyzeCompliance(type, date_range = {}, driver_id = null) {
  console.log(`[Tool: analyze_compliance] Type: ${type}`);
  
  const client = await pool.connect();
  try {
    let sql = '';
    
    switch (type) {
      case 'break_violations':
        sql = `
          WITH driver_days AS (
            SELECT 
              driver_id,
              DATE(start_utc) as work_date,
              SUM(minutes) as total_minutes
            FROM on_duty_segments
            WHERE duty_type = 'worked'
            ${driver_id ? `AND driver_id = '${driver_id}'` : ''}
            ${date_range.start_date ? `AND DATE(start_utc) >= '${date_range.start_date}'` : ''}
            ${date_range.end_date ? `AND DATE(start_utc) <= '${date_range.end_date}'` : ''}
            GROUP BY driver_id, DATE(start_utc)
            HAVING SUM(minutes) >= 360
          ),
          breaks_by_day AS (
            SELECT 
              driver_id,
              DATE(start_utc) as work_date,
              COUNT(*) as break_count,
              SUM(minutes) as total_break_minutes
            FROM break_segments
            GROUP BY driver_id, DATE(start_utc)
          )
          SELECT 
            dd.driver_id,
            d.driver_name,
            dd.work_date,
            dd.total_minutes,
            COALESCE(bb.break_count, 0) as break_count,
            COALESCE(bb.total_break_minutes, 0) as break_minutes
          FROM driver_days dd
          LEFT JOIN drivers d ON d.driver_id = dd.driver_id
          LEFT JOIN breaks_by_day bb ON bb.driver_id = dd.driver_id AND bb.work_date = dd.work_date
          WHERE COALESCE(bb.break_count, 0) = 0
          ORDER BY dd.work_date DESC, dd.total_minutes DESC
        `;
        break;
        
      case 'hos_violations':
        sql = `
          SELECT 
            driver_id,
            as_of_utc,
            hours_used,
            hours_available,
            hos_limit
          FROM hos_rollups_7d
          WHERE hours_available < 5
          ORDER BY hours_available ASC
          LIMIT 50
        `;
        break;
        
      default:
        return { success: false, error: `Unknown compliance type: ${type}` };
    }
    
    const result = await client.query(sql);
    
    return {
      success: true,
      type,
      violations: result.rows,
      count: result.rows.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      type
    };
  } finally {
    client.release();
  }
}

export async function searchEmployees(search_term, filters = {}, limit = 10) {
  console.log(`[Tool: search_employees] Term: "${search_term}"`);
  
  const client = await pool.connect();
  try {
    const conditions = [`(driver_name ILIKE $1 OR driver_id ILIKE $1)`];
    const params = [`%${search_term}%`];
    let paramCount = 1;
    
    if (filters.status) {
      paramCount++;
      conditions.push(`driver_status = $${paramCount}`);
      params.push(filters.status);
    }
    
    if (filters.department) {
      paramCount++;
      conditions.push(`department ILIKE $${paramCount}`);
      params.push(`%${filters.department}%`);
    }
    
    if (filters.hired_after) {
      paramCount++;
      conditions.push(`hire_date >= $${paramCount}`);
      params.push(filters.hired_after);
    }
    
    const sql = `
      SELECT driver_id, driver_name, driver_status, employment_status, hire_date, department, job_title
      FROM drivers
      WHERE ${conditions.join(' AND ')}
      ORDER BY driver_name
      LIMIT $${paramCount + 1}
    `;
    params.push(limit);
    
    const result = await client.query(sql, params);
    
    return {
      success: true,
      employees: result.rows,
      count: result.rows.length,
      search_term
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      search_term
    };
  } finally {
    client.release();
  }
}

export async function getStatistics(category, groupBy = null, dateRange = {}) {
  console.log(`[Tool: get_statistics] Category: ${category}`);
  
  const client = await pool.connect();
  try {
    let sql = '';
    
    switch (category) {
      case 'employees':
        sql = `
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE driver_status = 'active') as active,
            COUNT(*) FILTER (WHERE driver_status = 'inactive') as inactive,
            COUNT(*) FILTER (WHERE employment_status = 'terminated') as terminated
          FROM drivers
        `;
        break;
        
      case 'violations':
        sql = `
          SELECT 
            COUNT(*) as total_violations,
            COUNT(DISTINCT driver_id) as drivers_with_violations,
            severity,
            COUNT(*) as count
          FROM driver_violations
          GROUP BY severity
        `;
        break;
        
      case 'breaks':
        sql = `
          SELECT 
            COUNT(*) as total_breaks,
            AVG(minutes) as avg_break_minutes,
            MIN(minutes) as min_break_minutes,
            MAX(minutes) as max_break_minutes,
            COUNT(DISTINCT driver_id) as drivers_with_breaks
          FROM break_segments
        `;
        break;
        
      default:
        sql = `SELECT COUNT(*) as count FROM drivers`;
    }
    
    const result = await client.query(sql);
    
    return {
      success: true,
      category,
      statistics: result.rows,
      groupBy
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      category
    };
  } finally {
    client.release();
  }
}

export async function compareData(comparison_type, dataset_a, dataset_b) {
  console.log(`[Tool: compare_data] Type: ${comparison_type}`);
  
  return {
    success: true,
    comparison_type,
    dataset_a,
    dataset_b,
    differences: {
      summary: `Comparison of ${comparison_type}`,
      details: "Comparison logic would analyze differences here"
    }
  };
}

export async function generateReport(report_type, data, include_sections = ['summary', 'details']) {
  console.log(`[Tool: generate_report] Type: ${report_type}`);
  
  const report = {
    type: report_type,
    generated_at: new Date().toISOString(),
    sections: {}
  };
  
  if (include_sections.includes('summary')) {
    report.sections.summary = `Summary of ${report_type} report`;
  }
  
  if (include_sections.includes('details')) {
    report.sections.details = data;
  }
  
  if (include_sections.includes('recommendations')) {
    report.sections.recommendations = "Generated recommendations would appear here";
  }
  
  return {
    success: true,
    report
  };
}

// ============================================================================
// TOOL EXECUTOR - Routes function calls to implementations
// ============================================================================

export async function executeTool(toolName, args) {
  console.log(`\n🔧 Executing tool: ${toolName}`);
  console.log(`📋 Arguments:`, JSON.stringify(args, null, 2));
  
  switch (toolName) {
    case 'query_database':
      return await queryDatabase(args.sql, args.explanation);
      
    case 'calculate':
      return await calculate(args.operation, args.values);
      
    case 'analyze_compliance':
      return await analyzeCompliance(args.type, args.date_range, args.driver_id);
      
    case 'search_employees':
      return await searchEmployees(args.search_term, args.filters, args.limit);
      
    case 'get_statistics':
      return await getStatistics(args.category, args.groupBy, args.dateRange);
      
    case 'compare_data':
      return await compareData(args.comparison_type, args.dataset_a, args.dataset_b);
      
    case 'generate_report':
      return await generateReport(args.report_type, args.data, args.include_sections);
      
    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
  }
}


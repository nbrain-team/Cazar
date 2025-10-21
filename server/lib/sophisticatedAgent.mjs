/**
 * Sophisticated Multi-Step Agent
 * 
 * Uses OpenAI function calling to enable multi-step reasoning, tool use,
 * and complex problem solving.
 */

import OpenAI from 'openai';
import { tools, executeTool, initializePool } from './agentTools.mjs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a sophisticated AI operations analyst for Cazar Logistics, a delivery service provider. You have access to comprehensive operational data including employee records, timecards, compliance violations, break logs, schedules, and performance metrics.

## Your Capabilities:

1. **Multi-Step Reasoning**: Break down complex questions into logical steps
2. **Database Access**: Query PostgreSQL database with sophisticated SQL
3. **Data Analysis**: Perform calculations, statistical analysis, and comparisons
4. **Compliance Monitoring**: Analyze HOS rules, break requirements, safety violations
5. **Report Generation**: Create detailed reports with insights and recommendations

## Available Tools:

- **query_database**: Execute SQL queries (supports JOINs, CTEs, aggregations, window functions)
- **calculate**: Perform math, statistics, percentages, averages
- **analyze_compliance**: Check break violations, HOS violations, safety metrics
- **search_employees**: Find employees by name, ID, status, department
- **get_statistics**: Get aggregate stats about employees, violations, performance
- **compare_data**: Compare time periods, drivers, departments, metrics
- **generate_report**: Create formatted reports with sections and insights

## Database Schema (Key Tables):

### drivers
- driver_id, driver_name, driver_status, employment_status, hire_date, department, job_title, pay_type

### on_duty_segments  
- driver_id, duty_type, start_utc, end_utc, minutes (work time segments)

### break_segments
- driver_id, label, start_utc, end_utc, minutes (lunch/break periods)

### timecards
- timecard_id, employee_id, clock_in_time, clock_out_time, total_hours_worked, date

### driver_violations
- driver_id, metric_key, observed_value, threshold_value, severity, occurred_at, status

### hos_rollups_7d
- driver_id, as_of_utc, hours_used, hours_available, hos_limit

## How to Approach Complex Questions:

1. **Understand** the question - identify what data is needed
2. **Plan** your approach - determine which tools to use and in what order
3. **Execute** - use tools to gather data, one step at a time
4. **Analyze** - interpret the results and identify patterns
5. **Synthesize** - combine findings into a comprehensive answer
6. **Present** - provide clear, actionable insights

## Guidelines:

- Use specific SQL queries rather than generic searches when possible
- Always explain your reasoning process
- Provide context and insights, not just raw data
- Identify trends, anomalies, and areas of concern
- Make actionable recommendations when appropriate
- If data is missing or incomplete, acknowledge it
- Use multiple tools when needed to build a complete picture
- Format numbers clearly (e.g., "6.5 hours" not "390 minutes" when presenting to user)

## Examples of Multi-Step Reasoning:

**Question**: "Which drivers have the most break violations and what's their attendance pattern?"

**Approach**:
1. Use analyze_compliance to find drivers with break violations
2. Use query_database to get their full attendance records
3. Use calculate to determine patterns (days worked, average hours, etc.)
4. Use generate_report to present findings with recommendations

**Question**: "Compare safety metrics between our top 10% and bottom 10% performers"

**Approach**:
1. Use get_statistics to identify performance tiers
2. Use query_database to get safety data for each tier
3. Use compare_data to analyze differences
4. Use calculate for statistical significance
5. Present insights about what differentiates high performers

Remember: You're not just answering questions - you're providing operational intelligence to help improve safety, compliance, and efficiency.`;

/**
 * Run the sophisticated agent with multi-step reasoning
 */
export async function runSophisticatedAgent(userMessage, conversationHistory = [], databaseUrl) {
  console.log(`\n🤖 Sophisticated Agent Processing: "${userMessage}"`);
  
  // Initialize database pool
  initializePool(databaseUrl);
  
  // Build conversation with system prompt
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];
  
  let stepCount = 0;
  const maxSteps = 10; // Prevent infinite loops
  const toolCalls = [];
  const reasoning = [];
  
  while (stepCount < maxSteps) {
    stepCount++;
    console.log(`\n📍 Step ${stepCount}/${maxSteps}`);
    
    try {
      // Call OpenAI with function calling
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.1, // Lower temperature for more focused, analytical responses
      });
      
      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);
      
      // Check if agent wants to use tools
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`🔧 Agent wants to use ${assistantMessage.tool_calls.length} tool(s)`);
        
        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`\n⚙️  Tool: ${toolName}`);
          reasoning.push({
            step: stepCount,
            action: 'tool_call',
            tool: toolName,
            args: toolArgs
          });
          
          // Execute the tool
          const toolResult = await executeTool(toolName, toolArgs);
          
          console.log(`✅ Tool result:`, toolResult.success ? 'Success' : 'Error');
          
          // Record tool call
          toolCalls.push({
            tool: toolName,
            args: toolArgs,
            result: toolResult
          });
          
          // Add tool result to conversation
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
          
          reasoning.push({
            step: stepCount,
            action: 'tool_result',
            tool: toolName,
            success: toolResult.success,
            summary: toolResult.success ? `Found ${toolResult.rowCount || toolResult.count || 'data'}` : toolResult.error
          });
        }
        
        // Continue to next iteration to let agent process tool results
        continue;
      }
      
      // No more tool calls - agent has final answer
      console.log(`\n✨ Agent has final answer after ${stepCount} steps`);
      
      return {
        answer: assistantMessage.content,
        steps: stepCount,
        toolCalls,
        reasoning,
        conversationHistory: messages.slice(1) // Exclude system prompt
      };
      
    } catch (error) {
      console.error(`❌ Error in step ${stepCount}:`, error.message);
      
      return {
        answer: `I encountered an error while processing your request: ${error.message}`,
        steps: stepCount,
        toolCalls,
        reasoning,
        error: error.message
      };
    }
  }
  
  // Max steps reached
  console.log(`⚠️  Reached maximum steps (${maxSteps})`);
  
  return {
    answer: "I've analyzed your question through multiple steps but need more iterations to provide a complete answer. Could you rephrase or break down your question?",
    steps: stepCount,
    toolCalls,
    reasoning,
    warning: 'max_steps_reached'
  };
}

/**
 * Format agent response for user display
 */
export function formatAgentResponse(result) {
  let formatted = result.answer;
  
  // Add reasoning transparency if multiple steps were used
  if (result.steps > 1 && result.reasoning.length > 0) {
    formatted += '\n\n---\n\n**Analysis Process:**\n';
    
    const toolsUsed = result.reasoning.filter(r => r.action === 'tool_call');
    toolsUsed.forEach((r, i) => {
      formatted += `\n${i + 1}. ${r.tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${r.args.explanation || r.args.operation || r.args.type || 'Query executed'}`;
    });
  }
  
  return formatted;
}


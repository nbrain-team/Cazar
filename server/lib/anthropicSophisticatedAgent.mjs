/**
 * Anthropic Sophisticated Agent
 * Multi-step reasoning agent using Anthropic's tool use API
 * Handles complex queries across all data sources: emails, calendar, Teams, ADP, vector DB, web
 */

import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool, initializePool } from './anthropicAgentTools.mjs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022'; // Fast and intelligent

const SYSTEM_PROMPT = `You are a sophisticated AI operations analyst for Cazar Logistics. You have access to comprehensive data across multiple systems through specialized tools.

## Your Capabilities:

1. **Multi-Step Reasoning**: Break down complex questions into logical steps
2. **Cross-System Analysis**: Query emails, calendar, Teams, ADP payroll, operations database
3. **Data Synthesis**: Combine information from multiple sources
4. **Trend Analysis**: Compare time periods and identify patterns
5. **Actionable Insights**: Extract priorities and action items across all communications

## Available Tools:

### Communication Tools:
- **query_emails**: Search email analytics (categories, priorities, requests, responses)
- **query_calendar**: Search calendar events (meetings, schedules, deadlines)
- **query_teams**: Search Teams messages (discussions, decisions, updates)

### Data Tools:
- **query_operations_db**: Query drivers, timecards, violations, compliance data
- **query_adp_payroll**: Query ADP for employee data, hires, workforce info

### Knowledge Tools:
- **search_vector_database**: Semantic search in knowledge base (policies, procedures, docs)
- **search_web**: Search web for compliance/regulatory information

### Analysis Tools:
- **analyze_priorities**: Synthesize priorities across all sources for a person
- **compare_time_periods**: Compare metrics between time periods
- **extract_action_items**: Find all action items from communications

## How to Approach Questions:

1. **Understand** - Identify what data sources are needed
2. **Plan** - Determine which tools to use and in what order
3. **Execute** - Use tools systematically to gather data
4. **Analyze** - Interpret results and identify patterns
5. **Synthesize** - Combine findings into comprehensive answer
6. **Present** - Provide clear, actionable insights

## Guidelines:

- Use the most specific tool for each data need
- Don't make assumptions - query the actual data
- For "priorities" questions, use analyze_priorities tool (queries all sources)
- For comparisons, use compare_time_periods or query each period separately
- **ALWAYS present tabular data in markdown tables with proper columns**
- For driver queries, ALWAYS include: Driver Name, Hours/Days, Status, and relevant metrics
- Use emojis for status indicators (✅ OK, ⚠️ WARNING, 🚨 CRITICAL, ❌ VIOLATION)
- Highlight high-priority and urgent items
- Extract concrete action items
- Be thorough but concise
- Make outputs ACTIONABLE - include all relevant data in tables

## Examples:

**Question**: "What are Rudy's priorities based on recent emails, meetings, and Teams?"

**Approach**:
1. Use analyze_priorities({person: 'Rudy', time_period: 'this_week', sources: ['emails', 'calendar', 'teams']})
2. Review the synthesized results
3. Present organized summary with categories and urgency

**Question**: "Compare this week's email volume to last week"

**Approach**:
1. Use query_emails({days_back: 7}) for this week
2. Use query_emails({days_back: 14, limit: 100}) for both weeks, filter for last week
3. Compare counts and categories
4. Identify trends

Remember: You're providing operational intelligence to help leadership make informed decisions.`;

/**
 * Run the Anthropic sophisticated agent with tool use
 */
export async function runAnthropicAgent(userMessage, conversationHistory = [], databaseUrl) {
  console.log(`\n🧠 [Anthropic Agent] Processing: "${userMessage}"`);
  
  // Initialize database pool
  initializePool(databaseUrl);
  
  // Build conversation messages
  // Filter out any tool use messages from conversation history (only keep user/assistant text)
  const cleanHistory = conversationHistory.filter(msg => {
    if (!msg.content) return false;
    // Only keep messages with simple text content
    if (typeof msg.content === 'string') return true;
    // Skip tool result messages from history
    if (Array.isArray(msg.content)) return false;
    return true;
  });
  
  const messages = [
    ...cleanHistory,
    { role: 'user', content: userMessage }
  ];
  
  let stepCount = 0;
  const maxSteps = 15; // Allow more steps for complex multi-source queries
  const toolCalls = [];
  const reasoning = [];
  
  while (stepCount < maxSteps) {
    stepCount++;
    console.log(`\n📍 Step ${stepCount}/${maxSteps}`);
    
    try {
      // Call Anthropic with tool use
      const response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools,
        temperature: 0.1 // Lower temperature for focused, analytical responses
      });
      
      console.log(`   Stop reason: ${response.stop_reason}`);
      
      // Check if Claude wants to use tools
      if (response.stop_reason === 'tool_use') {
        // Find all tool use blocks in the response
        const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
        
        console.log(`   Tools requested: ${toolUseBlocks.length}`);
        
        // Execute all tool calls
        const toolResults = [];
        
        for (const toolBlock of toolUseBlocks) {
          const toolName = toolBlock.name;
          const toolInput = toolBlock.input;
          const toolUseId = toolBlock.id;
          
          console.log(`   🔧 Using tool: ${toolName}`);
          reasoning.push({
            step: stepCount,
            action: 'tool_call',
            tool: toolName,
            args: toolInput
          });
          
          // Execute the tool
          const result = await executeTool(toolName, toolInput);
          
          console.log(`   ✓ Tool result: ${result.success ? 'Success' : 'Failed'}`);
          if (result.success) {
            console.log(`     ${result.query_summary || result.count || 'Completed'}`);
          }
          
          toolCalls.push({
            tool: toolName,
            args: toolInput,
            result
          });
          
          // Build tool result for Claude
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: JSON.stringify(result, null, 2)
          });
        }
        
        // Add assistant message with tool uses
        messages.push({
          role: 'assistant',
          content: response.content
        });
        
        // Add tool results as user message
        messages.push({
          role: 'user',
          content: toolResults
        });
        
        reasoning.push({
          step: stepCount,
          action: 'tool_results',
          count: toolResults.length
        });
        
        continue; // Continue the loop to let Claude process tool results
      }
      
      // Check for end_turn (Claude has final answer)
      if (response.stop_reason === 'end_turn') {
        console.log(`\n✨ Agent has final answer after ${stepCount} steps`);
        
        // Extract text content from response
        const textContent = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
        
        // Build clean conversation history for frontend (only user/assistant text exchanges)
        const cleanConversationHistory = [];
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          // Skip tool result messages
          if (msg.role === 'user' && Array.isArray(msg.content)) continue;
          // Only keep text content
          if (msg.role === 'user' && typeof msg.content === 'string') {
            cleanConversationHistory.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            // Extract text from assistant message
            const textParts = msg.content.filter(block => block.type === 'text').map(block => block.text);
            if (textParts.length > 0) {
              cleanConversationHistory.push({ role: 'assistant', content: textParts.join('\n') });
            }
          }
        }
        
        return {
          answer: textContent,
          steps: stepCount,
          toolCalls,
          reasoning,
          conversationHistory: cleanConversationHistory
        };
      }
      
      // Other stop reasons (max_tokens, etc.)
      console.log(`\n⚠️  Unexpected stop reason: ${response.stop_reason}`);
      
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
      
      return {
        answer: textContent || `Analysis incomplete (stop reason: ${response.stop_reason})`,
        steps: stepCount,
        toolCalls,
        reasoning,
        warning: `unexpected_stop_reason: ${response.stop_reason}`
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
    answer: "I've analyzed your question through multiple steps but need more iterations. The question may be too complex, or you could try breaking it down into smaller parts.",
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
  
  // Add transparency about process if multiple steps
  if (result.steps > 1 && result.toolCalls.length > 0) {
    formatted += '\n\n---\n\n**Analysis Process:**\n';
    
    result.toolCalls.forEach((call, i) => {
      const toolName = call.tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const summary = call.result.query_summary || call.result.count || 'Executed';
      formatted += `\n${i + 1}. **${toolName}**: ${summary}`;
    });
    
    formatted += `\n\n*Completed in ${result.steps} analytical steps*`;
  }
  
  return formatted;
}

export default {
  runAnthropicAgent,
  formatAgentResponse
};


import { analyzeEmailWithClaude, analyzeEmailThread } from './claudeEmailService.mjs';
import { fetchAllRecentEmails, fetchEmailThread, fetchEmailAttachments } from './emailFetchService.mjs';
import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

/**
 * Process and store a single email
 * @param {Object} email - Email from Microsoft Graph
 * @param {Object} pool - Database connection pool
 */
export async function processAndStoreEmail(email, dbPool = pool) {
  try {
    // Check if email already exists
    const existing = await dbPool.query(
      'SELECT id FROM email_analytics WHERE message_id = $1',
      [email.id]
    );
    
    if (existing.rows.length > 0) {
      console.log(`[Email Sync] Email ${email.id} already exists, skipping`);
      return { skipped: true, id: existing.rows[0].id };
    }
    
    // Analyze email with Claude
    console.log(`[Email Sync] Analyzing email: ${email.subject}`);
    const analysis = await analyzeEmailWithClaude(email);
    
    // Extract attachment info
    const attachmentTypes = [];
    const attachmentNames = [];
    if (email.hasAttachments) {
      // Note: Would need to fetch attachments separately if needed
      attachmentTypes.push('unknown');
    }
    
    // Determine if email is internal
    const companyDomains = ['cazarnyc.com', 'cazar.com']; // Add your domains
    const fromDomain = email.from?.emailAddress?.address?.split('@')[1];
    const isInternal = companyDomains.includes(fromDomain);
    
    // Extract email addresses
    const toEmails = email.toRecipients?.map(r => r.emailAddress?.address) || [];
    const ccEmails = email.ccRecipients?.map(r => r.emailAddress?.address) || [];
    
    // Insert into database
    const insertQuery = `
      INSERT INTO email_analytics (
        message_id, thread_id, conversation_id,
        from_email, from_name, to_emails, cc_emails,
        subject, body_preview, body_content, received_date, sent_date,
        category, sub_category, request_type,
        is_request, is_response, is_forward, is_internal,
        has_attachment, attachment_count, attachment_types, attachment_names,
        is_incident_related,
        status, priority, sentiment, urgency,
        key_entities, action_items, topics, mentioned_drivers,
        ai_summary, ai_confidence,
        requires_action,
        processed_at, last_analyzed_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24,
        $25, $26, $27, $28,
        $29, $30, $31, $32,
        $33, $34,
        $35,
        NOW(), NOW()
      ) RETURNING id
    `;
    
    const values = [
      email.id,
      email.conversationId,
      email.conversationId,
      email.from?.emailAddress?.address,
      email.from?.emailAddress?.name,
      toEmails,
      ccEmails,
      email.subject,
      email.bodyPreview,
      email.body?.content || email.bodyPreview,
      email.receivedDateTime,
      email.sentDateTime,
      analysis.category,
      analysis.sub_category,
      analysis.request_type,
      analysis.is_request,
      analysis.is_response,
      analysis.is_forward,
      isInternal,
      email.hasAttachments,
      email.hasAttachments ? 1 : 0,
      attachmentTypes,
      attachmentNames,
      analysis.is_incident_related,
      analysis.is_request && !analysis.is_response ? 'pending' : 'processed',
      analysis.priority,
      analysis.sentiment,
      analysis.urgency,
      analysis.key_entities,
      analysis.action_items,
      analysis.topics,
      analysis.mentioned_drivers,
      analysis.ai_summary,
      analysis.ai_confidence,
      analysis.requires_action
    ];
    
    const result = await dbPool.query(insertQuery, values);
    
    console.log(`[Email Sync] Stored email ${email.id} (DB ID: ${result.rows[0].id})`);
    
    return {
      success: true,
      id: result.rows[0].id,
      messageId: email.id,
      analysis
    };
    
  } catch (error) {
    console.error(`[Email Sync] Error processing email ${email.id}:`, error);
    return {
      success: false,
      error: error.message,
      messageId: email.id
    };
  }
}

/**
 * Link responses to their original requests
 * @param {Object} dbPool - Database connection pool
 */
export async function linkResponsesToRequests(dbPool = pool) {
  try {
    // Find emails in the same conversation
    const linkQuery = `
      WITH conversation_emails AS (
        SELECT 
          id,
          message_id,
          conversation_id,
          received_date,
          is_request,
          is_response,
          from_email
        FROM email_analytics
        WHERE conversation_id IS NOT NULL
          AND parent_message_id IS NULL
      ),
      request_response_pairs AS (
        SELECT 
          req.message_id as request_id,
          resp.message_id as response_id,
          resp.from_email as responded_by,
          EXTRACT(EPOCH FROM (resp.received_date - req.received_date))/3600 as hours_diff
        FROM conversation_emails req
        JOIN conversation_emails resp 
          ON req.conversation_id = resp.conversation_id
        WHERE req.is_request = true
          AND resp.is_response = true
          AND resp.received_date > req.received_date
          AND resp.from_email != req.from_email
      )
      UPDATE email_analytics e
      SET 
        parent_message_id = p.request_id,
        response_to_message_id = p.response_id,
        responded_by = p.responded_by,
        response_time_hours = p.hours_diff,
        status = 'responded',
        updated_at = NOW()
      FROM request_response_pairs p
      WHERE e.message_id = p.request_id
        AND e.response_to_message_id IS NULL
      RETURNING e.id;
    `;
    
    const result = await dbPool.query(linkQuery);
    console.log(`[Email Sync] Linked ${result.rowCount} responses to requests`);
    
    return result.rowCount;
    
  } catch (error) {
    console.error('[Email Sync] Error linking responses:', error);
    return 0;
  }
}

/**
 * Sync emails from Microsoft Graph to database
 * @param {Object} options - Sync options
 */
export async function syncEmails(options = {}) {
  const {
    hoursBack = 720, // 30 days default
    maxPerMailbox = 500,
    processThreads = false
  } = options;
  
  const daysBack = Math.ceil(hoursBack / 24);
  
  console.log(`[Email Sync] ========================================`);
  console.log(`[Email Sync] Starting email sync for ${daysBack} days`);
  console.log(`[Email Sync] ========================================`);
  
  const overallResults = {
    processed: 0,
    skipped: 0,
    errors: 0,
    dayResults: []
  };
  
  try {
    // Process one day at a time
    for (let day = 0; day < daysBack; day++) {
      const dayStart = day * 24;
      const dayEnd = (day + 1) * 24;
      const dayDate = new Date(Date.now() - dayStart * 60 * 60 * 1000);
      
      console.log(`\n[Email Sync] ========================================`);
      console.log(`[Email Sync] Day ${day + 1}/${daysBack}: ${dayDate.toLocaleDateString()}`);
      console.log(`[Email Sync] ========================================`);
      
      try {
        // Fetch emails for this day only
        const emails = await fetchAllRecentEmails({ 
          hoursBack: dayEnd, 
          maxPerMailbox: maxPerMailbox 
        });
        
        // Filter to only this day's emails
        const dayStartTime = Date.now() - dayEnd * 60 * 60 * 1000;
        const dayEndTime = Date.now() - dayStart * 60 * 60 * 1000;
        
        const dayEmails = emails.filter(email => {
          const emailTime = new Date(email.receivedDateTime).getTime();
          return emailTime >= dayStartTime && emailTime < dayEndTime;
        });
        
        console.log(`[Email Sync] Found ${dayEmails.length} emails for this day`);
        
        if (dayEmails.length === 0) {
          console.log(`[Email Sync] No emails for this day - skipping`);
          overallResults.dayResults.push({
            day: day + 1,
            date: dayDate.toLocaleDateString(),
            processed: 0,
            skipped: 0,
            errors: 0
          });
          continue;
        }
        
        // Process each email for this day
        let dayProcessed = 0;
        let daySkipped = 0;
        let dayErrors = 0;
        
        for (const email of dayEmails) {
          const result = await processAndStoreEmail(email);
          
          if (result.skipped) {
            daySkipped++;
          } else if (result.success) {
            dayProcessed++;
            // Log every 10 emails
            if (dayProcessed % 10 === 0) {
              console.log(`[Email Sync]   Processed ${dayProcessed}/${dayEmails.length} emails...`);
            }
          } else {
            dayErrors++;
          }
          
          // Small delay to avoid rate limiting Claude API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Day summary
        console.log(`[Email Sync] Day ${day + 1} complete: ✅ ${dayProcessed} processed, ⏭️  ${daySkipped} skipped, ❌ ${dayErrors} errors`);
        
        overallResults.processed += dayProcessed;
        overallResults.skipped += daySkipped;
        overallResults.errors += dayErrors;
        overallResults.dayResults.push({
          day: day + 1,
          date: dayDate.toLocaleDateString(),
          processed: dayProcessed,
          skipped: daySkipped,
          errors: dayErrors
        });
        
      } catch (dayError) {
        console.error(`[Email Sync] Error processing day ${day + 1}:`, dayError.message);
        overallResults.dayResults.push({
          day: day + 1,
          date: dayDate.toLocaleDateString(),
          processed: 0,
          skipped: 0,
          errors: 1,
          error: dayError.message
        });
      }
    }
    
    // Link responses to requests after all days processed
    console.log(`\n[Email Sync] ========================================`);
    console.log(`[Email Sync] Linking responses to requests...`);
    const linkedCount = await linkResponsesToRequests();
    console.log(`[Email Sync] Linked ${linkedCount} responses to requests`);
    
    // Final summary
    console.log(`\n[Email Sync] ========================================`);
    console.log(`[Email Sync] SYNC COMPLETE`);
    console.log(`[Email Sync] ========================================`);
    console.log(`[Email Sync] Total: ✅ ${overallResults.processed} processed, ⏭️  ${overallResults.skipped} skipped, ❌ ${overallResults.errors} errors`);
    console.log(`[Email Sync] Days synced: ${daysBack}`);
    console.log(`[Email Sync] ========================================\n`);
    
    return {
      success: true,
      ...overallResults
    };
    
  } catch (error) {
    console.error('[Email Sync] Sync error:', error);
    return {
      success: false,
      error: error.message,
      ...overallResults
    };
  }
}

/**
 * Initialize the email analytics database
 */
export async function initializeEmailAnalytics(dbPool = pool) {
  try {
    // Check if table exists
    const tableCheck = await dbPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'email_analytics'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('[Email Sync] Creating email_analytics table...');
      
      // Read and execute schema file
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const schemaPath = path.join(__dirname, '../../database/email_analytics_schema.sql');
      
      const schema = await fs.readFile(schemaPath, 'utf-8');
      await dbPool.query(schema);
      
      console.log('[Email Sync] Email analytics database initialized');
    } else {
      console.log('[Email Sync] Email analytics table already exists');
    }
    
    return true;
    
  } catch (error) {
    console.error('[Email Sync] Initialization error:', error);
    return false;
  }
}

/**
 * Get sync statistics
 */
export async function getSyncStats(dbPool = pool) {
  try {
    const stats = await dbPool.query(`
      SELECT 
        COUNT(*) as total_emails,
        COUNT(*) FILTER (WHERE is_request = true) as total_requests,
        COUNT(*) FILTER (WHERE is_response = true) as total_responses,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_requests,
        COUNT(*) FILTER (WHERE is_request = true AND response_to_message_id IS NULL AND status = 'pending') as unanswered_requests,
        AVG(response_time_hours) FILTER (WHERE response_time_hours IS NOT NULL) as avg_response_hours,
        MIN(received_date) as oldest_email,
        MAX(received_date) as newest_email,
        MAX(processed_at) as last_sync
      FROM email_analytics;
    `);
    
    return stats.rows[0];
    
  } catch (error) {
    console.error('[Email Sync] Stats error:', error);
    return null;
  }
}

export default {
  processAndStoreEmail,
  linkResponsesToRequests,
  syncEmails,
  initializeEmailAnalytics,
  getSyncStats
};


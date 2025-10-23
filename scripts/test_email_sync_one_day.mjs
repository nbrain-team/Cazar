#!/usr/bin/env node
/**
 * Test Email Sync - Single Day
 * Quick test to verify email sync is working
 */

import { config } from 'dotenv';
import pg from 'pg';
import { fetchEmailsByDateRange } from '../server/lib/emailFetchService.mjs';
import { processAndStoreEmail } from '../server/lib/emailSyncService.mjs';

config({ path: 'Cazar Main.env' });

const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

async function testOneDaySync() {
  console.log('\n🧪 Testing Email Sync - Single Day\n');
  
  try {
    // Test today's emails
    const endDate = new Date();
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    console.log('📅 Fetching emails from:');
    console.log(`   Start: ${startDate.toLocaleString()}`);
    console.log(`   End:   ${endDate.toLocaleString()}\n`);
    
    console.log('📧 Fetching from mailboxes:');
    console.log('   - jad@cazarnyc.com');
    console.log('   - vinny@cazarnyc.com');
    console.log('   - Abdul@CazarNYC.com');
    console.log('   - allan@CazarNYC.com');
    console.log('   - Allison@CazarNYC.com\n');
    
    const emails = await fetchEmailsByDateRange(startDate, endDate);
    
    console.log(`✅ Fetched ${emails.length} emails\n`);
    
    if (emails.length === 0) {
      console.log('⚠️  No emails found for today');
      console.log('   This could mean:');
      console.log('   - No emails received today yet');
      console.log('   - Mailboxes are accessible but empty');
      console.log('   Try fetching last 7 days instead\n');
      return;
    }
    
    // Show sample emails
    console.log('📨 Sample emails fetched:');
    emails.slice(0, 5).forEach((email, i) => {
      console.log(`\n   ${i + 1}. ${email.subject || '(No subject)'}`);
      console.log(`      From: ${email.from?.emailAddress?.name || 'Unknown'}`);
      console.log(`      To: ${email.mailboxEmail}`);
      console.log(`      Date: ${new Date(email.receivedDateTime).toLocaleString()}`);
    });
    
    // Test processing ONE email with Claude
    console.log('\n\n🤖 Testing Claude 4.5 Analysis on first email...\n');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  ANTHROPIC_API_KEY not set - cannot test Claude analysis');
      console.log('   Email fetching works, but processing will fail');
      console.log('   Add ANTHROPIC_API_KEY to Render environment\n');
      return;
    }
    
    console.log('Processing first email with Claude 4.5...');
    const result = await processAndStoreEmail(emails[0], pool);
    
    if (result.success) {
      console.log('✅ Email processed and stored successfully!');
      console.log(`   Database ID: ${result.id}`);
      console.log(`   Category: ${result.analysis?.category}`);
      console.log(`   Request Type: ${result.analysis?.request_type || 'N/A'}`);
      console.log(`   Is Request: ${result.analysis?.is_request}`);
      console.log(`   Priority: ${result.analysis?.priority}`);
      console.log(`   Summary: ${result.analysis?.ai_summary}\n`);
      
      console.log('🎉 Email sync is working perfectly!');
      console.log(`   Ready to sync all ${emails.length} emails from today`);
      console.log('   Run full 30-day sync when ready\n');
    } else if (result.skipped) {
      console.log('⏭️  Email already exists in database (skipped)');
      console.log('   This is normal if you already ran a sync\n');
    } else {
      console.log('❌ Email processing failed');
      console.log(`   Error: ${result.error}\n`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

testOneDaySync().catch(console.error);


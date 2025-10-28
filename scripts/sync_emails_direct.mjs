#!/usr/bin/env node
/**
 * Direct Email Sync - No HTTP required
 * Calls sync functions directly
 */

import { syncEmails } from '../server/lib/emailSyncService.mjs';

async function runDirectSync() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         MICROSOFT 365 EMAIL SYNC - DIRECT MODE                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check environment
  console.log('🔐 Checking environment variables...');
  const requiredVars = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 'ANTHROPIC_API_KEY', 'DATABASE_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.log(`❌ Missing environment variables: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  
  console.log('✅ All environment variables present\n');
  console.log(`   Microsoft Tenant: ${process.env.MICROSOFT_TENANT_ID}`);
  console.log(`   Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'Connected'}\n`);

  // Get sync options from command line or use defaults
  const hoursBack = parseInt(process.argv[2]) || 720; // 30 days default
  const daysBack = Math.ceil(hoursBack / 24);
  
  console.log(`🚀 Starting email sync for last ${daysBack} days (${hoursBack} hours)...\n`);
  console.log('This will process emails day by day with live progress updates.\n');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    const result = await syncEmails({
      hoursBack: hoursBack,
      maxPerMailbox: 500,
      processThreads: true
    });
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ SYNC COMPLETE!');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log(`📊 Results:`);
    console.log(`   Processed: ${result.processed} emails`);
    console.log(`   Skipped:   ${result.skipped} (already in database)`);
    console.log(`   Errors:    ${result.errors}\n`);

    if (result.dayResults && result.dayResults.length > 0) {
      console.log(`📅 Day-by-day breakdown:`);
      const daysWithEmails = result.dayResults.filter(d => d.processed > 0);
      daysWithEmails.forEach(day => {
        console.log(`   ${day.date}: ${day.processed} emails`);
      });
      console.log('');
    }

    console.log('🎯 Email sync complete! Query via Smart Agent or check database.\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Sync Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runDirectSync();


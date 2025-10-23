#!/usr/bin/env node
/**
 * Email Sync with Real-Time Progress Display
 * Run this on Render shell to see live sync progress
 */

async function syncWithProgress() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     CLAUDE 4.5 EMAIL ANALYTICS - SYNC WITH PROGRESS           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check environment
  console.log('🔐 Checking environment variables...');
  const requiredVars = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 'ANTHROPIC_API_KEY', 'DATABASE_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.log(`❌ Missing environment variables: ${missing.join(', ')}`);
    console.log('   Add these to Render environment and redeploy\n');
    process.exit(1);
  }
  
  console.log('✅ All environment variables present\n');
  console.log(`   Microsoft Client ID: ${process.env.MICROSOFT_CLIENT_ID}`);
  console.log(`   Microsoft Tenant ID: ${process.env.MICROSOFT_TENANT_ID}`);
  console.log(`   Anthropic API Key: ${process.env.ANTHROPIC_API_KEY?.substring(0, 15)}...`);
  console.log(`   Database: Connected\n`);

  // Make API call to trigger sync
  console.log('🚀 Starting email sync (30 days)...\n');
  console.log('This will process emails day by day with live progress updates.\n');
  console.log('Expected duration: 5-15 minutes depending on email volume.\n');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    const response = await fetch('http://localhost:10000/api/email-analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hoursBack: 720 }) // 30 days
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Sync failed:', error);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ SYNC COMPLETE!');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log(`📊 Results:`);
    console.log(`   Processed: ${result.processed} emails`);
    console.log(`   Skipped:   ${result.skipped} (already in database)`);
    console.log(`   Errors:    ${result.errors}\n`);

    if (result.dayResults && result.dayResults.length > 0) {
      console.log(`📅 Day-by-day breakdown:`);
      result.dayResults.forEach(day => {
        if (day.processed > 0) {
          console.log(`   Day ${day.day} (${day.date}): ${day.processed} emails`);
        }
      });
      console.log('');
    }

    console.log('🎯 You can now query emails via Smart Agent!');
    console.log('   Example: "Show all PTO requests from last week"\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Check if running on Render or local
if (process.env.RENDER) {
  console.log('📍 Running on Render\n');
} else {
  console.log('📍 Running locally\n');
  console.log('⚠️  Note: On Render, logs will stream in real-time\n');
}

syncWithProgress().catch(console.error);


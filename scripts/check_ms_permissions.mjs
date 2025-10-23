#!/usr/bin/env node
import { config } from 'dotenv';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

config({ path: 'Cazar Main.env' });

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  },
};

async function checkPermissions() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║     MICROSOFT GRAPH API PERMISSIONS CHECK                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Get token
    const msalClient = new ConfidentialClientApplication(msalConfig);
    const tokenResponse = await msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });

    if (!tokenResponse || !tokenResponse.accessToken) {
      console.log('❌ Failed to get access token\n');
      return;
    }

    console.log('✅ Access token acquired\n');

    const client = Client.init({
      authProvider: (done) => done(null, tokenResponse.accessToken),
    });

    const tests = [];

    // Test 1: User.Read.All
    console.log('1️⃣  Testing User.Read.All permission...');
    try {
      const users = await client.api('/users').top(1).get();
      console.log(`   ✅ GRANTED - Found ${users.value?.length || 0} users\n`);
      tests.push({ permission: 'User.Read.All', status: 'granted' });
    } catch (e) {
      console.log(`   ❌ DENIED - ${e.message}\n`);
      tests.push({ permission: 'User.Read.All', status: 'denied', error: e.message });
    }

    // Test 2: Mail.Read
    console.log('2️⃣  Testing Mail.Read permission...');
    try {
      const messages = await client.api('/users/jad@cazarnyc.com/messages').top(1).get();
      console.log(`   ✅ GRANTED - Can read mail\n`);
      tests.push({ permission: 'Mail.Read', status: 'granted' });
    } catch (e) {
      console.log(`   ❌ DENIED - ${e.message}\n`);
      tests.push({ permission: 'Mail.Read', status: 'denied', error: e.message });
    }

    // Test 3: Mail.ReadBasic.All
    console.log('3️⃣  Testing Mail.ReadBasic.All permission...');
    try {
      const messages = await client.api('/users/vinny@cazarnyc.com/messages').select('id,subject,receivedDateTime').top(1).get();
      console.log(`   ✅ GRANTED - Can read basic mail info\n`);
      tests.push({ permission: 'Mail.ReadBasic.All', status: 'granted' });
    } catch (e) {
      console.log(`   ❌ DENIED - ${e.message}\n`);
      tests.push({ permission: 'Mail.ReadBasic.All', status: 'denied', error: e.message });
    }

    // Test 4: Fetch actual emails
    console.log('4️⃣  Testing actual email fetch from jad@cazarnyc.com...');
    try {
      const messages = await client
        .api('/users/jad@cazarnyc.com/messages')
        .select('id,subject,from,receivedDateTime,bodyPreview')
        .top(5)
        .get();
      
      const count = messages.value?.length || 0;
      console.log(`   ✅ SUCCESS - Fetched ${count} emails\n`);
      
      if (count > 0) {
        console.log('   📧 Sample emails:');
        messages.value.slice(0, 3).forEach((msg, i) => {
          console.log(`      ${i + 1}. ${msg.subject}`);
          console.log(`         From: ${msg.from?.emailAddress?.name}`);
          console.log(`         Date: ${new Date(msg.receivedDateTime).toLocaleString()}`);
        });
        console.log('');
      }
      tests.push({ permission: 'Email Fetch', status: 'working', count });
    } catch (e) {
      console.log(`   ❌ FAILED - ${e.message}\n`);
      tests.push({ permission: 'Email Fetch', status: 'failed', error: e.message });
    }

    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                         SUMMARY                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    tests.forEach(test => {
      const status = test.status === 'granted' || test.status === 'working' ? '✅' : '❌';
      console.log(`${status} ${test.permission}`);
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });

    const allWorking = tests.every(t => t.status === 'granted' || t.status === 'working');
    
    if (allWorking) {
      console.log('\n🎉 ALL PERMISSIONS WORKING!\n');
      console.log('Email sync should work. If it returns 0 emails:');
      console.log('  - Check if mailboxes have emails in the date range');
      console.log('  - Verify ANTHROPIC_API_KEY is set (for Claude processing)');
      console.log('  - Check Render logs for specific errors\n');
    } else {
      console.log('\n⚠️  MISSING PERMISSIONS!\n');
      console.log('Fix in Azure Portal:');
      console.log('1. Go to https://portal.azure.com');
      console.log('2. Azure AD → App registrations');
      console.log(`3. Search: ${process.env.MICROSOFT_CLIENT_ID}`);
      console.log('4. API permissions → Add missing permissions');
      console.log('5. Grant admin consent\n');
    }

  } catch (error) {
    console.error('❌ Permission check failed:', error.message);
  }
}

checkPermissions().catch(console.error);

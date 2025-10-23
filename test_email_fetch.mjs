#!/usr/bin/env node
/**
 * Test Email Fetch - Debug why no emails are syncing
 */

import { config } from 'dotenv';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

config({ path: 'Cazar Main.env' });

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID;

if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
  console.error('❌ Missing Microsoft credentials');
  process.exit(1);
}

const msalConfig = {
  auth: {
    clientId: MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`,
    clientSecret: MICROSOFT_CLIENT_SECRET,
  },
};

async function getAccessToken() {
  const client = new ConfidentialClientApplication(msalConfig);
  const tokenRequest = {
    scopes: ['https://graph.microsoft.com/.default'],
  };
  const response = await client.acquireTokenByClientCredential(tokenRequest);
  return response.accessToken;
}

async function testEmailAccess() {
  console.log('\n🔍 Testing Email Access via Microsoft Graph API\n');
  console.log('Credentials:');
  console.log(`  Client ID: ${MICROSOFT_CLIENT_ID}`);
  console.log(`  Tenant ID: ${MICROSOFT_TENANT_ID}`);
  console.log(`  Secret: ${MICROSOFT_CLIENT_SECRET.substring(0, 10)}...\n`);

  try {
    console.log('1️⃣ Getting access token...');
    const token = await getAccessToken();
    console.log('   ✅ Access token acquired\n');

    const client = Client.init({
      authProvider: (done) => done(null, token),
    });

    // Test 1: List users with mailboxes
    console.log('2️⃣ Fetching users with mailboxes...');
    const usersResponse = await client
      .api('/users')
      .select('id,displayName,mail,userPrincipalName')
      .top(10)
      .get();

    const users = usersResponse.value || [];
    console.log(`   ✅ Found ${users.length} users\n`);
    
    if (users.length === 0) {
      console.log('   ⚠️  No users found! This is why email sync returned 0.');
      console.log('   Possible reasons:');
      console.log('   - App needs User.Read.All permission');
      console.log('   - Admin consent not granted');
      console.log('   - No licensed users in tenant\n');
      return;
    }

    users.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.displayName}`);
      console.log(`      Email: ${user.mail || user.userPrincipalName}`);
      console.log(`      ID: ${user.id}`);
    });

    // Test 2: Try to fetch emails from first user
    console.log('\n3️⃣ Testing email fetch from first user...');
    const firstUser = users[0];
    
    try {
      const messagesResponse = await client
        .api(`/users/${firstUser.id}/messages`)
        .select('id,subject,from,receivedDateTime')
        .top(5)
        .get();

      const messages = messagesResponse.value || [];
      console.log(`   ✅ Found ${messages.length} emails for ${firstUser.displayName}\n`);
      
      if (messages.length === 0) {
        console.log('   ⚠️  User has no emails or mailbox not accessible');
      } else {
        messages.forEach((msg, i) => {
          console.log(`   ${i + 1}. ${msg.subject}`);
          console.log(`      From: ${msg.from?.emailAddress?.name || 'Unknown'}`);
          console.log(`      Date: ${new Date(msg.receivedDateTime).toLocaleString()}`);
        });
      }
    } catch (emailError) {
      console.log(`   ❌ Cannot access emails: ${emailError.message}`);
      console.log('   Possible reasons:');
      console.log('   - Need Mail.Read or Mail.Read.All permission');
      console.log('   - Admin consent not granted for mail access\n');
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Users found: ${users.length}`);
    console.log('   Next steps:');
    if (users.length === 0) {
      console.log('   1. Grant User.Read.All permission in Azure Portal');
      console.log('   2. Grant admin consent');
    } else {
      console.log('   1. Grant Mail.Read.All permission in Azure Portal');
      console.log('   2. Grant admin consent');
      console.log('   3. Wait 5-10 minutes for propagation');
      console.log('   4. Re-run email sync');
    }
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('consent')) {
      console.log('\n⚠️  Admin consent required!');
      console.log('Go to: https://portal.azure.com');
      console.log('→ Azure AD → App registrations → Your app → API permissions');
      console.log('→ Grant admin consent\n');
    }
  }
}

testEmailAccess().catch(console.error);

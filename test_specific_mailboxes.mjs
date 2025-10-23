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

async function getAccessToken() {
  const client = new ConfidentialClientApplication(msalConfig);
  const response = await client.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return response.accessToken;
}

async function testSpecificMailboxes() {
  console.log('\n🔍 Testing Specific Mailboxes\n');

  const mailboxesToTest = [
    'jad@cazarnyc.com',
    'vinny@cazarnyc.com',
    'rudy@cazarnyc.com'
  ];

  const token = await getAccessToken();
  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  const results = [];

  for (const email of mailboxesToTest) {
    console.log(`Testing: ${email}`);
    
    try {
      // Try to fetch emails from this mailbox
      const messagesResponse = await client
        .api(`/users/${email}/messages`)
        .select('id,subject,from,receivedDateTime')
        .top(5)
        .get();

      const messages = messagesResponse.value || [];
      
      results.push({
        email,
        accessible: true,
        emailCount: messages.length,
        messages: messages.slice(0, 3)
      });

      console.log(`   ✅ Accessible - ${messages.length} emails found`);
      
      if (messages.length > 0) {
        console.log('   Recent emails:');
        messages.slice(0, 3).forEach((msg, i) => {
          console.log(`      ${i + 1}. ${msg.subject || '(No subject)'}`);
          console.log(`         From: ${msg.from?.emailAddress?.name || 'Unknown'}`);
          console.log(`         Date: ${new Date(msg.receivedDateTime).toLocaleString()}`);
        });
      } else {
        console.log('   ⚠️  Mailbox is accessible but has no emails in the last 30 days');
      }
      
    } catch (error) {
      results.push({
        email,
        accessible: false,
        error: error.message
      });
      
      console.log(`   ❌ Not accessible`);
      console.log(`   Error: ${error.message}`);
    }
    console.log('');
  }

  // Summary
  console.log('📊 Summary:\n');
  const accessible = results.filter(r => r.accessible);
  const inaccessible = results.filter(r => !r.accessible);

  if (accessible.length > 0) {
    console.log('✅ Accessible mailboxes:');
    accessible.forEach(r => {
      console.log(`   - ${r.email} (${r.emailCount} emails)`);
    });
    console.log('');
  }

  if (inaccessible.length > 0) {
    console.log('❌ Inaccessible mailboxes:');
    inaccessible.forEach(r => {
      console.log(`   - ${r.email}`);
      console.log(`     Reason: ${r.error}`);
    });
    console.log('');
  }

  console.log('🎯 Recommendation:');
  if (accessible.length > 0) {
    console.log(`   Sync these ${accessible.length} mailbox(es) for email analytics`);
    console.log('   These likely contain operations/driver emails\n');
  } else {
    console.log('   None of these mailboxes are accessible');
    console.log('   Check if they have Exchange Online licenses\n');
  }
}

testSpecificMailboxes().catch(console.error);

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

async function testMailboxes() {
  console.log('\n🔍 Testing Which Mailboxes Are Accessible\n');

  const token = await getAccessToken();
  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  // Get all users
  const usersResponse = await client
    .api('/users')
    .select('id,displayName,mail,userPrincipalName,assignedLicenses')
    .top(50)
    .get();

  const users = usersResponse.value || [];
  console.log(`Found ${users.length} total users\n`);

  const accessibleMailboxes = [];
  const inaccessibleMailboxes = [];

  for (const user of users) {
    try {
      // Try to fetch just 1 email to test access
      const messages = await client
        .api(`/users/${user.id}/messages`)
        .top(1)
        .get();

      const count = messages.value?.length || 0;
      accessibleMailboxes.push({
        name: user.displayName,
        email: user.mail || user.userPrincipalName,
        id: user.id,
        hasEmails: count > 0
      });
      
      console.log(`✅ ${user.displayName} (${user.mail || user.userPrincipalName})`);
      console.log(`   Mailbox accessible - ${count > 0 ? 'has emails' : 'empty or no recent emails'}`);
      
    } catch (error) {
      inaccessibleMailboxes.push({
        name: user.displayName,
        email: user.mail || user.userPrincipalName,
        id: user.id,
        error: error.message
      });
      
      console.log(`❌ ${user.displayName} (${user.mail || user.userPrincipalName})`);
      console.log(`   ${error.message}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Accessible mailboxes: ${accessibleMailboxes.length}`);
  console.log(`   ❌ Inaccessible mailboxes: ${inaccessibleMailboxes.length}`);

  if (accessibleMailboxes.length > 0) {
    console.log('\n💡 Accessible mailboxes:');
    accessibleMailboxes.forEach(m => {
      console.log(`   - ${m.name} (${m.email})`);
      console.log(`     ID: ${m.id}`);
    });
  }

  if (inaccessibleMailboxes.length > 0) {
    console.log('\n⚠️  Common reasons for inaccessible mailboxes:');
    console.log('   - Mailbox is on-premise (not Exchange Online)');
    console.log('   - Mailbox is inactive/disabled');
    console.log('   - User has no Exchange license');
    console.log('   - Mailbox is soft-deleted');
  }

  console.log('\n🎯 Recommendation:');
  if (accessibleMailboxes.length > 0) {
    console.log(`   Update emailFetchService.mjs to only sync these ${accessibleMailboxes.length} accessible mailboxes`);
    console.log('   Or specify a single shared mailbox for operations emails');
  } else {
    console.log('   No accessible mailboxes found - check Exchange Online licenses');
  }
  console.log('\n');
}

testMailboxes().catch(console.error);

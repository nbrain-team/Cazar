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

async function getToken() {
  const client = new ConfidentialClientApplication(msalConfig);
  const response = await client.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return response.accessToken;
}

async function diagnoseRudyMailbox() {
  console.log('\n🔍 Diagnosing Rudy Mailbox Access\n');
  
  const token = await getToken();
  const client = Client.init({
    authProvider: (done) => done(null, token),
  });

  const testCases = [
    { email: 'rudy@cazarnyc.com', name: 'rudy@cazarnyc.com (lowercase)' },
    { email: 'Rudy@CazarNYC.com', name: 'Rudy@CazarNYC.com (mixed case)' },
    { email: 'Rudy@cazarnyc.com', name: 'Rudy@cazarnyc.com' },
  ];

  console.log('Testing different email address formats:\n');

  for (const test of testCases) {
    console.log(`Testing: ${test.name}`);
    
    try {
      // Try 1: Get user first
      console.log('  → Fetching user profile...');
      const user = await client
        .api(`/users/${test.email}`)
        .select('id,displayName,mail,userPrincipalName')
        .get();
      
      console.log(`     ✅ User found: ${user.displayName}`);
      console.log(`        ID: ${user.id}`);
      console.log(`        Mail: ${user.mail}`);
      console.log(`        UPN: ${user.userPrincipalName}`);
      
      // Try 2: Access mailbox using user ID
      console.log('  → Accessing mailbox via user ID...');
      const messagesById = await client
        .api(`/users/${user.id}/messages`)
        .top(1)
        .get();
      
      console.log(`     ✅ SUCCESS - Mailbox accessible via ID`);
      console.log(`        Found ${messagesById.value?.length || 0} messages\n`);
      
      // Try 3: Get mailbox settings
      console.log('  → Checking mailbox settings...');
      const mailboxSettings = await client
        .api(`/users/${user.id}/mailboxSettings`)
        .get();
      
      console.log(`     ✅ Mailbox settings accessible`);
      console.log(`        Language: ${mailboxSettings.language?.locale || 'N/A'}\n`);
      
      // Success!
      console.log(`✅ SOLUTION FOUND: Use "${user.id}" instead of email address\n`);
      console.log(`Update emailFetchService.mjs to use:`);
      console.log(`{ email: '${user.id}', name: 'Rudy' }\n`);
      return;
      
    } catch (error) {
      console.log(`     ❌ Failed: ${error.message}\n`);
    }
  }

  // If all failed, check for ApplicationAccessPolicy
  console.log('\n🔍 Checking for Application Access Policy restrictions...\n');
  
  try {
    // This requires Exchange Online management
    console.log('The mailbox might have ApplicationAccessPolicy restrictions.');
    console.log('IT Admin needs to run this PowerShell command:\n');
    console.log('Connect-ExchangeOnline');
    console.log('Get-ApplicationAccessPolicy | Where-Object {$_.AppId -eq "fe9e4018-6e34-4662-8989-18ef789f727d"}');
    console.log('\nIf a policy exists that DENIES access, remove it or add Rudy to allowed mailboxes:\n');
    console.log('New-ApplicationAccessPolicy -AppId "fe9e4018-6e34-4662-8989-18ef789f727d" -PolicyScopeGroupId "Rudy@CazarNYC.com" -AccessRight RestrictAccess -Description "Allow app access"\n');
    
  } catch (error) {
    console.log('Could not check policies:', error.message);
  }
  
  console.log('\n💡 Alternative: Use a different mailbox for Rudy\'s emails');
  console.log('   Set up email forwarding from Rudy → jad@cazarnyc.com');
  console.log('   This way all Rudy\'s emails will be captured via Jad\'s mailbox\n');
}

diagnoseRudyMailbox().catch(console.error);

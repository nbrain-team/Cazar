#!/usr/bin/env node
/**
 * Test Microsoft 365 API Access
 * 
 * Tests what Microsoft Graph API endpoints are accessible with current credentials
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';

// Load credentials from environment
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID;

if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
  console.error('❌ Missing Microsoft credentials in environment');
  console.error('Please set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID');
  process.exit(1);
}

const msalConfig = {
  auth: {
    clientId: MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`,
    clientSecret: MICROSOFT_CLIENT_SECRET,
  },
};

let accessToken = null;

async function getAccessToken() {
  try {
    const client = new ConfidentialClientApplication(msalConfig);
    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    const response = await client.acquireTokenByClientCredential(tokenRequest);
    
    if (response && response.accessToken) {
      accessToken = response.accessToken;
      return accessToken;
    }

    throw new Error('Failed to acquire access token');
  } catch (error) {
    console.error('❌ Token acquisition failed:', error.message);
    throw error;
  }
}

async function getGraphClient() {
  const token = await getAccessToken();
  
  return Client.init({
    authProvider: (done) => {
      done(null, token);
    },
  });
}

async function testUsers() {
  try {
    console.log('\n📧 Testing: User Access (Mail.Read)');
    const client = await getGraphClient();
    
    const response = await client
      .api('/users')
      .top(5)
      .select('displayName,mail,userPrincipalName')
      .get();
    
    const users = response.value || [];
    console.log(`✅ SUCCESS - Can access users (${users.length} found)`);
    users.forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.displayName} (${user.mail || user.userPrincipalName})`);
    });
    
    return { success: true, count: users.length, users };
  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    if (error.message.includes('consent')) {
      console.log('   ⚠️  Requires admin consent in Azure Portal');
    }
    return { success: false, error: error.message };
  }
}

async function testMail(userId) {
  try {
    console.log('\n📨 Testing: Email Access (Mail.Read)');
    if (!userId) {
      console.log('⏭️  SKIPPED - No user ID available');
      return { success: false, skipped: true };
    }
    
    const client = await getGraphClient();
    
    const messages = await client
      .api(`/users/${userId}/messages`)
      .top(5)
      .select('subject,from,receivedDateTime')
      .get();
    
    const count = messages.value?.length || 0;
    console.log(`✅ SUCCESS - Can read emails (${count} found)`);
    messages.value?.slice(0, 3).forEach((msg, i) => {
      const date = new Date(msg.receivedDateTime).toLocaleDateString();
      console.log(`   ${i + 1}. ${msg.subject} (${date})`);
    });
    
    return { success: true, count };
  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    if (error.message.includes('consent')) {
      console.log('   ⚠️  Requires admin consent for Mail.Read permission');
    }
    return { success: false, error: error.message };
  }
}

async function testCalendar(userId) {
  try {
    console.log('\n📅 Testing: Calendar Access (Calendars.Read)');
    if (!userId) {
      console.log('⏭️  SKIPPED - No user ID available');
      return { success: false, skipped: true };
    }
    
    const client = await getGraphClient();
    
    const events = await client
      .api(`/users/${userId}/calendar/events`)
      .top(5)
      .select('subject,start,end')
      .get();
    
    const count = events.value?.length || 0;
    console.log(`✅ SUCCESS - Can read calendar (${count} events found)`);
    events.value?.slice(0, 3).forEach((evt, i) => {
      console.log(`   ${i + 1}. ${evt.subject}`);
    });
    
    return { success: true, count };
  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    if (error.message.includes('consent')) {
      console.log('   ⚠️  Requires admin consent for Calendars.Read permission');
    }
    return { success: false, error: error.message };
  }
}

async function testTeams() {
  try {
    console.log('\n💬 Testing: Teams Access (Chat.Read.All / ChannelMessage.Read.All)');
    const client = await getGraphClient();
    
    const teams = await client
      .api('/teams')
      .top(5)
      .select('displayName,description')
      .get();
    
    const count = teams.value?.length || 0;
    console.log(`✅ SUCCESS - Can access teams (${count} found)`);
    teams.value?.forEach((team, i) => {
      console.log(`   ${i + 1}. ${team.displayName}`);
    });
    
    return { success: true, count };
  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    if (error.message.includes('consent')) {
      console.log('   ⚠️  Requires admin consent for Team.ReadBasic.All permission');
    }
    return { success: false, error: error.message };
  }
}

async function testFiles() {
  try {
    console.log('\n📁 Testing: OneDrive/SharePoint Access (Files.Read.All)');
    const client = await getGraphClient();
    
    const drives = await client
      .api('/drives')
      .top(5)
      .select('name,driveType')
      .get();
    
    const count = drives.value?.length || 0;
    console.log(`✅ SUCCESS - Can access drives (${count} found)`);
    drives.value?.forEach((drive, i) => {
      console.log(`   ${i + 1}. ${drive.name} (${drive.driveType})`);
    });
    
    return { success: true, count };
  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    if (error.message.includes('consent')) {
      console.log('   ⚠️  Requires admin consent for Files.Read.All permission');
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        MICROSOFT 365 API ACCESS TEST                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  console.log('\n🔐 Credentials:');
  console.log(`   Tenant ID: ${MICROSOFT_TENANT_ID}`);
  console.log(`   Client ID: ${MICROSOFT_CLIENT_ID}`);
  console.log(`   Secret: ${MICROSOFT_CLIENT_SECRET.substring(0, 10)}...`);
  
  // Step 1: Get access token
  console.log('\n🔑 Step 1: Acquiring Access Token...');
  try {
    await getAccessToken();
    console.log('✅ Access token acquired successfully');
  } catch (error) {
    console.log('❌ Failed to acquire token');
    console.log('\n💡 Action Required:');
    console.log('   1. Verify credentials are correct in Azure Portal');
    console.log('   2. Ensure app registration is not expired');
    console.log('   3. Check that client secret is valid\n');
    process.exit(1);
  }
  
  // Step 2: Test each API endpoint
  console.log('\n🧪 Step 2: Testing API Endpoints...');
  
  const results = {
    users: null,
    mail: null,
    calendar: null,
    teams: null,
    files: null,
  };
  
  // Test users (required for other tests)
  results.users = await testUsers();
  const firstUserId = results.users.users?.[0]?.id;
  
  // Test mail
  results.mail = await testMail(firstUserId);
  
  // Test calendar
  results.calendar = await testCalendar(firstUserId);
  
  // Test Teams
  results.teams = await testTeams();
  
  // Test Files
  results.files = await testFiles();
  
  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const services = [
    { name: 'Users (User.Read.All)', result: results.users },
    { name: 'Email (Mail.Read)', result: results.mail },
    { name: 'Calendar (Calendars.Read)', result: results.calendar },
    { name: 'Teams (Team.ReadBasic.All)', result: results.teams },
    { name: 'Files (Files.Read.All)', result: results.files },
  ];
  
  services.forEach(service => {
    const status = service.result?.success ? '✅ WORKING' : 
                   service.result?.skipped ? '⏭️  SKIPPED' : 
                   '❌ BLOCKED';
    console.log(`${status} - ${service.name}`);
  });
  
  const workingCount = services.filter(s => s.result?.success).length;
  const blockedCount = services.filter(s => s.result && !s.result.success && !s.result.skipped).length;
  
  console.log(`\n📊 Status: ${workingCount}/5 working, ${blockedCount} blocked`);
  
  if (blockedCount > 0) {
    console.log('\n💡 NEXT STEPS TO FIX:');
    console.log('\n1. Go to Azure Portal: https://portal.azure.com');
    console.log('2. Navigate to: Azure Active Directory → App registrations');
    console.log('3. Find your app: "Cazar" or search for client ID');
    console.log('4. Click: API permissions');
    console.log('5. Verify these permissions are added:');
    console.log('   • User.Read.All');
    console.log('   • Mail.Read');
    console.log('   • Calendars.Read');
    console.log('   • Team.ReadBasic.All / ChannelMessage.Read.All');
    console.log('   • Files.Read.All');
    console.log('6. Click: "Grant admin consent for [Your Organization]"');
    console.log('7. Wait 5-10 minutes for propagation');
    console.log('8. Re-run this test\n');
    
    console.log('📖 Documentation:');
    console.log('   https://learn.microsoft.com/en-us/azure/active-directory/manage-apps/grant-admin-consent\n');
  } else if (workingCount === 5) {
    console.log('\n🎉 SUCCESS! All Microsoft 365 services are accessible!');
    console.log('   The Smart Agent can now search:');
    console.log('   • Emails across all mailboxes');
    console.log('   • Calendar events');
    console.log('   • Teams messages');
    console.log('   • OneDrive/SharePoint files\n');
  }
}

main().catch(console.error);


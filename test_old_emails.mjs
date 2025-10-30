import { fetchEmailsByDateRange } from './server/lib/emailFetchService.mjs';

const startDate = new Date('2025-09-29'); // 30 days ago
const endDate = new Date('2025-10-01');   // Test just 2 days

console.log('Testing email fetch for Sep 29 - Oct 1, 2025...');
console.log('Start:', startDate.toISOString());
console.log('End:', endDate.toISOString());

try {
  const emails = await fetchEmailsByDateRange(startDate, endDate, {
    maxPerMailbox: 50
  });
  
  console.log('\n✅ Success!');
  console.log('Emails found:', emails.length);
  
  if (emails.length > 0) {
    console.log('\nSample email dates:');
    emails.slice(0, 5).forEach(e => {
      console.log(' -', e.receivedDateTime, e.subject?.substring(0, 50));
    });
  } else {
    console.log('\n⚠️ No emails found for this date range');
    console.log('This might mean:');
    console.log('  1. No emails exist in mailboxes for these dates');
    console.log('  2. Microsoft Graph API has date range limitations');
    console.log('  3. Mailboxes being queried don\'t have old emails');
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
}

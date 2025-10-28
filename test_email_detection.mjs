#!/usr/bin/env node
import { isEmailQuery } from './server/lib/claudeEmailService.mjs';

const testQueries = [
  "what priorities should Rudy be thinking about for today?",
  "anything I need to be concerned about as it relates to my Employment Practices Liability Policy",
  "who sent this to me?",
  "what did the team say about the new hire?",
  "show me driver violations"
];

console.log('\n🧪 Testing Email Detection AI:\n');

for (const query of testQueries) {
  try {
    const shouldSearch = await isEmailQuery(query);
    console.log(`Query: "${query}"`);
    console.log(`Result: ${shouldSearch ? '✅ SEARCH EMAILS' : '❌ SKIP EMAILS'}\n`);
  } catch (error) {
    console.log(`Query: "${query}"`);
    console.log(`Error: ${error.message}\n`);
  }
}

process.exit(0);


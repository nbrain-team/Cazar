#!/usr/bin/env node
import fetch from 'node-fetch';

const API_URL = 'https://cazar-main.onrender.com/api/hos/chat';

const testQueries = [
  'Show me current violations',
  'Which drivers are available to work?',
  'Explain the 60 hour rule',
  'Who worked the most hours this week?',
  'Show demo drivers',
  'What are the HOS rules?'
];

async function testChat(query) {
  console.log(`\n📝 Query: "${query}"`);
  console.log('─'.repeat(60));
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('\n📢 Answer:');
    console.log(data.answer);
    
    if (data.violations && data.violations.length > 0) {
      console.log('\n🚫 Violations:');
      data.violations.forEach(v => {
        console.log(`  - ${v.driver_name}: ${v.violations?.[0]?.message || v.message}`);
      });
    }
    
    if (data.suggestions && data.suggestions.length > 0) {
      console.log('\n💡 Suggestions:');
      data.suggestions.forEach(s => console.log(`  - ${s}`));
    }
    
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      console.log(`\n📊 Data: ${data.data.length} items`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTests() {
  console.log('🧪 Testing HOS Chat API...\n');
  
  for (const query of testQueries) {
    await testChat(query);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ Tests complete!');
}

// Check if node-fetch is installed
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
  require.resolve('node-fetch');
} catch (e) {
  console.log('Installing node-fetch...');
  const { execSync } = await import('child_process');
  execSync('npm install node-fetch', { stdio: 'inherit' });
}

runTests();

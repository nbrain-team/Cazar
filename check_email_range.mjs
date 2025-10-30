import dotenv from 'dotenv';
dotenv.config();

const daysBack = 30;
const endDate = new Date();
const startDate = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000));

console.log('=== 30 Day Email Range ===');
console.log('Today:', endDate.toLocaleDateString());
console.log('30 days ago:', startDate.toLocaleDateString());
console.log('Start:', startDate.toISOString());
console.log('End:', endDate.toISOString());
console.log('');
console.log('Should fetch emails from:', startDate.toLocaleDateString(), 'to', endDate.toLocaleDateString());

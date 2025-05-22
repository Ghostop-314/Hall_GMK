import { fetchHallData } from './src/services/api';

// Test with May 1, 2025 (first day of month)
const testDate = new Date(2025, 4, 1);
console.log('Testing with date:', testDate.toDateString());

// This will test fetching data for the first day to verify offsets
fetchHallData(testDate).then(results => {
  console.log('Full results:', JSON.stringify(results, null, 2));
}).catch(error => {
  console.error('Error in test:', error);
});

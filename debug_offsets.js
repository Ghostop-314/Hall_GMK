const testDate = new Date(2025, 4, 1); // May 1, 2025
console.log('Testing with date:', testDate);

// Import and call fetchHallData
import { fetchHallData } from './src/services/api';
fetchHallData(testDate).then(results => {
  console.log('Full results:', JSON.stringify(results, null, 2));
});

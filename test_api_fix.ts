/**
 * Test script to verify the improved API with retry logic
 * This script focuses on testing the GMK Banquets Tathawade - Aster hall
 * which was previously experiencing API errors
 */

// Import dotenv to load environment variables from .env file
import 'dotenv/config';
import { fetchHallData } from './src/services/api';

// Log API key information (without revealing the actual key)
const apiKey = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY;
console.log('API KEY STATUS:', apiKey ? `Set (length: ${apiKey.length})` : 'Not set');

// Set a specific date to test with
const testDate = new Date(2025, 4, 18); // May 18, 2025

console.log('Starting API test with improved retry logic...');
console.log(`Test date: ${testDate.toDateString()}`);

// Test the API with the improved logic
async function runApiTest() {
  try {
    console.log('Fetching hall data...');
    const results = await fetchHallData(testDate);
    
    console.log(`Successfully fetched ${results.length} hall data entries`);
    
    // Filter for GMK Banquets Tathawade - Aster hall to verify it works
    const asterHallResults = results.filter(
      hall => hall.location === 'GMK Banquets Tathawade' && hall.hallName === 'Aster'
    );
    
    if (asterHallResults.length > 0) {
      console.log('✅ Successfully fetched data for GMK Banquets Tathawade - Aster hall');
      console.log('Results:', JSON.stringify(asterHallResults, null, 2));
    } else {
      console.error('❌ Failed to fetch data for GMK Banquets Tathawade - Aster hall');
      console.log('All results:', results);
    }
    
    // Count results by location to verify all locations are working
    const locationCounts = results.reduce((counts, hall) => {
      if (!counts[hall.location]) counts[hall.location] = 0;
      counts[hall.location]++;
      return counts;
    }, {} as Record<string, number>);
    
    console.log('Location counts:', locationCounts);
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

runApiTest();

// To run this test:
// npx tsx test_api_fix.ts

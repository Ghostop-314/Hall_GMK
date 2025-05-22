// Test script to check fetchHallData with our current date
import { fetchHallData } from './src/services/api';

async function runTest() {
  try {
    console.log('Starting test...');
    
    // Verify API key is available
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY;
    console.log('API Key available:', apiKey ? `Yes (length: ${apiKey.length})` : 'No');
    
    // Test with current date
    const testDate = new Date(2025, 4, 21);  // May 21, 2025
    console.log(`Testing with date: ${testDate.toDateString()}`);
    
    console.log('Calling fetchHallData...');
    const results = await fetchHallData(testDate);
    console.log(`Received ${results.length} results`);
    
    if (results.length === 0) {
      console.error('No results returned. Check API connectivity.');
      return;
    }
    
    // Group results by location for better readability
    const groupedResults = results.reduce((acc, item) => {
      const key = `${item.location} - ${item.hallName}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, any[]>);
    
    console.log('\n===== Hall Availability Results =====');
    Object.entries(groupedResults).forEach(([key, items]) => {
      console.log(`\n${key}:`);
      items.forEach(item => {
        console.log(`  - ${item.timeSlot}: ${item.status}`);
      });
    });
    
  }  catch (error) {
    console.error('Error in test:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
  }
}

// Run the test
runTest();

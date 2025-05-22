// Simple test script to check the API connection and sheet structure
// Set the API key directly for testing
const API_KEY = 'AIzaSyCAWlja4NXegn8bb2kpkYHzPzCFWZcKiu0';

async function testSheet(sheetId, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${API_KEY}&alt=json`;
    console.log(`Testing URL: ${url}`);
    try {
        console.log('Sending request...');
        const response = await fetch(url);
        console.log(`Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error(`Response body: ${errorText}`);
            return;
        }
        
        console.log('Parsing response as JSON...');
        const data = await response.json();
        console.log('Response parsed successfully.');
        
        // If we got values, show the first few rows for analysis
        if (data.values && data.values.length > 0) {
            console.log(`\nAnalysis of ${data.values.length} rows received:`);
            const rowsToShow = Math.min(5, data.values.length);
            for (let i = 0; i < rowsToShow; i++) {
                const rowValue = data.values[i] && data.values[i].length > 0 ? data.values[i][0] : 'empty';
                console.log(`Row ${i}: ${rowValue}`);
            }
        } else {
            console.log('No values in the response. Full response:');
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Case 1: Testing with UPPERCASE month
console.log('\n=== Testing GMK Banquets Tathawade - Grand Hall (Morning) with MAY 2025 ===');
testSheet(
    '11ayCtpamMHMyPsJustw7XjUCqLKRhXAzPHwJoeXj8vc', 
    "'MAY 2025'!D3:D33"
);

// Case 2: Testing with Title Case month
setTimeout(() => {
    console.log('\n=== Testing GMK Banquets Tathawade - Grand Hall (Morning) with May 2025 ===');
    testSheet(
        '11ayCtpamMHMyPsJustw7XjUCqLKRhXAzPHwJoeXj8vc', 
        "'May 2025'!D3:D33"
    );
}, 1000);

// Test the Ravet sheet - Agastya Hall
setTimeout(() => {
    console.log('\n=== Testing GMK Banquets Ravet - Agastya Hall (Morning) with May 2025 ===');
    testSheet(
        '1bz2OdYudngOhKu3CT34VhtWY0-WYg61YGFCavWMy7ms',
        "'May 2025'!B4:B34"
    );
}, 2000);

// Test the Madhura sheet
setTimeout(() => {
    console.log('\n=== Testing Madhura Banquet - Banquet Hall (Morning) with May 2025 ===');
    testSheet(
        '1bz2OdYudngOhKu3CT34VhtWY0-WYg61YGFCavWMy7ms',
        "'May 2025'!B38:B68"
    );
}, 3000);

// Simple script to test the header offset logic
const API_KEY = 'AIzaSyCAWlja4NXegn8bb2kpkYHzPzCFWZcKiu0';
const sheetId = '1bz2OdYudngOhKu3CT34VhtWY0-WYg61YGFCavWMy7ms';
const range = "'May 2025'!B38:B68";

async function test() {
    console.log('Starting offset test...');
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${API_KEY}&alt=json`;
        console.log(`Testing URL: ${url}`);
        
        console.log('Sending request...');
        const response = await fetch(url);
        console.log(`Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            return;
        }
        
        console.log('Parsing response...');
        const data = await response.json();
        console.log('Response parsed successfully');
        
        // Check values
        if (data.values && data.values.length > 0) {
            console.log(`Got ${data.values.length} rows of data`);
            console.log('First 5 rows:');
            for (let i = 0; i < Math.min(5, data.values.length); i++) {
                const value = data.values[i] && data.values[i].length > 0 ? data.values[i][0] : 'empty';
                console.log(`Row ${i}: ${value}`);
            }
            
            // Test with offset 1 (skipping header)
            console.log('\nSimulating with morningHeaderOffset=1:');
            const dayOfMonth = 21; // May 21, 2025
            
            // Without offset
            const noOffsetIndex = dayOfMonth - 1; // 20
            console.log(`Trying to access index ${noOffsetIndex} out of ${data.values.length} values`);
            
            if (noOffsetIndex < data.values.length && data.values[noOffsetIndex]) {
                const valueWithoutOffset = data.values[noOffsetIndex].length > 0 ? data.values[noOffsetIndex][0] : 'empty';
                console.log(`Without offset, day ${dayOfMonth} (index ${noOffsetIndex}): ${valueWithoutOffset}`);
            } else {
                console.log(`Index ${noOffsetIndex} is out of bounds or contains no data`);
            }
            
            // With offset
            const withOffsetIndex = (dayOfMonth - 1) + 1; // 21
            console.log(`Trying to access index ${withOffsetIndex} out of ${data.values.length} values`);
            
            if (withOffsetIndex < data.values.length && data.values[withOffsetIndex]) {
                const valueWithOffset = data.values[withOffsetIndex].length > 0 ? data.values[withOffsetIndex][0] : 'empty';
                console.log(`With offset=1, day ${dayOfMonth} (index ${withOffsetIndex}): ${valueWithOffset}`);
            } else {
                console.log(`Index ${withOffsetIndex} is out of bounds or contains no data`);
            }
        } else {
            console.log('No values returned in the response');
            console.log('Full response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('Error occurred:', error);
    }
    
    console.log('Test completed');
}

test();

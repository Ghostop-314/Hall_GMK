import { GoogleSheetsResponse, HallData, LocationConfig } from '../types';

// Load API key from environment variable for security
// Make sure to check for empty values and log appropriate warnings
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY || '';
if (!API_KEY) {
    console.error('WARNING: Google Sheets API key is not set. Please set EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY in your .env file.');
}

console.log('API KEY LENGTH:', API_KEY ? API_KEY.length : 0); // Log length of API key for debugging (don't log the actual key for security)

const getSheetDetails = (date: Date) => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthIndex = date.getMonth();
    const monthNameAbbrev = months[monthIndex]; // e.g., 'MAY', 'JUN'
    const year = date.getFullYear();
    
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    
    return {
        sheetName: `${monthNameAbbrev} ${year}`, // e.g., "MAY 2025", "JUN 2025"
        daysInMonth,
        monthName: monthNameAbbrev, // Use abbreviated name here too for consistency
        year
    };
};

// New combined spreadsheet containing both Tathawade and Ravet halls
const SPREADSHEET_ID = '1pMiOb9hvvUdvuK0Hxt0Pa1lBF2JdYCvPZ6WdHxZPegk';

const LOCATIONS: Record<'GMK Banquets Tathawade' | 'GMK Banquets Ravet', LocationConfig> = {
    'GMK Banquets Tathawade': {
        sheetId: SPREADSHEET_ID,
        halls: [
            {
                name: 'Aster',
                morningRange: 'B4:B33',
                eveningRange: 'C4:C33',
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            },
            {
                name: 'Grand',
                morningRange: 'D4:D33',
                eveningRange: 'E4:E33',
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            },
            {
                name: 'Tulip',
                morningRange: 'F4:F33',
                eveningRange: 'G4:G33',
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            },
            {
                name: 'Lotus',
                morningRange: 'H4:H33',
                eveningRange: 'I4:I33', // Corrected from I4r:I33
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            }
        ]
    },
    'GMK Banquets Ravet': {
        sheetId: SPREADSHEET_ID,
        halls: [
            {
                name: 'Agastya',
                morningRange: 'L4:L33',
                eveningRange: 'M4:M33',
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            },
            {
                name: 'Vyas',
                morningRange: 'N4:N33',
                eveningRange: 'O4:O33',
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            },
            {
                name: 'Lawn',
                morningRange: 'P4:P33',
                eveningRange: 'Q4:Q33',
                morningHeaderOffset: 0,
                eveningHeaderOffset: 0,
            }
        ]
    }
};

export const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const processData = async (location: string, config: LocationConfig, selectedDate: Date, allResults: HallData[]) => {
    const typedLocation = location as 'GMK Banquets Tathawade' | 'GMK Banquets Ravet';
    const { sheetName } = getSheetDetails(selectedDate); // sheetName is now "MONTH YEAR", e.g., "JUN 2025"
    const dayOfMonth = selectedDate.getDate(); // 1-based day of month
    
    for (const hall of config.halls) {
        try {
            // Construct the full sheet name + range string, e.g., "'JUN 2025'!B4:B33"
            const morningRangeString = `'${sheetName}'!${hall.morningRange}`;
            // URL-encode the entire string
            const encodedMorningRange = encodeURIComponent(morningRangeString);
            const morningUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodedMorningRange}?key=${API_KEY}&alt=json`;

            const eveningRangeString = `'${sheetName}'!${hall.eveningRange}`;
            const encodedEveningRange = encodeURIComponent(eveningRangeString);
            const eveningUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodedEveningRange}?key=${API_KEY}&alt=json`;

            console.log(`[${location} - ${hall.name}] Fetching from URLs:`, { morningUrl, eveningUrl });

            // Implement improved retry logic for API requests (max 3 retries)
            let morningResponse, eveningResponse;
            let retries = 0;
            const maxRetries = 3;
            
            // Fetch with timeout function that works across different environments
            const fetchWithTimeout = async (url: string, timeoutMs: number = 15000) => {
                // Create an abort controller with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                
                try {
                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            };
            
            // Custom fetch function with retry logic
            const fetchWithRetry = async (url: string, retryAttempt: number, fetchType: 'Morning' | 'Evening') => {
                try {
                    console.log(`[${location} - ${hall.name}] ${fetchType} attempt ${retryAttempt + 1}: Fetching ${url}`);
                    return await fetchWithTimeout(url, 15000); // 15 second timeout
                } catch (error) {
                    console.error(`[${location} - ${hall.name}] ${fetchType} attempt ${retryAttempt + 1} failed:`, error);
                    
                    if (retryAttempt < maxRetries) {
                        // Exponential backoff with jitter
                        const delay = Math.min(2000 * Math.pow(2, retryAttempt), 10000) + Math.random() * 1000;
                        console.log(`[${location} - ${hall.name}] ${fetchType} retrying in ${Math.round(delay)}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return fetchWithRetry(url, retryAttempt + 1, fetchType);
                    }
                    
                    throw error;
                }
            };
            
            // Fetch both morning and evening data with individual retry logic
            try {
                console.log(`[${location} - ${hall.name}] Starting fetch for both time slots...`);
                
                // Fetch morning data with retries
                morningResponse = await fetchWithRetry(morningUrl, 0, 'Morning');
                
                // Fetch evening data with retries
                eveningResponse = await fetchWithRetry(eveningUrl, 0, 'Evening');
                
                // Check if both responses are successful
                if (!morningResponse.ok || !eveningResponse.ok) {
                    // Log the status for more detailed error information
                    console.error(`API request failed for ${location} - ${hall.name}. Morning status: ${morningResponse.status}, Evening status: ${eveningResponse.status}`);
                    
                    // Try to get response text for better error details
                    let morningText = '', eveningText = '';
                    try { morningText = await morningResponse.text(); } catch {}
                    try { eveningText = await eveningResponse.text(); } catch {}
                    
                    console.error(`Morning response: ${morningText}`);
                    console.error(`Evening response: ${eveningText}`);
                    
                    throw new Error(`API request failed for ${location} - ${hall.name}`);
                }
            } catch (error) {
                console.error(`Failed to fetch data for ${location} - ${hall.name} after all retry attempts:`, error);
                
                // Create fallback responses to continue with default values (hall will be shown as Booked)
                console.log(`Using fallback 'Booked' status for ${location} - ${hall.name}`);
                
                throw new Error(`Failed to fetch data for ${location} - ${hall.name} after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`);
            }

            const [morningData, eveningData] = await Promise.all([
                morningResponse.json() as Promise<GoogleSheetsResponse>,
                eveningResponse.json() as Promise<GoogleSheetsResponse>
            ]);

            // Effective index calculation incorporating header offsets
            const morningHeaderOffset = hall.morningHeaderOffset || 0;
            const eveningHeaderOffset = hall.eveningHeaderOffset || 0;

            // The index in the API's returned 'values' array, after accounting for any header rows within the fetched range.
            // If Day 1 data is at row `morningHeaderOffset` (0-indexed) in the `values` array,
            // then for `dayOfMonth`, the data is at `(dayOfMonth - 1) + morningHeaderOffset`.
            const effectiveMorningDataIndex = (dayOfMonth - 1) + morningHeaderOffset;
            const effectiveEveningDataIndex = (dayOfMonth - 1) + eveningHeaderOffset;

            console.log(`[${location} - ${hall.name}] Date: ${formatDate(selectedDate)}, Day: ${dayOfMonth}`);
            console.log(`[${location} - ${hall.name}] Morning: headerOffset=${morningHeaderOffset}, calculated effectiveDataIndex=${effectiveMorningDataIndex}`);
            console.log(`[${location} - ${hall.name}] Evening: headerOffset=${eveningHeaderOffset}, calculated effectiveDataIndex=${effectiveEveningDataIndex}`);

            if (morningData.values) {
                console.log(`[${location} - ${hall.name}] Morning data: Received ${morningData.values.length} rows. Attempting to access index ${effectiveMorningDataIndex}. Full data for index (if exists):`, morningData.values[effectiveMorningDataIndex]);
            } else {
                console.log(`[${location} - ${hall.name}] Morning data: No 'values' array received from API. This is critical if data was expected.`);
            }

            if (eveningData.values) {
                console.log(`[${location} - ${hall.name}] Evening data: Received ${eveningData.values.length} rows. Attempting to access index ${effectiveEveningDataIndex}. Full data for index (if exists):`, eveningData.values[effectiveEveningDataIndex]);
            } else {
                console.log(`[${location} - ${hall.name}] Evening data: No 'values' array received from API. This is critical if data was expected.`);
            }

            const processSlot = (value: string | undefined, timeSlot: 'Morning' | 'Evening') => {
                let currentStatus: 'Available' | 'Booked';
                const rawValueForLog = value;

                if (value === undefined) {
                    // No data or out-of-range implies unknown status, treat as Booked for safety
                    console.log(`${location} - ${hall.name} ${timeSlot}: Raw value undefined. Interpreting as Booked (fail-safe).`);
                    currentStatus = 'Booked';
                } else {
                    const cleanValue = value.trim().toLowerCase();
                    console.log(`Processing ${location} - ${hall.name} ${timeSlot}:`, {
                        rawValue: value,
                        cleanValue,
                        index: dayOfMonth - 1,
                        date: formatDate(selectedDate)
                    });

                    if (cleanValue === 'vac' || cleanValue === 'vacc' || cleanValue === 'vacant' || cleanValue === '') {
                        // Case 2: Cell has "vac", "vacc", "vacant", or is an empty string (e.g., "", "   ").
                        currentStatus = 'Available';
                    } else if (cleanValue === 'occ' || cleanValue === 'occupied') {
                        // Case 3: Cell has "occ" or "occupied".
                        currentStatus = 'Booked';
                    } else {
                        // Case 4: Cell has some other unexpected text.
                        console.warn(`${location} - ${hall.name} ${timeSlot}: Unexpected value '''${cleanValue}'''. Interpreting as Booked.`);
                        currentStatus = 'Booked';
                    }
                }

                console.log(`Status determined for ${location} - ${hall.name} ${timeSlot}:`, {
                    inputValue: rawValueForLog,
                    resultingStatus: currentStatus
                });

                allResults.push({
                    date: formatDate(selectedDate),
                    location: typedLocation,
                    hallName: hall.name,
                    timeSlot,
                    status: currentStatus
                });
            };

            // Process morning slot
            console.log(`[${location} - ${hall.name}] Attempting to process morning slot for day ${dayOfMonth}, using effectiveDataIndex ${effectiveMorningDataIndex}`);
            if (morningData.values && morningData.values.length > effectiveMorningDataIndex) {
                const rowData = morningData.values[effectiveMorningDataIndex];
                const valueFromArray = rowData && rowData.length > 0 ? rowData[0] : undefined;
                console.log(`[${location} - ${hall.name}] Morning: Extracted value for effectiveDataIndex ${effectiveMorningDataIndex}: '''${valueFromArray}'''. Raw row data at index:`, rowData);
                processSlot(valueFromArray, 'Morning');
            } else {
                console.log(`[${location} - ${hall.name}] Morning: No data at effectiveDataIndex ${effectiveMorningDataIndex} (total rows: ${morningData.values ? morningData.values.length : 'N/A - API returned no values array'}). Passing undefined to processSlot.`);
                processSlot(undefined, 'Morning');
            }

            // Process evening slot
            console.log(`[${location} - ${hall.name}] Attempting to process evening slot for day ${dayOfMonth}, using effectiveDataIndex ${effectiveEveningDataIndex}`);
            if (eveningData.values && eveningData.values.length > effectiveEveningDataIndex) {
                const rowData = eveningData.values[effectiveEveningDataIndex];
                const valueFromArray = rowData && rowData.length > 0 ? rowData[0] : undefined;
                console.log(`[${location} - ${hall.name}] Evening: Extracted value for effectiveDataIndex ${effectiveEveningDataIndex}: '''${valueFromArray}'''. Raw row data at index:`, rowData);
                processSlot(valueFromArray, 'Evening');
            } else {
                console.log(`[${location} - ${hall.name}] Evening: No data at effectiveDataIndex ${effectiveEveningDataIndex} (total rows: ${eveningData.values ? eveningData.values.length : 'N/A - API returned no values array'}). Passing undefined to processSlot.`);
                processSlot(undefined, 'Evening');
            }

        } catch (error) {
            console.error(`Error processing ${location} - ${hall.name}:`, error);
            
            // Provide detailed error message to help with debugging
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error details for ${location} - ${hall.name}: ${errorMessage}`);
            
            // Add default "Booked" status for slots only if they haven't been processed successfully.
            const addFallbackIfNeeded = (slotTime: 'Morning' | 'Evening') => {
                const existingEntry = allResults.find(
                    r => r.location === typedLocation &&
                         r.hallName === hall.name &&
                         r.timeSlot === slotTime &&
                         r.date === formatDate(selectedDate)
                );
                if (!existingEntry) {
                    console.log(`[${location} - ${hall.name}] Adding fallback "Booked" status for ${slotTime} due to hall-level error, as it was not previously processed.`);
                    allResults.push({
                        date: formatDate(selectedDate),
                        location: typedLocation,
                        hallName: hall.name,
                        timeSlot: slotTime,
                        status: 'Booked'
                    });
                } else {
                    console.log(`[${location} - ${hall.name}] ${slotTime} was already processed (status: ${existingEntry.status}). Not applying fallback 'Booked' status despite hall-level error.`);
                }
            };
            addFallbackIfNeeded('Morning');
            addFallbackIfNeeded('Evening');
        }
    }
};

export const fetchHallData = async (selectedDate: Date): Promise<HallData[]> => {
    try {
        console.log('Fetching data for date:', formatDate(selectedDate));
        const { sheetName, daysInMonth, monthName, year } = getSheetDetails(selectedDate);
        console.log(`Fetching from sheet: ${sheetName}, Month has ${daysInMonth} days`);
        
        const allResults: HallData[] = [];

        // Validate the date is within the month's range
        const dayOfMonth = selectedDate.getDate();
        if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
            console.warn(`Invalid date ${formatDate(selectedDate)} for ${monthName} ${year} (has ${daysInMonth} days)`);
            return [];
        }

        // Process each location with individual error handling
        const locationPromises = Object.entries(LOCATIONS).map(async ([location, config]) => {
            try {
                await processData(location, config, selectedDate, allResults);
            } catch (locationError) {
                // Log error but continue processing other locations
                console.error(`Error processing location ${location}:`, locationError);
                
                // Add all halls for this location as "Booked" (failsafe approach)
                config.halls.forEach(hall => {
                    allResults.push(
                        {
                            date: formatDate(selectedDate),
                            location: location as 'GMK Banquets Tathawade' | 'GMK Banquets Ravet',
                            hallName: hall.name,
                            timeSlot: 'Morning',
                            status: 'Booked'
                        },
                        {
                            date: formatDate(selectedDate),
                            location: location as 'GMK Banquets Tathawade' | 'GMK Banquets Ravet',
                            hallName: hall.name,
                            timeSlot: 'Evening',
                            status: 'Booked'
                        }
                    );
                });
            }
        });
        
        // Wait for all locations to be processed (or fail gracefully)
        await Promise.all(locationPromises);

        // Sort results by location and hall name for consistent display
        allResults.sort((a, b) => {
            if (a.location !== b.location) return a.location.localeCompare(b.location);
            if (a.hallName !== b.hallName) return a.hallName.localeCompare(b.hallName);
            return a.timeSlot === 'Morning' ? -1 : 1;
        });

        return allResults;
    } catch (error) {
        console.error('Error fetching hall data:', error);
        if (error instanceof Error) {
            console.error('Error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
        }
        
        // Return an empty array rather than failing completely
        // The UI can still show an error message based on empty results
        return [];
    }
};

export const checkSheetOffsets = async () => {
    console.log('Checking sheet offsets...');
    const date = new Date(2025, 4, 1); // May 1, 2025
    
    for (const [location, config] of Object.entries(LOCATIONS)) {
        console.log(`\n--- Checking ${location} ---`);
        const { sheetName } = getSheetDetails(date); // sheetName is now "MONTH YEAR", e.g., "MAY 2025"
        
        for (const hall of config.halls) {
            try {
                console.log(`\n${location} - ${hall.name}:`);
                
                // Fetch morning data to examine structure
                const morningRangeString = `'${sheetName}'!${hall.morningRange}`;
                const encodedMorningRange = encodeURIComponent(morningRangeString);
                const morningUrl = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodedMorningRange}?key=${API_KEY}&alt=json`;
                console.log(`- Fetching morning data from: ${morningUrl}`);
                
                const morningResponse = await fetch(morningUrl);
                if (!morningResponse.ok) {
                    console.log(`  ❌ API request failed: ${morningResponse.status}`);
                    continue;
                }
                
                const morningData = await morningResponse.json() as GoogleSheetsResponse;
                if (morningData.values && morningData.values.length > 0) {
                    console.log(`  ✓ Got ${morningData.values.length} rows`);
                    console.log(`  ➤ First row (index 0): ${JSON.stringify(morningData.values[0])}`);
                    console.log(`  ➤ Second row (index 1): ${morningData.values[1] ? JSON.stringify(morningData.values[1]) : 'N/A'}`);
                    console.log(`  ➤ Third row (index 2): ${morningData.values[2] ? JSON.stringify(morningData.values[2]) : 'N/A'}`);
                    
                    // Check the value at index 0 (which would be day 1 if offset is 0)
                    const valueAtZero = morningData.values[0] && morningData.values[0].length > 0 
                        ? morningData.values[0][0] 
                        : 'undefined';
                    console.log(`  ➤ Value at index 0: '${valueAtZero}'`);
                    
                    // Check for entire range values to analyze pattern
                    if (morningData.values.length >= 3) {
                        for (let i = 0; i < Math.min(5, morningData.values.length); i++) {
                            const val = morningData.values[i] && morningData.values[i].length > 0 
                                ? morningData.values[i][0] 
                                : 'undefined';
                            console.log(`  ➤ Row ${i}: '${val}'`);
                        }
                    }
                } else {
                    console.log('  ❌ No values array in response');
                }
            } catch (error) {
                console.error(`  ❌ Error checking ${location} - ${hall.name}:`, error);
            }
        }
    }
};

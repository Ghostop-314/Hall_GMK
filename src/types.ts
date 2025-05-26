export interface HallData {
    date: string;
    location: 'GMK BANQUETS TATHAWADE' | 'MADHURA BANQUET' | 'GMK BANQUETS RAVET'; // Changed to uppercase
    hallName: string;
    timeSlot: 'Morning' | 'Evening';
    status: 'Available' | 'Booked';
}

// Define a more specific Hall type to include header offsets
export interface Hall {
    name: string;
    morningRange: string;  // e.g., "B2:B31" for morning slot
    eveningRange: string;  // e.g., "C2:C31" for evening slot
    morningHeaderOffset?: number; // Optional: Number of header rows at the START of the morningRange data
    eveningHeaderOffset?: number; // Optional: Number of header rows at the START of the eveningRange data
}

export interface LocationConfig {
    sheetId: string;
    halls: Hall[]; // Use the new Hall interface
}

export interface GoogleSheetsResponse {
    values: string[][];
}

# Hall Availability App

A React Native application built with Expo that displays hall availability from a Google Sheets database.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Google Sheets API:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google Sheets API
   - Create credentials (API key)
   - Copy your API key

3. Update the API configuration:
   - Open `src/services/api.ts`
   - Replace `YOUR_SHEET_ID` with your Google Sheet ID
   - Replace `YOUR_API_KEY` with your API key

4. Start the app:
```bash
npm run ios     # for iOS
npm run android # for Android
npm run web     # for web browser
```

## Google Sheets Structure

The app expects your Google Sheet to have the following columns:
1. Date (YYYY-MM-DD format)
2. Hall Name
3. Status (Available/Booked)

Example:
```
Date        | Hall Name  | Status
2023-05-15  | Main Hall  | Available
2023-05-15  | Room 101   | Booked
```

## Features

- Date picker for selecting dates
- Large, touch-friendly buttons
- Clear visual status indicators
- One-handed operation optimized
- Clean, distraction-free interface

# Monthly Chrome Review

A Chrome extension that analyzes your browsing history with a beautiful calendar interface. Click on any day to see detailed summaries for each domain including time spent and page visit statistics.

## Features

- **Calendar View**: Interactive full-screen calendar showing your browsing activity
- **Visual Indicators**: Days with browsing activity are highlighted with quick stats
- **Month Navigation**: Easily browse through different months
- **Daily Analysis**: Click any day to see detailed browsing patterns
- **Domain Grouping**: Groups all visits by domain for easy overview
- **Visit Statistics**: Shows number of visits, unique pages, and estimated time spent
- **Modern Interface**: Beautiful, responsive UI with smooth transitions

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select the `month-chrome-review` folder
4. The extension will appear in your Chrome toolbar

## Usage

1. Click the extension icon in your Chrome toolbar to open the calendar view
2. Navigate between months using the Previous/Next buttons
3. Days with browsing activity will show quick stats (number of sites and visits)
4. Click on any day to see detailed browsing analysis in the right panel
5. The current day is automatically selected when you open the extension

## Data Displayed

For each day, you'll see:
- **Total summary**: Number of domains, total visits, and unique pages
- **Domain breakdown**: For each domain visited:
  - Domain name
  - Number of unique pages visited
  - Total visit count
  - Estimated time spent

## Interface

- **Left Panel**: Interactive calendar with visual indicators
- **Right Panel**: Detailed statistics for the selected day
- **Top Controls**: Month navigation and current month display
- **Responsive Design**: Works on different screen sizes

## Permissions

This extension requires:
- **History**: To read your browsing history data
- **Storage**: To cache analysis results for better performance

## Privacy

All data processing happens locally in your browser. No browsing data is sent to external servers.

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `calendar.html/js`: Main calendar interface and functionality
- `background.js`: Service worker that handles extension icon clicks
- `icons/`: Extension icons (16px, 48px, 128px)
- `popup.html/js`: Legacy popup files (now unused)

## Technical Notes

- Time estimation is based on a simple heuristic (2 minutes per page visit)
- History analysis is limited to 10,000 items per day for performance
- Data is cached for faster navigation between days
- The extension uses Chrome's History API for data access
- Calendar automatically highlights days with browsing activity 
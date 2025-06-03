// Background service worker for Monthly Chrome Review extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Monthly Chrome Review extension installed');
});

// Handle extension icon click to open full-screen calendar view
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('calendar.html')
  });
});

// Optional: You can add background tasks here if needed in the future
// For example, periodic analysis or data caching 
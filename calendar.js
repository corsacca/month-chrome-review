document.addEventListener('DOMContentLoaded', function() {
  let currentDate = new Date();
  let selectedDate = null;
  let historyCache = new Map();
  let currentViewMode = 'domains'; // 'domains' or 'chronological'
  
  const elements = {
    calendarGrid: document.getElementById('calendarGrid'),
    currentMonth: document.getElementById('currentMonth'),
    prevMonth: document.getElementById('prevMonth'),
    nextMonth: document.getElementById('nextMonth'),
    statsContent: document.getElementById('statsContent')
  };

  // Initialize calendar
  renderCalendar();
  
  // Event listeners
  elements.prevMonth.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  
  elements.nextMonth.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month display
    elements.currentMonth.textContent = currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
    
    // Clear existing days (keep headers)
    const dayElements = elements.calendarGrid.querySelectorAll('.calendar-day');
    dayElements.forEach(el => el.remove());
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Adjust starting day for Monday start (0=Sunday, 1=Monday, etc.)
    // Convert to Monday-based week (0=Monday, 1=Tuesday, ..., 6=Sunday)
    let startingDay = firstDay.getDay();
    startingDay = startingDay === 0 ? 6 : startingDay - 1; // Sunday becomes 6, others shift down by 1
    
    // Add previous month's trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const dayElement = createDayElement(dayNum, true, new Date(year, month - 1, dayNum));
      elements.calendarGrid.appendChild(dayElement);
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayElement = createDayElement(day, false, date);
      elements.calendarGrid.appendChild(dayElement);
    }
    
    // Add next month's leading days
    const totalCells = elements.calendarGrid.children.length - 7; // Subtract headers
    const remainingCells = 42 - totalCells; // Standard calendar grid is 6 weeks
    for (let day = 1; day <= remainingCells; day++) {
      const dayElement = createDayElement(day, true, new Date(year, month + 1, day));
      elements.calendarGrid.appendChild(dayElement);
    }
    
    // Pre-load history data for visible month
    preloadHistoryData(year, month);
  }

  function createDayElement(dayNum, isOtherMonth, date) {
    const dayElement = document.createElement('div');
    
    // Check if it's a weekend (Saturday = 6, Sunday = 0)
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    dayElement.className = `calendar-day ${isOtherMonth ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''}`;
    dayElement.innerHTML = `
      <div class="day-number">${dayNum}</div>
      <div class="day-stats" id="stats-${date.getTime()}"></div>
    `;
    
    if (!isOtherMonth) {
      dayElement.addEventListener('click', () => selectDay(date, dayElement));
    }
    
    return dayElement;
  }

  async function selectDay(date, dayElement) {
    // Remove previous selection
    document.querySelectorAll('.calendar-day.selected').forEach(el => {
      el.classList.remove('selected');
    });
    
    // Add selection to clicked day
    dayElement.classList.add('selected');
    selectedDate = date;
    
    // Show loading state
    elements.statsContent.innerHTML = '<div class="loading">Loading browsing data...</div>';
    
    try {
      const analysis = await getHistoryForDate(date);
      displayDayStats(analysis, date);
    } catch (error) {
      elements.statsContent.innerHTML = `<div class="error">Failed to load data: ${error.message}</div>`;
    }
  }

  async function getHistoryForDate(date) {
    const dateKey = date.toDateString();
    
    if (historyCache.has(dateKey)) {
      return historyCache.get(dateKey);
    }
    
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    const historyItems = await chrome.history.search({
      text: '',
      startTime: startDate.getTime(),
      endTime: endDate.getTime(),
      maxResults: 10000
    });
    
    const analysis = await analyzeHistoryData(historyItems, date, startDate.getTime(), endDate.getTime());
    historyCache.set(dateKey, analysis);
    
    return analysis;
  }

  async function analyzeHistoryData(historyItems, targetDate, startTime, endTime) {
    const domainData = new Map();
    const allVisits = [];
    
    // Get detailed visit information for each URL
    const urlVisitPromises = historyItems.map(async (item) => {
      try {
        const visits = await chrome.history.getVisits({ url: item.url });
        // Filter visits that occurred on the target date
        const dayVisits = visits.filter(visit => 
          visit.visitTime >= startTime && visit.visitTime <= endTime
        );
        
        const url = new URL(item.url);
        
        // Add each visit to our collection with metadata
        dayVisits.forEach(visit => {
          allVisits.push({
            url: item.url,
            domain: url.hostname,
            title: item.title || url.pathname,
            visitTime: visit.visitTime,
            transition: visit.transition
          });
        });
        
        return {
          url: item.url,
          domain: url.hostname,
          title: item.title || url.pathname,
          visitCount: dayVisits.length,
          lastVisitTime: dayVisits.length > 0 ? Math.max(...dayVisits.map(v => v.visitTime)) : item.lastVisitTime
        };
      } catch (e) {
        // Skip invalid URLs
        return null;
      }
    });
    
    const urlVisitData = (await Promise.all(urlVisitPromises)).filter(data => data && data.visitCount > 0);
    
    // Sort all visits chronologically to calculate time spent
    allVisits.sort((a, b) => a.visitTime - b.visitTime);
    
    // Calculate time spent for each visit
    const visitDurations = allVisits.map((visit, index) => {
      const nextVisit = allVisits[index + 1];
      let timeSpent;
      
      if (nextVisit) {
        // Time until next page visit
        timeSpent = (nextVisit.visitTime - visit.visitTime) / 1000; // Convert to seconds
        
        // Apply constraints
        const MAX_SESSION_TIME = 30 * 60; // 30 minutes max
        const MIN_TIME = 10; // 10 seconds minimum
        
        timeSpent = Math.min(timeSpent, MAX_SESSION_TIME);
        timeSpent = Math.max(timeSpent, MIN_TIME);
      } else {
        // Last visit of the day - use default duration
        timeSpent = 2 * 60; // 2 minutes default
      }
      
      return {
        ...visit,
        timeSpent: timeSpent
      };
    });
    
    // Group by domain and calculate totals
    visitDurations.forEach(visit => {
      const domain = visit.domain;
      
      if (!domainData.has(domain)) {
        domainData.set(domain, {
          domain: domain,
          visitCount: 0,
          totalTime: 0,
          lastVisit: null,
          urls: new Set(),
          pages: new Map() // Changed to Map to accumulate data per URL
        });
      }
      
      const domainInfo = domainData.get(domain);
      domainInfo.visitCount += 1;
      domainInfo.totalTime += visit.timeSpent;
      domainInfo.urls.add(visit.url);
      
      // Accumulate page data
      if (!domainInfo.pages.has(visit.url)) {
        domainInfo.pages.set(visit.url, {
          url: visit.url,
          title: visit.title,
          visitCount: 0,
          totalTime: 0,
          lastVisitTime: visit.visitTime
        });
      }
      
      const pageInfo = domainInfo.pages.get(visit.url);
      pageInfo.visitCount += 1;
      pageInfo.totalTime += visit.timeSpent;
      
      if (visit.visitTime > pageInfo.lastVisitTime) {
        pageInfo.lastVisitTime = visit.visitTime;
      }
      
      const visitDate = new Date(visit.visitTime);
      if (!domainInfo.lastVisit || visitDate > domainInfo.lastVisit) {
        domainInfo.lastVisit = visitDate;
      }
    });
    
    // Convert pages Map to Array and sort
    domainData.forEach((data) => {
      data.pages = Array.from(data.pages.values());
      
      // Sort pages by total time spent first, then by visit count
      data.pages.sort((a, b) => {
        if (Math.abs(b.totalTime - a.totalTime) > 60) { // If time difference > 1 minute
          return b.totalTime - a.totalTime;
        }
        return b.visitCount - a.visitCount;
      });
    });
    
    const sortedDomains = Array.from(domainData.values())
      .sort((a, b) => b.totalTime - a.totalTime); // Sort by total time spent
    
    return {
      date: targetDate.toDateString(),
      domains: sortedDomains,
      chronologicalVisits: visitDurations, // Add chronological data
      totalDomains: sortedDomains.length,
      totalVisits: sortedDomains.reduce((sum, domain) => sum + domain.visitCount, 0),
      totalPages: sortedDomains.reduce((sum, domain) => sum + domain.urls.size, 0),
      totalTime: sortedDomains.reduce((sum, domain) => sum + domain.totalTime, 0)
    };
  }

  function displayDayStats(analysis, date) {
    if (analysis.domains.length === 0) {
      elements.statsContent.innerHTML = `
        <div class="stats-header">
          <div class="stats-title">${analysis.date}</div>
          <div class="stats-summary">No browsing activity</div>
        </div>
        <div class="no-data">No browsing history found for this date.</div>
      `;
      return;
    }

    // Helper function to format time duration
    function formatTime(seconds) {
      if (seconds < 60) {
        return `${Math.round(seconds)}s`;
      } else if (seconds < 3600) {
        return `${Math.round(seconds / 60)}m`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }
    }

    const totalTimeFormatted = formatTime(analysis.totalTime);

    const html = `
      <div class="stats-header">
        <div class="stats-title">${analysis.date}</div>
        <div class="stats-summary">
          ${analysis.totalDomains} domains • ${analysis.totalVisits} visits • ${totalTimeFormatted} total time
        </div>
        <div class="view-toggle">
          <button class="toggle-btn ${currentViewMode === 'domains' ? 'active' : ''}" data-view="domains">
            By Domain
          </button>
          <button class="toggle-btn ${currentViewMode === 'chronological' ? 'active' : ''}" data-view="chronological">
            By Time
          </button>
        </div>
      </div>
      ${currentViewMode === 'domains' ? renderDomainView(analysis) : renderChronologicalView(analysis)}
    `;
    
    elements.statsContent.innerHTML = html;
    
    // Add toggle button handlers
    const toggleButtons = elements.statsContent.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const newViewMode = button.dataset.view;
        if (newViewMode !== currentViewMode) {
          currentViewMode = newViewMode;
          displayDayStats(analysis, date);
        }
      });
    });

    if (currentViewMode === 'domains') {
      // Add click handlers for domain expansion
      const domainItems = elements.statsContent.querySelectorAll('.domain-item');
      domainItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleDomainExpansion(item);
        });
      });
    }

    // Prevent page links from triggering other actions
    const pageLinks = elements.statsContent.querySelectorAll('.page-link');
    pageLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }

  function renderDomainView(analysis) {
    // Helper function to format time duration
    function formatTime(seconds) {
      if (seconds < 60) {
        return `${Math.round(seconds)}s`;
      } else if (seconds < 3600) {
        return `${Math.round(seconds / 60)}m`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }
    }

    return `
      <ul class="domain-list">
        ${analysis.domains.map((domain, index) => `
          <li class="domain-item" data-domain-index="${index}">
            <div class="domain-header">
              <div class="domain-name">
                <span class="expand-icon">▶</span>
                ${domain.domain}
              </div>
              <div class="domain-stats">
                <div class="stat-item">
                  <span class="stat-value">${domain.visitCount}</span>
                  <span>visits</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">${formatTime(domain.totalTime)}</span>
                  <span>time</span>
                </div>
              </div>
            </div>
            <div class="domain-details">
              <span>${domain.urls.size} unique pages</span>
            </div>
            <div class="pages-list">
              ${domain.pages.map(page => `
                <div class="page-item">
                  <div class="page-title">${escapeHtml(page.title)}</div>
                  <div class="page-url">
                    <a href="${escapeHtml(page.url)}" target="_blank" rel="noopener noreferrer" class="page-link">
                      ${escapeHtml(page.url)}
                    </a>
                  </div>
                  <div class="page-stats">
                    <span class="page-visits">${page.visitCount} visit${page.visitCount > 1 ? 's' : ''}</span>
                    <span class="page-time">${formatTime(page.totalTime)} total</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function renderChronologicalView(analysis) {
    // Helper function to format time duration
    function formatTime(seconds) {
      if (seconds < 60) {
        return `${Math.round(seconds)}s`;
      } else if (seconds < 3600) {
        return `${Math.round(seconds / 60)}m`;
      } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }
    }

    // Helper function to format visit time
    function formatVisitTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    }

    return `
      <ul class="chronological-list">
        ${analysis.chronologicalVisits.map(visit => `
          <li class="chronological-item">
            <div class="visit-time">${formatVisitTime(visit.visitTime)}</div>
            <div class="visit-content">
              <div class="visit-title">${escapeHtml(visit.title)}</div>
              <div class="visit-url">
                <a href="${escapeHtml(visit.url)}" target="_blank" rel="noopener noreferrer" class="page-link">
                  ${escapeHtml(visit.url)}
                </a>
              </div>
              <div class="visit-stats">
                <span class="visit-domain">${visit.domain}</span>
                <span class="visit-duration">${formatTime(visit.timeSpent)}</span>
              </div>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function toggleDomainExpansion(domainItem) {
    const isExpanded = domainItem.classList.contains('expanded');
    
    if (isExpanded) {
      domainItem.classList.remove('expanded');
    } else {
      // Collapse all other domains first
      const allDomains = elements.statsContent.querySelectorAll('.domain-item');
      allDomains.forEach(item => item.classList.remove('expanded'));
      
      // Expand this domain
      domainItem.classList.add('expanded');
    }
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
  }

  async function preloadHistoryData(year, month) {
    // Preload data for the current month to show indicators
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = date.toDateString();
      
      if (!historyCache.has(dateKey)) {
        // Load data in background
        getHistoryForDate(date).then(analysis => {
          updateDayIndicator(date, analysis);
        }).catch(() => {
          // Ignore errors for background loading
        });
      } else {
        updateDayIndicator(date, historyCache.get(dateKey));
      }
    }
  }

  function updateDayIndicator(date, analysis) {
    const statsElement = document.getElementById(`stats-${date.getTime()}`);
    if (statsElement) {
      const dayElement = statsElement.closest('.calendar-day');
      
      if (analysis.totalVisits > 0) {
        dayElement.classList.add('has-data');
        
        // Helper function to format time for day indicators
        function formatTimeShort(seconds) {
          if (seconds < 60) {
            return `${Math.round(seconds)}s`;
          } else if (seconds < 3600) {
            return `${Math.round(seconds / 60)}m`;
          } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.round((seconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
          }
        }
        
        statsElement.innerHTML = `
          <div>${analysis.totalDomains} sites</div>
          <div>${formatTimeShort(analysis.totalTime)}</div>
        `;
      }
    }
  }

  // Auto-select today if it's in the current month view
  function selectTodayIfVisible() {
    const today = new Date();
    if (today.getMonth() === currentDate.getMonth() && 
        today.getFullYear() === currentDate.getFullYear()) {
      
      setTimeout(() => {
        const todayElement = document.querySelector(`[id="stats-${today.getTime()}"]`)?.closest('.calendar-day');
        if (todayElement && !todayElement.classList.contains('other-month')) {
          selectDay(today, todayElement);
        }
      }, 100);
    }
  }

  // Select today when page loads
  selectTodayIfVisible();
}); 
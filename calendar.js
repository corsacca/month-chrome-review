document.addEventListener('DOMContentLoaded', function() {
  let currentDate = new Date();
  let selectedDate = null;
  let historyCache = new Map();
  
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
    const startingDay = firstDay.getDay();
    
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
    dayElement.className = `calendar-day ${isOtherMonth ? 'other-month' : ''}`;
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
    
    // Get detailed visit information for each URL
    const urlVisitPromises = historyItems.map(async (item) => {
      try {
        const visits = await chrome.history.getVisits({ url: item.url });
        // Count visits that occurred on the target date
        const dayVisits = visits.filter(visit => 
          visit.visitTime >= startTime && visit.visitTime <= endTime
        );
        
        const url = new URL(item.url);
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
    
    // Now process the URLs with accurate visit counts
    urlVisitData.forEach(urlData => {
      const domain = urlData.domain;
      
      if (!domainData.has(domain)) {
        domainData.set(domain, {
          domain: domain,
          visitCount: 0,
          totalTime: 0,
          lastVisit: null,
          urls: new Set(),
          pages: []
        });
      }
      
      const domainInfo = domainData.get(domain);
      domainInfo.visitCount += urlData.visitCount;
      domainInfo.urls.add(urlData.url);
      
      // Store detailed page information
      domainInfo.pages.push({
        url: urlData.url,
        title: urlData.title,
        visitCount: urlData.visitCount,
        lastVisitTime: urlData.lastVisitTime
      });
      
      if (urlData.lastVisitTime) {
        const visitDate = new Date(urlData.lastVisitTime);
        if (!domainInfo.lastVisit || visitDate > domainInfo.lastVisit) {
          domainInfo.lastVisit = visitDate;
        }
      }
    });
    
    // Process pages for each domain
    domainData.forEach((data) => {
      // Sort pages by visit count first, then by last visit time
      data.pages.sort((a, b) => {
        if (b.visitCount !== a.visitCount) {
          return b.visitCount - a.visitCount;
        }
        return new Date(b.lastVisitTime) - new Date(a.lastVisitTime);
      });
      
      // Estimate time spent based on actual visit counts
      data.totalTime = data.visitCount * 1.5; // 1.5 minutes per visit
    });
    
    const sortedDomains = Array.from(domainData.values())
      .sort((a, b) => b.visitCount - a.visitCount);
    
    return {
      date: targetDate.toDateString(),
      domains: sortedDomains,
      totalDomains: sortedDomains.length,
      totalVisits: sortedDomains.reduce((sum, domain) => sum + domain.visitCount, 0),
      totalPages: sortedDomains.reduce((sum, domain) => sum + domain.urls.size, 0)
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

    const html = `
      <div class="stats-header">
        <div class="stats-title">${analysis.date}</div>
        <div class="stats-summary">
          ${analysis.totalDomains} domains • ${analysis.totalVisits} visits • ${analysis.totalPages} unique pages
        </div>
      </div>
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
                  <span class="stat-value">~${domain.totalTime}m</span>
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
                  <div class="page-url">${escapeHtml(page.url)}</div>
                  <div class="page-visits">${page.visitCount} visit${page.visitCount > 1 ? 's' : ''}</div>
                </div>
              `).join('')}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    
    elements.statsContent.innerHTML = html;
    
    // Add click handlers for domain expansion
    const domainItems = elements.statsContent.querySelectorAll('.domain-item');
    domainItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDomainExpansion(item);
      });
    });
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
        statsElement.innerHTML = `
          <div>${analysis.totalDomains} sites</div>
          <div>${analysis.totalVisits} visits</div>
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
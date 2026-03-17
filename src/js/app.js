/**
 * Main application entry point.
 * Loads config data, initializes the hash-based router, and manages nav state.
 */

import { loadSeasonData, loadSectionData, loadPlatformData, loadPackagesData, loadTmTradeValues } from './data.js';
import { initStorage } from './storage.js';
import { renderSchedule } from './views/schedule.js';
import { renderGameDetail } from './views/game-detail.js';
import { renderMyTickets } from './views/my-tickets.js';
import { renderSettings } from './views/settings.js';
import { renderFinancials } from './views/financials.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const appDiv = document.getElementById('app');

// Track last main view so game detail knows where to go back to
function getLastMainView() {
  return sessionStorage.getItem('bjt-last-view') || 'schedule';
}
function setLastMainView(view) {
  sessionStorage.setItem('bjt-last-view', view);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Show loading state
  appDiv.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <span>Loading data&hellip;</span>
    </div>
  `;

  try {
    await Promise.all([
      loadSeasonData(),
      loadSectionData(),
      loadPlatformData(),
      loadPackagesData(),
      loadTmTradeValues(),
      initStorage(),
    ]);
  } catch (err) {
    appDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <p>Failed to load data. Make sure you're running from a web server, not file://.</p>
        <p class="text-muted mt-8" style="font-size:13px;">${escapeHTML(err.message)}</p>
      </div>
    `;
    return;
  }

  // Wire up nav tabs to change the hash
  document.querySelectorAll('.nav-tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab');
      window.location.hash = name === 'schedule' ? '#/schedule' : `#/${name}`;
    });
  });

  // Listen for hash changes
  window.addEventListener('hashchange', () => route());

  // Initial route
  route();
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Read window.location.hash and render the matching view.
 */
function route() {
  const hash = window.location.hash || '#/schedule';

  // Update active nav tab
  updateActiveTab(hash);

  try {
    if (hash === '#/schedule' || hash === '#/' || hash === '#' || hash === '') {
      setLastMainView('schedule');
      renderSchedule(appDiv);
    } else if (hash.startsWith('#/game/')) {
      const date = hash.slice('#/game/'.length).split('?')[0];
      renderGameDetail(appDiv, date, getLastMainView());
    } else if (hash === '#/my-tickets') {
      setLastMainView('my-tickets');
      renderMyTickets(appDiv);
    } else if (hash === '#/financials') {
      setLastMainView('financials');
      renderFinancials(appDiv);
    } else if (hash === '#/settings') {
      renderSettings(appDiv);
    } else {
      // Unknown route — fall back to schedule
      renderSchedule(appDiv);
    }
  } catch (err) {
    appDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9888;</div>
        <p>Something went wrong while rendering this view.</p>
        <p class="text-muted mt-8" style="font-size:13px;">${escapeHTML(err.message)}</p>
      </div>
    `;
  }
}

// ---------------------------------------------------------------------------
// Nav highlighting
// ---------------------------------------------------------------------------

/**
 * Set the `active` class (and aria-selected) on the nav tab matching the
 * current hash, and remove it from all others.
 * @param {string} hash - The current window.location.hash value.
 */
function updateActiveTab(hash) {
  let activeTab = 'schedule';

  if (hash === '#/my-tickets') {
    activeTab = 'my-tickets';
  } else if (hash === '#/financials') {
    activeTab = 'financials';
  } else if (hash === '#/settings') {
    activeTab = 'settings';
  } else if (hash.startsWith('#/game/')) {
    activeTab = getLastMainView();
  }

  document.querySelectorAll('.nav-tab[data-tab]').forEach((tab) => {
    const isActive = tab.getAttribute('data-tab') === activeTab;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


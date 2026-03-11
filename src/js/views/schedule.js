import { getGames, getOpponents } from '../data.js';
import { getMyTickets, getTicketForGame, getMarketPrices } from '../storage.js';
import { formatDateShort, formatTime, formatCurrency, getStatusConfig } from '../utils.js';

// ---------------------------------------------------------------------------
// Schedule-specific helpers
// ---------------------------------------------------------------------------

function truncate(str, len = 40) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function monthFromDate(isoDate) {
  return Number(isoDate.split('-')[1]);
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

const MONTH_OPTIONS = [
  { value: 'all', label: 'All Months' },
  { value: '3',   label: 'March' },
  { value: '4',   label: 'April' },
  { value: '5',   label: 'May' },
  { value: '6',   label: 'June' },
  { value: '7',   label: 'July' },
  { value: '8',   label: 'August' },
  { value: '9',   label: 'September' },
];

// ---------------------------------------------------------------------------
// DOM builders
// ---------------------------------------------------------------------------

function buildFilterBar(opponents) {
  const bar = document.createElement('div');
  bar.className = 'schedule-filters';

  const monthSelect = document.createElement('select');
  monthSelect.id = 'filter-month';
  monthSelect.className = 'filter-select';
  monthSelect.setAttribute('aria-label', 'Filter by month');
  for (const opt of MONTH_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    monthSelect.appendChild(o);
  }

  const oppSelect = document.createElement('select');
  oppSelect.id = 'filter-opponent';
  oppSelect.className = 'filter-select';
  oppSelect.setAttribute('aria-label', 'Filter by opponent');
  const allOpp = document.createElement('option');
  allOpp.value = 'all';
  allOpp.textContent = 'All Opponents';
  oppSelect.appendChild(allOpp);
  for (const name of opponents) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    oppSelect.appendChild(o);
  }

  const myGamesLabel = document.createElement('label');
  myGamesLabel.className = 'filter-checkbox';
  const myGamesInput = document.createElement('input');
  myGamesInput.type = 'checkbox';
  myGamesInput.id = 'filter-my-games';
  myGamesLabel.appendChild(myGamesInput);
  myGamesLabel.appendChild(document.createTextNode(' My Games Only'));

  const promoLabel = document.createElement('label');
  promoLabel.className = 'filter-checkbox';
  const promoInput = document.createElement('input');
  promoInput.type = 'checkbox';
  promoInput.id = 'filter-promotions';
  promoLabel.appendChild(promoInput);
  promoLabel.appendChild(document.createTextNode(' Promotions Only'));

  bar.appendChild(monthSelect);
  bar.appendChild(oppSelect);
  bar.appendChild(myGamesLabel);
  bar.appendChild(promoLabel);

  return bar;
}

function buildSummaryBar() {
  const bar = document.createElement('div');
  bar.className = 'schedule-summary';
  bar.id = 'schedule-summary';
  return bar;
}

function updateSummary(summaryEl, filteredGames, allGames) {
  const total = allGames.length;
  const showing = filteredGames.length;

  let html = `Showing <strong>${showing}</strong> of <strong>${total}</strong> games`;

  const ticketedGames = filteredGames.filter(g => {
    const t = getTicketForGame(g.date);
    return t && (t.status || '').toUpperCase() !== 'TRADED';
  });
  if (ticketedGames.length > 0) {
    let totalSpent = 0;
    for (const g of ticketedGames) {
      const t = getTicketForGame(g.date);
      if (t && t.totalCost != null) totalSpent += Number(t.totalCost);
    }
    html += ` &nbsp;|&nbsp; You have tickets to <strong>${ticketedGames.length}</strong> games`;
    html += ` &nbsp;|&nbsp; Total spent: <strong>${formatCurrency(totalSpent)}</strong>`;
  }

  summaryEl.innerHTML = html;
}

function buildTable(games) {
  const table = document.createElement('table');
  table.className = 'schedule-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Date</th>
      <th>Opponent</th>
      <th>Time</th>
      <th>Promotion</th>
      <th>My Status</th>
      <th>Qty</th>
      <th>Cost</th>
      <th>SG Price</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.id = 'schedule-body';
  table.appendChild(tbody);

  populateRows(tbody, games);

  return table;
}

function populateRows(tbody, games) {
  tbody.innerHTML = '';

  if (games.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'schedule-empty-row';
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'No games match the current filters.';
    td.className = 'schedule-empty';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const allPrices = getMarketPrices();

  games.forEach((game, idx) => {
    const ticket = getTicketForGame(game.date);
    const tr = document.createElement('tr');
    tr.className = 'schedule-row';

    if (idx % 2 === 1) tr.classList.add('schedule-row-alt');
    if (ticket) {
      const st = (ticket.status || '').toUpperCase();
      if (st === 'TRADED') tr.classList.add('schedule-row-traded');
      else if (st === 'SELL') tr.classList.add('schedule-row-sell');
      else tr.classList.add('schedule-row-has-ticket');
    }

    tr.setAttribute('role', 'link');
    tr.setAttribute('tabindex', '0');
    tr.dataset.date = game.date;

    const navigate = () => { window.location.hash = `#/game/${game.date}`; };
    tr.addEventListener('click', navigate);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(); }
    });

    // Date
    const tdDate = document.createElement('td');
    tdDate.className = 'col-date';
    tdDate.textContent = formatDateShort(game.date);
    tr.appendChild(tdDate);

    // Opponent
    const tdOpp = document.createElement('td');
    tdOpp.className = 'col-opponent';
    tdOpp.textContent = game.opponent;
    tr.appendChild(tdOpp);

    // Time
    const tdTime = document.createElement('td');
    tdTime.className = 'col-time';
    tdTime.textContent = formatTime(game.startTime);
    tr.appendChild(tdTime);

    // Promotion
    const tdPromo = document.createElement('td');
    tdPromo.className = 'col-promotion';
    if (game.promotion && game.promotion.name) {
      const promoSpan = document.createElement('span');
      promoSpan.className = 'promo-name';
      promoSpan.textContent = truncate(game.promotion.name, 40);
      if (game.promotion.name.length > 40) promoSpan.title = game.promotion.name;
      tdPromo.appendChild(promoSpan);

      if (game.promotion.type) {
        const promoBadge = document.createElement('span');
        promoBadge.className = 'promo-badge';
        promoBadge.textContent = game.promotion.type;
        tdPromo.appendChild(promoBadge);
      }
    }
    tr.appendChild(tdPromo);

    // My Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'col-status';
    if (ticket && ticket.status) {
      const cfg = getStatusConfig(ticket.status);
      const badge = document.createElement('span');
      badge.className = `badge ${cfg.cssClass}`;
      badge.textContent = ticket.status;
      tdStatus.appendChild(badge);
    }
    tr.appendChild(tdStatus);

    // Qty
    const tdQty = document.createElement('td');
    tdQty.className = 'col-qty';
    if (ticket && ticket.quantity != null) {
      tdQty.textContent = ticket.quantity;
      if (ticket.sets && ticket.sets.length > 1) {
        const setBadge = document.createElement('span');
        setBadge.style.cssText = 'font-size:10px;color:var(--color-text-secondary);margin-left:2px;';
        setBadge.textContent = `(${ticket.sets.length})`;
        setBadge.title = `${ticket.sets.length} ticket sets`;
        tdQty.appendChild(setBadge);
      }
    }
    tr.appendChild(tdQty);

    // Cost
    const tdCost = document.createElement('td');
    tdCost.className = 'col-cost';
    tdCost.textContent = ticket && ticket.totalCost != null ? formatCurrency(ticket.totalCost) : '';
    tr.appendChild(tdCost);

    // SG price
    const tdSG = document.createElement('td');
    tdSG.className = 'col-sg';
    const gamePrices = allPrices[game.date];
    const priceSec = gamePrices?.primarySection || ticket?.section || '231';
    const sgPrice = gamePrices?.sections?.[priceSec];
    tdSG.textContent = sgPrice != null ? formatCurrency(sgPrice) : '';
    if (sgPrice != null) tdSG.title = `Sec ${priceSec} low`;
    tr.appendChild(tdSG);

    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// Filtering logic
// ---------------------------------------------------------------------------

function applyFilters(allGames) {
  const monthVal = document.getElementById('filter-month')?.value;
  const oppVal   = document.getElementById('filter-opponent')?.value;
  const myOnly   = document.getElementById('filter-my-games')?.checked;
  const promoOnly = document.getElementById('filter-promotions')?.checked;

  let filtered = allGames;

  if (monthVal && monthVal !== 'all') {
    const m = Number(monthVal);
    filtered = filtered.filter(g => monthFromDate(g.date) === m);
  }

  if (oppVal && oppVal !== 'all') {
    filtered = filtered.filter(g => g.opponent === oppVal);
  }

  if (myOnly) {
    filtered = filtered.filter(g => getTicketForGame(g.date));
  }

  if (promoOnly) {
    filtered = filtered.filter(g => g.promotion && g.promotion.name);
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderSchedule(container) {
  container.innerHTML = '';

  const allGames = getGames();
  const opponents = getOpponents();

  const wrapper = document.createElement('div');
  wrapper.className = 'schedule-view';

  const heading = document.createElement('h2');
  heading.className = 'schedule-heading';
  heading.textContent = '2026 Home Schedule';
  wrapper.appendChild(heading);

  const filterBar = buildFilterBar(opponents);
  wrapper.appendChild(filterBar);

  const summaryBar = buildSummaryBar();
  wrapper.appendChild(summaryBar);

  const table = buildTable(allGames);
  wrapper.appendChild(table);

  container.appendChild(wrapper);

  updateSummary(summaryBar, allGames, allGames);

  const refresh = () => {
    const filtered = applyFilters(allGames);
    const tbody = document.getElementById('schedule-body');
    if (tbody) populateRows(tbody, filtered);
    updateSummary(summaryBar, filtered, allGames);
  };

  filterBar.addEventListener('change', refresh);
}

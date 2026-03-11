/**
 * My Tickets - Portfolio View
 * Shows a summary/portfolio of all games where the user has ticket data,
 * with stats cards, status breakdown, search filter, and a sortable table.
 */

import {
  formatDateShort, formatTime, formatCurrency,
  buildTicketRows, getStatusConfig, GONE_STATUSES,
} from '../utils.js';

// ---------------------------------------------------------------------------
// Sort & filter state
// ---------------------------------------------------------------------------

let currentSort = { key: 'date', asc: true };
let showGone = false;
let searchQuery = '';

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function sortRows(rows) {
  const { key, asc } = currentSort;
  const dir = asc ? 1 : -1;

  rows.sort((a, b) => {
    let va = a[key];
    let vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
}

function sortArrow(key) {
  if (currentSort.key !== key) return '';
  return currentSort.asc ? ' \u25B2' : ' \u25BC';
}

// ---------------------------------------------------------------------------
// Render: summary stat cards
// ---------------------------------------------------------------------------

function renderSummaryCards(rows) {
  const totalGames = rows.length;
  const totalTickets = rows.reduce((sum, r) => sum + r.qty, 0);
  const totalSpent = rows.reduce((sum, r) => sum + r.totalCost, 0);
  const avgCost = totalTickets > 0 ? totalSpent / totalTickets : 0;

  const cards = [
    { value: totalGames, label: 'Total Games' },
    { value: totalTickets, label: 'Total Tickets' },
    { value: formatCurrency(totalSpent), label: 'Total Spent' },
    { value: formatCurrency(avgCost), label: 'Avg Cost / Ticket' },
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'stats-bar';

  for (const card of cards) {
    const el = document.createElement('div');
    el.className = 'stat-card';
    el.innerHTML = `
      <div class="stat-value">${card.value}</div>
      <div class="stat-label">${card.label}</div>
    `;
    wrapper.appendChild(el);
  }
  return wrapper;
}

// ---------------------------------------------------------------------------
// Render: status breakdown pills
// ---------------------------------------------------------------------------

function renderStatusBreakdown(rows) {
  const counts = {};
  for (const r of rows) {
    const key = (r.status || 'UNKNOWN').toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  }

  const container = document.createElement('div');
  container.className = 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = '<h2>Status Breakdown</h2>';
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'panel-body';
  body.style.display = 'flex';
  body.style.flexWrap = 'wrap';
  body.style.gap = '8px';

  const statusOrder = ['KEEP', 'SELL', 'ACQUIRED', 'PENDING', 'PENDING TRADE', 'SOLD', 'TRADED', 'WATCHING'];
  for (const key of statusOrder) {
    if (!counts[key]) continue;
    const cfg = getStatusConfig(key);
    const pill = document.createElement('span');
    pill.className = `badge ${cfg.cssClass}`;
    pill.textContent = `${cfg.label}: ${counts[key]} game${counts[key] !== 1 ? 's' : ''}`;
    body.appendChild(pill);
  }

  for (const key of Object.keys(counts)) {
    if (statusOrder.includes(key)) continue;
    const pill = document.createElement('span');
    pill.className = 'badge';
    pill.textContent = `${key}: ${counts[key]} game${counts[key] !== 1 ? 's' : ''}`;
    body.appendChild(pill);
  }

  container.appendChild(body);
  return container;
}

// ---------------------------------------------------------------------------
// Render: search filter
// ---------------------------------------------------------------------------

function renderSearchBar(container) {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search by opponent, section, or status...';
  input.value = searchQuery;
  input.className = 'form-input';
  input.style.cssText = 'max-width:360px;font-size:14px;';
  input.addEventListener('input', () => {
    searchQuery = input.value;
    renderMyTickets(container);
  });

  bar.appendChild(input);

  if (searchQuery) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary btn-sm';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      searchQuery = '';
      renderMyTickets(container);
    });
    bar.appendChild(clearBtn);
  }

  return bar;
}

function matchesSearch(row, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (row.opponent || '').toLowerCase().includes(q) ||
    (row.section || '').toLowerCase().includes(q) ||
    (row.status || '').toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// Render: sortable ticket table
// ---------------------------------------------------------------------------

const COLUMNS = [
  { key: 'date', label: 'Game', sortable: true },
  { key: 'section', label: 'Section', sortable: false, align: 'center' },
  { key: 'qty', label: 'Qty', sortable: false, align: 'center' },
  { key: 'costPerTicket', label: 'Cost/Ticket', sortable: true, align: 'right' },
  { key: 'totalCost', label: 'Total Cost', sortable: true, align: 'right' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'avgSgComps', label: 'Avg SG Price', sortable: false, align: 'right' },
];

function renderTicketTable(rows, container) {
  sortRows(rows);

  const wrapper = document.createElement('div');
  wrapper.className = 'schedule-table-wrapper';

  const table = document.createElement('table');
  table.className = 'schedule-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  for (const col of COLUMNS) {
    const th = document.createElement('th');
    th.textContent = col.label + sortArrow(col.key);
    if (col.align) th.style.textAlign = col.align;

    if (col.sortable) {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.addEventListener('click', () => {
        if (currentSort.key === col.key) {
          currentSort.asc = !currentSort.asc;
        } else {
          currentSort.key = col.key;
          currentSort.asc = true;
        }
        renderMyTickets(container);
      });
    }
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => { window.location.hash = `#/game/${row.date}`; });

    // Game
    const tdGame = document.createElement('td');
    const timeStr = formatTime(row.startTime);
    const dateTime = timeStr !== 'TBD' ? `${formatDateShort(row.date)}, ${timeStr}` : formatDateShort(row.date);
    let gameLabel = `<strong>${row.opponent}</strong> <span style="color:var(--color-text-secondary);font-size:13px;">(${dateTime})</span>`;
    if (row.setCount > 1) {
      gameLabel += ` <span style="font-size:11px;color:var(--color-text-secondary);background:var(--color-light-gray);padding:1px 5px;border-radius:8px;">Set ${row.setIndex + 1}/${row.setCount}</span>`;
    }
    tdGame.innerHTML = gameLabel;
    tr.appendChild(tdGame);

    // Section
    const tdSec = document.createElement('td');
    tdSec.textContent = row.section || '\u2014';
    tdSec.style.textAlign = 'center';
    tr.appendChild(tdSec);

    // Qty
    const tdQty = document.createElement('td');
    tdQty.textContent = row.qty;
    tdQty.style.textAlign = 'center';
    tr.appendChild(tdQty);

    // Cost/Ticket
    const tdCpt = document.createElement('td');
    tdCpt.textContent = formatCurrency(row.costPerTicket);
    tdCpt.style.textAlign = 'right';
    tr.appendChild(tdCpt);

    // Total Cost
    const tdTot = document.createElement('td');
    tdTot.textContent = formatCurrency(row.totalCost);
    tdTot.style.textAlign = 'right';
    tr.appendChild(tdTot);

    // Status
    const tdStatus = document.createElement('td');
    const statusCfg = getStatusConfig(row.status);
    const badge = document.createElement('span');
    badge.className = `badge ${statusCfg.cssClass}`;
    badge.textContent = statusCfg.label;
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // Avg SG Price
    const tdAvgSg = document.createElement('td');
    tdAvgSg.textContent = row.avgSgComps != null ? formatCurrency(row.avgSgComps) : '\u2014';
    tdAvgSg.style.textAlign = 'right';
    tr.appendChild(tdAvgSg);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Render: empty state
// ---------------------------------------------------------------------------

function renderEmptyState() {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';
  wrapper.innerHTML = `
    <div class="empty-state-icon">&#127915;</div>
    <p>No tickets added yet.</p>
    <p style="margin-top:8px;">
      Go to the <a href="#/schedule">Schedule</a> to add your ticket info.
    </p>
  `;
  return wrapper;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderMyTickets(container) {
  container.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'My Tickets';
  heading.style.fontSize = '22px';
  heading.style.fontWeight = '700';
  heading.style.marginBottom = '16px';
  container.appendChild(heading);

  const allRows = buildTicketRows();

  if (allRows.length === 0) {
    container.appendChild(renderEmptyState());
    return;
  }

  const activeRows = allRows.filter(r => !GONE_STATUSES.includes((r.status || '').toUpperCase()));
  const goneRows = allRows.filter(r => GONE_STATUSES.includes((r.status || '').toUpperCase()));

  // 1. Summary stat cards (active tickets only)
  container.appendChild(renderSummaryCards(activeRows));

  // 2. Status breakdown (all rows)
  container.appendChild(renderStatusBreakdown(allRows));

  // 3. Search filter
  container.appendChild(renderSearchBar(container));

  // 4. Show/hide toggle for sold/traded
  if (goneRows.length > 0) {
    const toggle = document.createElement('label');
    toggle.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px;color:var(--color-text-secondary);margin-bottom:8px;cursor:pointer;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = showGone;
    checkbox.addEventListener('change', () => {
      showGone = checkbox.checked;
      renderMyTickets(container);
    });
    toggle.appendChild(checkbox);
    toggle.appendChild(document.createTextNode(`Show sold/traded (${goneRows.length})`));
    container.appendChild(toggle);
  }

  // 5. Filter and render table
  let rows = showGone ? allRows : activeRows;
  if (searchQuery) {
    rows = rows.filter(r => matchesSearch(r, searchQuery));
  }

  container.appendChild(renderTicketTable(rows, container));
}

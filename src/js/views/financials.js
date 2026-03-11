/**
 * Financials - Profit/Loss & Market Analysis View
 * Dedicated tab for financial analysis of ticket portfolio.
 */

import {
  formatDateShort, formatTime, formatCurrency,
  buildTicketRows, GONE_STATUSES,
} from '../utils.js';

// ---------------------------------------------------------------------------
// Render: financial summary cards
// ---------------------------------------------------------------------------

function renderFinancialCards(activeRows, sellRows) {
  const totalInvestment = activeRows.reduce((sum, r) => sum + r.totalCost, 0);

  const sellRevenue = sellRows.reduce((sum, r) => sum + (r.marketPrice || 0) * r.qty, 0);
  const sellFees = sellRows.reduce((sum, r) => sum + (r.marketPrice || 0) * r.qty * r.feeRate, 0);
  const sellNetRevenue = sellRevenue - sellFees;
  const sellCost = sellRows.reduce((sum, r) => sum + r.totalCost, 0);
  const netPL = sellNetRevenue - sellCost;

  const isProfit = netPL >= 0;
  const plColor = isProfit ? 'var(--status-keep)' : 'var(--color-red)';

  const cards = [
    { value: formatCurrency(totalInvestment), label: 'Total Investment', color: 'var(--color-navy)' },
    { value: formatCurrency(sellRevenue), label: 'SELL Gross Revenue', color: 'var(--color-navy)' },
    { value: formatCurrency(sellNetRevenue), label: 'SELL Net Revenue', color: 'var(--color-navy)' },
    { value: `${isProfit ? '+' : ''}${formatCurrency(netPL)}`, label: 'SELL Net P/L', color: plColor },
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'stats-bar';

  for (const card of cards) {
    const el = document.createElement('div');
    el.className = 'stat-card';
    el.innerHTML = `
      <div class="stat-value" style="color:${card.color}">${card.value}</div>
      <div class="stat-label">${card.label}</div>
    `;
    wrapper.appendChild(el);
  }
  return wrapper;
}

// ---------------------------------------------------------------------------
// Render: P/L summary table
// ---------------------------------------------------------------------------

function renderPLSummary(sellRows) {
  if (sellRows.length === 0) return null;

  const totalPotentialRevenue = sellRows.reduce((sum, r) => sum + (r.marketPrice || 0) * r.qty, 0);
  const totalFees = sellRows.reduce((sum, r) => sum + (r.marketPrice || 0) * r.qty * r.feeRate, 0);
  const netRevenue = totalPotentialRevenue - totalFees;
  const totalCostOfSell = sellRows.reduce((sum, r) => sum + r.totalCost, 0);
  const netProfitLoss = netRevenue - totalCostOfSell;

  const isProfit = netProfitLoss >= 0;
  const plColor = isProfit ? 'var(--status-keep)' : 'var(--color-red)';

  const container = document.createElement('div');
  container.className = 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = '<h2>Profit / Loss Summary</h2>';
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'panel-body';
  body.innerHTML = `
    <table style="width:100%; font-size:14px; border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="padding:6px 0; color:var(--color-text-secondary);">Potential Revenue (${sellRows.length} SELL game${sellRows.length !== 1 ? 's' : ''})</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">${formatCurrency(totalPotentialRevenue)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:var(--color-text-secondary);">Seller Fees</td>
          <td style="padding:6px 0; text-align:right; font-weight:600; color:var(--color-red);">&minus;${formatCurrency(totalFees)}</td>
        </tr>
        <tr style="border-top:1px solid var(--color-mid-gray);">
          <td style="padding:6px 0; color:var(--color-text-secondary);">Net Revenue</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">${formatCurrency(netRevenue)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:var(--color-text-secondary);">Cost of SELL Tickets</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">${formatCurrency(totalCostOfSell)}</td>
        </tr>
        <tr style="border-top:2px solid var(--color-navy);">
          <td style="padding:8px 0; font-weight:700;">Net Profit / Loss</td>
          <td style="padding:8px 0; text-align:right; font-weight:700; font-size:18px; color:${plColor};">
            ${isProfit ? '+' : ''}${formatCurrency(netProfitLoss)}
          </td>
        </tr>
      </tbody>
    </table>
  `;

  container.appendChild(body);
  return container;
}

// ---------------------------------------------------------------------------
// Render: per-game SELL breakdown table
// ---------------------------------------------------------------------------

function renderSellBreakdown(sellRows) {
  if (sellRows.length === 0) return null;

  const sorted = [...sellRows].sort((a, b) => a.date.localeCompare(b.date));

  const container = document.createElement('div');
  container.className = 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = '<h2>Per-Game Breakdown (SELL)</h2>';
  container.appendChild(header);

  const wrapper = document.createElement('div');
  wrapper.style.overflowX = 'auto';

  const table = document.createElement('table');
  table.className = 'schedule-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Game</th>
        <th style="text-align:center;">Sec</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Cost/Tkt</th>
        <th style="text-align:right;">Avg SG $</th>
        <th style="text-align:right;">Gross Rev</th>
        <th style="text-align:right;">Fees</th>
        <th style="text-align:right;">Net Rev</th>
        <th style="text-align:right;">P/L</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  let totalGrossRev = 0, totalFees = 0, totalNetRev = 0, totalPL = 0, totalCost = 0;

  for (const row of sorted) {
    const hasMkt = row.marketPrice != null && row.marketPrice > 0;
    const grossRev = hasMkt ? row.marketPrice * row.qty : 0;
    const fees = hasMkt ? grossRev * row.feeRate : 0;
    const netRev = grossRev - fees;
    const pl = hasMkt ? netRev - row.totalCost : null;

    totalGrossRev += grossRev;
    totalFees += fees;
    totalNetRev += netRev;
    totalCost += row.totalCost;
    if (pl != null) totalPL += pl;

    const plColor = pl != null ? (pl >= 0 ? 'var(--status-keep)' : 'var(--color-red)') : '';

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => { window.location.hash = `#/game/${row.date}`; });

    const timeStr = formatTime(row.startTime);
    const dateStr = timeStr !== 'TBD' ? `${formatDateShort(row.date)}, ${timeStr}` : formatDateShort(row.date);

    tr.innerHTML = `
      <td><strong>${row.opponent}</strong> <span style="color:var(--color-text-secondary);font-size:12px;">(${dateStr})</span></td>
      <td style="text-align:center;">${row.section || '\u2014'}</td>
      <td style="text-align:center;">${row.qty}</td>
      <td style="text-align:right;">${formatCurrency(row.costPerTicket)}</td>
      <td style="text-align:right;">${hasMkt ? formatCurrency(row.marketPrice) : '\u2014'}</td>
      <td style="text-align:right;">${hasMkt ? formatCurrency(grossRev) : '\u2014'}</td>
      <td style="text-align:right; color:var(--color-red);">${hasMkt ? formatCurrency(fees) : '\u2014'}</td>
      <td style="text-align:right;">${hasMkt ? formatCurrency(netRev) : '\u2014'}</td>
      <td style="text-align:right; font-weight:600; color:${plColor};">${pl != null ? `${pl >= 0 ? '+' : ''}${formatCurrency(pl)}` : '\u2014'}</td>
    `;
    tbody.appendChild(tr);
  }

  const totalPLColor = totalPL >= 0 ? 'var(--status-keep)' : 'var(--color-red)';
  const tfoot = document.createElement('tfoot');
  tfoot.innerHTML = `
    <tr style="font-weight:700; border-top:2px solid var(--color-navy);">
      <td colspan="3">Totals</td>
      <td style="text-align:right;">${formatCurrency(totalCost)}</td>
      <td></td>
      <td style="text-align:right;">${formatCurrency(totalGrossRev)}</td>
      <td style="text-align:right; color:var(--color-red);">${formatCurrency(totalFees)}</td>
      <td style="text-align:right;">${formatCurrency(totalNetRev)}</td>
      <td style="text-align:right; color:${totalPLColor};">${totalPL >= 0 ? '+' : ''}${formatCurrency(totalPL)}</td>
    </tr>
  `;

  table.appendChild(tbody);
  table.appendChild(tfoot);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
  return container;
}

// ---------------------------------------------------------------------------
// Render: portfolio valuation
// ---------------------------------------------------------------------------

function renderPortfolioValue(activeRows) {
  const rowsWithMarket = activeRows.filter(r => r.marketPrice != null && r.marketPrice > 0);
  if (rowsWithMarket.length === 0) return null;

  const totalCost = activeRows.reduce((sum, r) => sum + r.totalCost, 0);
  const totalMarketValue = rowsWithMarket.reduce((sum, r) => sum + r.marketPrice * r.qty, 0);
  const totalFees = rowsWithMarket.reduce((sum, r) => sum + r.marketPrice * r.qty * r.feeRate, 0);
  const totalNetValue = totalMarketValue - totalFees;
  const unrealizedPL = totalNetValue - totalCost;
  const isUp = unrealizedPL >= 0;
  const plColor = isUp ? 'var(--status-keep)' : 'var(--color-red)';

  const container = document.createElement('div');
  container.className = 'panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = '<h2>Full Portfolio Valuation</h2>';
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = 'panel-body';
  body.innerHTML = `
    <table style="width:100%; font-size:14px; border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="padding:6px 0; color:var(--color-text-secondary);">Total Cost Basis (${activeRows.length} ticket set${activeRows.length !== 1 ? 's' : ''})</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">${formatCurrency(totalCost)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:var(--color-text-secondary);">Market Value (${rowsWithMarket.length} with pricing)</td>
          <td style="padding:6px 0; text-align:right; font-weight:600;">${formatCurrency(totalMarketValue)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:var(--color-text-secondary);">Est. Seller Fees</td>
          <td style="padding:6px 0; text-align:right; font-weight:600; color:var(--color-red);">&minus;${formatCurrency(totalFees)}</td>
        </tr>
        <tr style="border-top:2px solid var(--color-navy);">
          <td style="padding:8px 0; font-weight:700;">Unrealized P/L (if all sold at market)</td>
          <td style="padding:8px 0; text-align:right; font-weight:700; font-size:18px; color:${plColor};">
            ${isUp ? '+' : ''}${formatCurrency(unrealizedPL)}
          </td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:12px; color:var(--color-text-secondary); margin-top:8px;">
      Based on avg SeatGeek section prices. Excludes SOLD/TRADED tickets.
    </p>
  `;

  container.appendChild(body);
  return container;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderFinancials(container) {
  container.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Financials';
  heading.style.fontSize = '22px';
  heading.style.fontWeight = '700';
  heading.style.marginBottom = '16px';
  container.appendChild(heading);

  const allRows = buildTicketRows();

  if (allRows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">&#128176;</div>
      <p>No ticket data to analyze.</p>
      <p style="margin-top:8px;">
        Go to the <a href="#/schedule">Schedule</a> to add your ticket info.
      </p>
    `;
    container.appendChild(empty);
    return;
  }

  const activeRows = allRows.filter(r => !GONE_STATUSES.includes((r.status || '').toUpperCase()));
  const sellRows = activeRows.filter(
    r => (r.status || '').toUpperCase() === 'SELL' && r.marketPrice != null
  );

  container.appendChild(renderFinancialCards(activeRows, sellRows));

  const plPanel = renderPLSummary(sellRows);
  if (plPanel) container.appendChild(plPanel);

  const breakdown = renderSellBreakdown(sellRows);
  if (breakdown) container.appendChild(breakdown);

  const portfolio = renderPortfolioValue(activeRows);
  if (portfolio) container.appendChild(portfolio);
}

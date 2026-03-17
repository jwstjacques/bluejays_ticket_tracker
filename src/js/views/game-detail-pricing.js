/**
 * Game Detail — SeatGeek Pricing Section
 * Handles the comparable prices table, section management, and sell targets.
 */

import { getAllSections, getPlatforms } from '../data.js';
import { getMarketPrices, saveMarketPrices } from '../storage.js';
import { el, formatCurrency } from '../utils.js';

const MAX_COMPARISONS = 4;
const TRACKED_SECTIONS = ['229', '230', '231', '232', '233'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the sell price needed to achieve a target profit, after platform fees.
 * @param {number} cost - Cost per ticket
 * @param {number} profitPct - Target profit as decimal (0 = breakeven, 0.10 = 10%)
 * @param {number} feePct - Platform fee as decimal (0.10 = 10%)
 * @returns {number}
 */
function sellTarget(cost, profitPct, feePct) {
  return Math.ceil(cost * (1 + profitPct) / (1 - feePct) * 100) / 100;
}

/**
 * Compute default comparison sections: up to 2 on each side of primarySec.
 */
function getDefaultComparisons(primarySec) {
  const num = parseInt(primarySec, 10);
  if (isNaN(num)) return [];
  const allIds = getAllSections().map(s => s.id);
  const candidates = [num - 2, num - 1, num + 1, num + 2];
  return candidates
    .map(String)
    .filter(s => s !== primarySec && allIds.includes(s))
    .slice(0, MAX_COMPARISONS);
}

// ---------------------------------------------------------------------------
// Pricing Section Builder
// ---------------------------------------------------------------------------

const DEFAULT_SECTION = '231';

/**
 * Builds the combined pricing section with dynamic section comparison.
 * @param {Object} game
 * @param {string} date
 * @param {Object|null} ticket
 * @returns {HTMLElement}
 */
export function buildPricingSection(game, date, ticket) {
  const wrapper = el('section', { className: 'seatgeek-prices-section' });

  const primarySec = ticket?.section || DEFAULT_SECTION;
  const prices = getMarketPrices();
  const cached = prices[date] || null;

  let comparisons = cached?.comparisonSections
    ? cached.comparisonSections.filter(s => s !== primarySec).slice(0, MAX_COMPARISONS)
    : getDefaultComparisons(primarySec);

  function trackedSections() { return [primarySec, ...comparisons]; }

  // --- Title ---
  const titleEl = el('h2', { className: 'seatgeek-prices-section__title' }, 'SeatGeek Comparable Prices');
  if (game.seatgeek?.url) {
    titleEl.appendChild(el('span', {
      style: 'font-size:12px;font-weight:400;color:var(--color-text-secondary);margin-left:8px;',
    }, '(click header to view section on SeatGeek)'));
  }
  wrapper.appendChild(titleEl);

  // --- Section management bar ---
  const sectionBar = el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;' });
  const pillContainer = el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;' });

  function renderPills() {
    pillContainer.innerHTML = '';
    pillContainer.appendChild(el('span', {
      style: 'display:inline-flex;align-items:center;gap:2px;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700;background:rgba(19,74,142,0.15);color:var(--color-navy);',
    }, `Sec ${primarySec}`));

    for (const sec of comparisons) {
      const pill = el('span', {
        style: 'display:inline-flex;align-items:center;gap:2px;padding:2px 8px;border-radius:10px;font-size:12px;background:var(--color-light-gray);color:var(--color-text);border:1px solid var(--color-mid-gray);',
      });
      pill.appendChild(document.createTextNode(`Sec ${sec}`));
      const removeBtn = el('button', {
        type: 'button',
        style: 'background:none;border:none;cursor:pointer;font-size:13px;color:var(--color-text-secondary);padding:0 0 0 2px;line-height:1;',
        title: `Remove section ${sec}`,
      }, '\u00D7');
      removeBtn.addEventListener('click', () => {
        comparisons = comparisons.filter(s => s !== sec);
        rebuildTable();
      });
      pill.appendChild(removeBtn);
      pillContainer.appendChild(pill);
    }
  }

  sectionBar.appendChild(pillContainer);

  function addSectionControl() {
    const existingAdd = sectionBar.querySelector('div:last-child select');
    if (existingAdd) existingAdd.parentElement.remove();
    if (comparisons.length >= MAX_COMPARISONS) return;

    const addContainer = el('div', { style: 'display:flex;align-items:center;gap:4px;' });
    const addSelect = el('select', { style: 'padding:2px 6px;font-size:12px;border:1px solid var(--color-mid-gray);border-radius:var(--radius-sm);' });
    addSelect.appendChild(el('option', { value: '' }, '+ Add section'));
    const allIds = getAllSections().map(s => s.id);
    for (const id of allIds) {
      if (id === primarySec || comparisons.includes(id)) continue;
      addSelect.appendChild(el('option', { value: id }, id));
    }
    addSelect.addEventListener('change', () => {
      const val = addSelect.value;
      if (!val || comparisons.length >= MAX_COMPARISONS) return;
      comparisons.push(val);
      rebuildTable();
    });
    addContainer.appendChild(addSelect);
    sectionBar.appendChild(addContainer);
  }

  addSectionControl();
  wrapper.appendChild(sectionBar);

  // --- Price table container ---
  const tableContainer = el('div', {});
  wrapper.appendChild(tableContainer);

  const infoEl = el('p', { style: 'font-size:12px;color:var(--color-text-secondary);margin-bottom:8px;' });
  if (cached?.fetchedAt) {
    infoEl.textContent = `Last updated: ${new Date(cached.fetchedAt).toLocaleDateString()}`;
  }
  wrapper.appendChild(infoEl);

  const feedback = el('span', { className: 'seatgeek-prices-section__feedback', 'aria-live': 'polite', style: 'font-size:13px;font-weight:600;' });
  const saveBtn = el('button', { type: 'button', className: 'btn btn-primary btn-sm' }, 'Save Prices');

  let inputsLow = {};
  let inputsHigh = {};

  function rebuildTable() {
    // Snapshot current input values before clearing so unsaved edits survive
    const prevLow = {};
    const prevHigh = {};
    for (const sec of Object.keys(inputsLow)) {
      const v = parseFloat(inputsLow[sec].value);
      if (!isNaN(v)) prevLow[sec] = v;
    }
    for (const sec of Object.keys(inputsHigh)) {
      const v = parseFloat(inputsHigh[sec].value);
      if (!isNaN(v)) prevHigh[sec] = v;
    }

    tableContainer.innerHTML = '';
    renderPills();
    addSectionControl();

    const sections = trackedSections();
    inputsLow = {};
    inputsHigh = {};

    const clearBtnStyle = 'background:none;border:none;cursor:pointer;font-size:14px;color:var(--color-red);padding:0 2px;margin-left:4px;line-height:1;vertical-align:middle;';
    const clearRowBtnStyle = 'background:none;border:none;cursor:pointer;font-size:10px;color:var(--color-red);margin-left:4px;vertical-align:middle;';

    function buildPriceInput(sec, val, isPrimary) {
      return el('input', {
        type: 'number', min: '0', step: '1', placeholder: '\u2014',
        value: val != null ? String(val) : '',
        style: `width:72px;text-align:right;padding:4px 6px;font-size:13px;border:1px solid var(--color-mid-gray);border-radius:var(--radius-sm);${isPrimary ? 'font-weight:700;' : ''}`,
      });
    }
    function buildClearBtn(input) {
      const btn = el('button', { type: 'button', style: clearBtnStyle, title: 'Clear' }, '\u00D7');
      btn.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); });
      return btn;
    }

    function cellStyle(sec) {
      const idx = sections.indexOf(sec);
      const bg = idx === 0 ? 'rgba(19,74,142,0.07)' : idx % 2 === 1 ? 'rgba(0,0,0,0.02)' : '';
      return `padding:6px 6px;white-space:nowrap;${bg ? `background:${bg};` : ''}`;
    }

    function buildChangeBadge(val, prev) {
      if (val == null || prev == null || val === prev) {
        return el('span', { style: 'display:inline-block;width:36px;margin-right:6px;' });
      }
      const diff = val - prev;
      const color = diff > 0 ? 'var(--status-keep)' : 'var(--color-red)';
      const bg = diff > 0 ? 'rgba(26,138,63,0.1)' : 'rgba(232,41,28,0.1)';
      return el('span', {
        style: `display:inline-block;width:36px;margin-right:6px;font-size:10px;font-weight:600;color:${color};background:${bg};padding:1px 4px;border-radius:8px;text-align:center;vertical-align:middle;white-space:nowrap;`,
        title: `Was ${formatCurrency(prev)}`
      }, `${diff > 0 ? '\u25B2' : '\u25BC'}${Math.round(Math.abs(diff))}`);
    }

    const table = el('table', { className: 'schedule-table seatgeek-price-table', style: 'margin-bottom:8px;width:100%;' });
    const sgBaseUrl = game.seatgeek?.url || null;
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', { style: 'white-space:nowrap;' }, ''),
      ...sections.map((sec) => {
        const isPrimary = sec === primarySec;
        const bg = isPrimary ? 'background:rgba(19,74,142,0.85);font-weight:800;' : 'background:rgba(19,74,142,0.65);';
        const label = isPrimary ? `\u2605 Sec ${sec}` : `Sec ${sec}`;
        if (sgBaseUrl) {
          const sgSec = sec.replace(/(\d+)([A-Za-z]+)$/, (_, num, letter) => `${num}-${letter.toLowerCase()}`);
          const qty = ticket?.quantity || 2;
          const sgUrl = sgBaseUrl + (sgBaseUrl.includes('?') ? '&' : '?') + `quantity=${qty}&selected=s%3A${sgSec}`;
          const link = el('a', {
            href: sgUrl, target: '_blank', rel: 'noopener noreferrer',
            style: 'color:rgba(255,255,255,0.95);text-decoration:none;border-bottom:1px dotted rgba(255,255,255,0.5);padding-bottom:1px;transition:border-color 150ms ease;',
            title: `View Sec ${sec} on SeatGeek`,
          }, `${label} \u2197`);
          link.addEventListener('mouseenter', () => { link.style.borderBottomColor = 'white'; link.style.borderBottomStyle = 'solid'; });
          link.addEventListener('mouseleave', () => { link.style.borderBottomColor = 'rgba(255,255,255,0.5)'; link.style.borderBottomStyle = 'dotted'; });
          return el('th', { style: bg }, link);
        }
        return el('th', { style: bg }, label);
      })
    )));

    const tbody = el('tbody', {});

    // Low row
    const lowRow = el('tr', {});
    const lowLabel = el('td', { style: 'font-weight:600;font-size:12px;white-space:nowrap;' });
    lowLabel.appendChild(document.createTextNode('Low'));
    const clearLowBtn = el('button', { type: 'button', style: clearRowBtnStyle, title: 'Clear all lows' }, '(clear)');
    clearLowBtn.addEventListener('click', () => { for (const s of sections) { inputsLow[s].value = ''; } updateAverages(); });
    lowLabel.appendChild(clearLowBtn);
    lowRow.appendChild(lowLabel);
    for (const sec of sections) {
      const val = prevLow[sec] ?? cached?.sections?.[sec] ?? null;
      const prev = cached?.previousSections?.[sec];
      const input = buildPriceInput(sec, val, sec === primarySec);
      inputsLow[sec] = input;
      const td = el('td', { style: cellStyle(sec) });
      td.appendChild(buildChangeBadge(val, prev));
      td.appendChild(input);
      td.appendChild(buildClearBtn(input));
      lowRow.appendChild(td);
    }
    tbody.appendChild(lowRow);

    // High row
    const highRow = el('tr', {});
    const highLabel = el('td', { style: 'font-weight:600;font-size:12px;white-space:nowrap;' });
    highLabel.appendChild(document.createTextNode('High'));
    const clearHighBtn = el('button', { type: 'button', style: clearRowBtnStyle, title: 'Clear all highs' }, '(clear)');
    clearHighBtn.addEventListener('click', () => { for (const s of sections) { inputsHigh[s].value = ''; } updateAverages(); });
    highLabel.appendChild(clearHighBtn);
    highRow.appendChild(highLabel);
    for (const sec of sections) {
      const val = prevHigh[sec] ?? cached?.sectionsHigh?.[sec] ?? null;
      const prev = cached?.previousSectionsHigh?.[sec];
      const input = buildPriceInput(sec, val, sec === primarySec);
      inputsHigh[sec] = input;
      const td = el('td', { style: cellStyle(sec) });
      td.appendChild(buildChangeBadge(val, prev));
      td.appendChild(input);
      td.appendChild(buildClearBtn(input));
      highRow.appendChild(td);
    }
    tbody.appendChild(highRow);

    // Avg row
    const avgRow = el('tr', {});
    avgRow.appendChild(el('td', { style: 'font-weight:600;font-size:12px;white-space:nowrap;color:var(--color-text-secondary);' }, 'Avg'));
    const avgCells = {};
    for (const sec of sections) {
      const td = el('td', { style: cellStyle(sec) });
      const span = el('span', { style: 'display:inline-block;width:72px;text-align:right;padding:4px 6px;font-size:13px;font-variant-numeric:tabular-nums;color:var(--color-text-secondary);' });
      td.appendChild(span);
      avgCells[sec] = span;
      avgRow.appendChild(td);
    }
    tbody.appendChild(avgRow);

    function updateAverages() {
      for (const sec of sections) {
        const lo = parseFloat(inputsLow[sec].value);
        const hi = parseFloat(inputsHigh[sec].value);
        const hasLo = !isNaN(lo) && lo > 0;
        const hasHi = !isNaN(hi) && hi > 0;
        const invalid = hasLo && hasHi && hi < lo;
        inputsLow[sec].style.borderColor = invalid ? 'var(--color-red)' : '';
        inputsHigh[sec].style.borderColor = invalid ? 'var(--color-red)' : '';
        if (hasLo && hasHi) avgCells[sec].textContent = formatCurrency((lo + hi) / 2);
        else if (hasLo) avgCells[sec].textContent = formatCurrency(lo);
        else if (hasHi) avgCells[sec].textContent = formatCurrency(hi);
        else avgCells[sec].textContent = '';
      }
    }
    for (const sec of sections) {
      inputsLow[sec].addEventListener('input', updateAverages);
      inputsHigh[sec].addEventListener('input', updateAverages);
    }
    updateAverages();

    table.appendChild(tbody);
    tableContainer.appendChild(table);
  }

  rebuildTable();

  // Save handler
  saveBtn.addEventListener('click', () => {
    const sections = {};
    const sectionsHigh = {};
    for (const sec of trackedSections()) {
      const lo = parseFloat(inputsLow[sec]?.value);
      sections[sec] = isNaN(lo) ? null : lo;
      const hi = parseFloat(inputsHigh[sec]?.value);
      sectionsHigh[sec] = isNaN(hi) ? null : hi;
    }
    saveMarketPrices(date, {
      fetchedAt: new Date().toISOString(),
      sections, sectionsHigh,
      primarySection: primarySec,
      comparisonSections: [...comparisons],
    });
    infoEl.textContent = `Last updated: ${new Date().toLocaleDateString()}`;

    // Notify P/L calculator of updated avg price for primary section
    const lo = sections[primarySec];
    const hi = sectionsHigh[primarySec];
    const newAvg = (lo != null && hi != null) ? +((lo + hi) / 2).toFixed(2)
      : (lo != null ? lo : hi != null ? hi : null);
    document.dispatchEvent(new CustomEvent('market-price-updated', { detail: { date, marketPrice: newAvg } }));

    feedback.textContent = '\u2713 Prices saved';
    feedback.style.color = 'var(--status-keep)';
    clearTimeout(feedback._timer);
    feedback._timer = setTimeout(() => { feedback.textContent = ''; }, 2500);
  });

  // Toolbar: save button + feedback (left), marketplace links (right)
  const toolbar = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap;' });

  const toolbarLeft = el('div', { style: 'display:flex;gap:8px;align-items:center;' });
  toolbarLeft.appendChild(saveBtn);
  toolbarLeft.appendChild(feedback);
  toolbar.appendChild(toolbarLeft);

  const marketplaceLinks = [
    { key: 'seatgeek', label: 'SeatGeek' },
    { key: 'ticketmaster', label: 'Ticketmaster' },
    { key: 'stubHub', label: 'StubHub' },
    { key: 'vividSeats', label: 'Vivid Seats' },
  ];
  const hasLinks = marketplaceLinks.some(mp => game[mp.key]?.url);
  if (hasLinks) {
    const toolbarRight = el('div', { style: 'display:flex;align-items:center;gap:6px;' });
    const linkEls = [];
    for (const mp of marketplaceLinks) {
      let url = game[mp.key]?.url;
      if (url) {
        if (mp.key === 'seatgeek' && ticket) {
          const params = new URLSearchParams();
          params.set('quantity', String(ticket.quantity || 2));
          const rawSec = ticket.section || primarySec;
          const sgSec = rawSec.replace(/(\d+)([A-Za-z]+)$/, (_, num, letter) => `${num}-${letter.toLowerCase()}`);
          params.set('selected', `s:${sgSec}`);
          url += (url.includes('?') ? '&' : '?') + params.toString();
        }
        const link = el('a', {
          href: url, target: '_blank', rel: 'noopener noreferrer',
          style: 'display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;color:var(--color-navy);text-decoration:none;padding:4px 10px;border:1px solid var(--color-navy);border-radius:var(--radius-sm);transition:background 150ms ease, color 150ms ease;',
          onmouseenter: function () { this.style.background = 'var(--color-navy)'; this.style.color = '#fff'; },
          onmouseleave: function () { this.style.background = ''; this.style.color = 'var(--color-navy)'; },
        }, `${mp.label} \u2197`);
        linkEls.push(link);
      }
    }
    for (const linkEl of linkEls) {
      toolbarRight.appendChild(linkEl);
    }
    toolbar.appendChild(toolbarRight);
  }

  wrapper.appendChild(toolbar);

  // --- Sell Targets ---
  if (ticket && ticket.costPerTicket != null && ticket.costPerTicket > 0) {
    const cost = ticket.costPerTicket;

    const feeRows = [
      { label: '10% fee (SeatGeek, Vivid)', fee: 0.10 },
      { label: '15% fee (StubHub, TM)', fee: 0.15 },
    ];

    const targets = [
      { label: 'Breakeven', pct: 0 },
      { label: '+10%', pct: 0.10 },
      { label: '+15%', pct: 0.15 },
      { label: '+20%', pct: 0.20 },
      { label: '+50%', pct: 0.50 },
    ];

    wrapper.appendChild(el('h3', { style: 'font-size:15px;font-weight:700;margin:16px 0 8px;' }, 'Sell Targets'));

    const targetTable = el('table', { className: 'schedule-table seatgeek-price-table', style: 'margin-bottom:8px;' });
    targetTable.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'Fee'),
      ...targets.map(t => el('th', {}, t.label))
    )));

    const tBody = el('tbody', {});
    for (const feeRow of feeRows) {
      tBody.appendChild(el('tr', {},
        el('td', { style: 'font-weight:600;font-size:12px;white-space:nowrap;' }, feeRow.label),
        ...targets.map(t => el('td', { className: 'col-cost' }, formatCurrency(sellTarget(cost, t.pct, feeRow.fee))))
      ));
    }
    targetTable.appendChild(tBody);
    wrapper.appendChild(targetTable);

    wrapper.appendChild(
      el('p', { style: 'font-size:12px;color:var(--color-text-secondary);' },
        `Your cost: ${formatCurrency(cost)}/ticket. List at these prices to net the target profit after seller fees.`)
    );
  }

  return wrapper;
}

/**
 * Game Detail — Ticket Form & P/L Calculator
 * Handles the collapsible ticket info form, sale listings, and per-game profit/loss.
 */

import { getGameByDate, getGames, getAllSections, getPlatforms, getSellerFee } from '../data.js';
import { getTicketForGame, saveTicket, deleteTicket, addTicketSet, getMyTickets, getMarketPrices } from '../storage.js';
import { el, formatCurrency, formatDateLong } from '../utils.js';

const DEFAULT_SECTION = '231';
const PLATFORM_SUGGESTIONS = ['SeatGeek', 'StubHub', 'Ticketmaster', 'Vivid Seats', 'Reddit', 'Facebook', 'Kijiji', 'Other'];

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function buildFieldGroup(labelText, forId, control, opts = {}) {
  const cls = opts.full ? 'ticket-form__field ticket-form__field--full' : 'ticket-form__field';
  const group = el('div', { className: cls });
  group.appendChild(el('label', { for: forId, className: 'ticket-form__label' }, labelText));
  group.appendChild(control);
  return group;
}

function calculateTotal(ticket) {
  if (!ticket || ticket.costPerTicket == null) return formatCurrency(0);
  return formatCurrency((ticket.quantity || 1) * ticket.costPerTicket);
}

function collectFormData(form, lastCheckedEl) {
  const data = {};
  data.section = form.elements.section.value || null;
  data.row = form.elements.row?.value?.trim() || null;
  data.seats = form.elements.seats?.value?.trim() || null;
  data.quantity = parseInt(form.elements.quantity.value, 10) || 1;
  data.costPerTicket = form.elements.costPerTicket.value ? parseFloat(form.elements.costPerTicket.value) : null;
  data.totalCost = data.costPerTicket != null ? data.quantity * data.costPerTicket : null;
  data.status = form.elements.status.value;
  data.platform = form.elements.platform?.value || null;
  data.marketPrice = form.elements.marketPrice.value ? parseFloat(form.elements.marketPrice.value) : null;
  data.lastChecked = lastCheckedEl.dataset.value || null;
  data.tradeLink = form.elements.tradeLink?.value || null;
  data.notes = form.elements.notes.value || '';

  const listingsContainer = form.querySelector('[id^="listings-rows"]');
  if (listingsContainer) {
    const listings = [];
    for (const row of listingsContainer.children) {
      if (typeof row._getData === 'function') {
        const l = row._getData();
        if (l) listings.push(l);
      }
    }
    data.listings = listings;
  }

  return data;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showConfirmModal(title, message, onConfirm) {
  const overlay = el('div', { className: 'modal-overlay open' });
  function close() { document.body.removeChild(overlay); }

  const modal = el('div', { className: 'modal' },
    el('div', { className: 'modal-header' },
      el('h2', {}, title),
      el('button', { className: 'modal-close', type: 'button', onClick: close }, '\u00D7')
    ),
    el('div', { className: 'modal-body' },
      el('p', { style: 'font-size:14px;' }, message)
    ),
    el('div', { className: 'modal-footer' },
      el('button', { className: 'btn btn-secondary btn-sm', type: 'button', onClick: close }, 'Cancel'),
      el('button', { className: 'btn btn-danger btn-sm', type: 'button', onClick: () => { close(); onConfirm(); } }, 'Delete')
    )
  );
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}

function showFeedback(container, message, type) {
  container.textContent = message;
  container.className = `ticket-form__feedback ticket-form__feedback--${type}`;
  clearTimeout(container._timer);
  container._timer = setTimeout(() => {
    container.textContent = '';
    container.className = 'ticket-form__feedback';
  }, 2500);
}

// ---------------------------------------------------------------------------
// Listing row builder
// ---------------------------------------------------------------------------

function buildListingRow(listing = {}, fid = '') {
  const row = el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;' });

  const platformInput = el('input', {
    type: 'text', placeholder: 'Platform', value: listing.platform || '',
    style: 'width:110px;padding:4px 6px;font-size:13px;border:1px solid var(--color-mid-gray);border-radius:var(--radius-sm);',
    list: `platform-suggestions${fid}`,
  });

  const priceInput = el('input', {
    type: 'number', min: '0', step: '0.01', placeholder: 'Price',
    value: listing.price != null ? String(listing.price) : '',
    style: 'width:80px;padding:4px 6px;font-size:13px;border:1px solid var(--color-mid-gray);border-radius:var(--radius-sm);',
  });

  const urlInput = el('input', {
    type: 'url', placeholder: 'URL', value: listing.url || '',
    style: 'flex:1;min-width:160px;padding:4px 6px;font-size:13px;border:1px solid var(--color-mid-gray);border-radius:var(--radius-sm);',
  });

  const openBtn = el('a', {
    href: listing.url || '#', target: '_blank', rel: 'noopener noreferrer',
    style: 'font-size:13px;color:var(--color-navy);text-decoration:none;padding:2px;', title: 'Open link',
  }, '\u2197');
  urlInput.addEventListener('input', () => { openBtn.href = urlInput.value || '#'; });

  const removeBtn = el('button', {
    type: 'button',
    style: 'background:none;border:none;cursor:pointer;font-size:16px;color:var(--color-red);padding:0 4px;line-height:1;',
    title: 'Remove listing',
  }, '\u00D7');
  removeBtn.addEventListener('click', () => { row.remove(); });

  row.appendChild(platformInput);
  row.appendChild(priceInput);
  row.appendChild(urlInput);
  row.appendChild(openBtn);
  row.appendChild(removeBtn);
  row._getData = () => {
    const p = platformInput.value.trim();
    const u = urlInput.value.trim();
    const pr = parseFloat(priceInput.value);
    if (!p && !u) return null;
    return { platform: p, url: u, price: isNaN(pr) ? null : pr };
  };
  return row;
}

// ---------------------------------------------------------------------------
// Ticket Form Builder
// ---------------------------------------------------------------------------

/**
 * Builds the collapsible ticket info form for a single set.
 * @param {string} date
 * @param {Array} sections
 * @param {Object|null} existingTicket
 * @param {number} setIndex
 * @param {number} setCount
 * @param {{ onRerender: Function, onSave: Function }} callbacks
 * @returns {HTMLElement}
 */
export function buildTicketForm(date, sections, existingTicket, setIndex, setCount, callbacks) {
  const hasTicket = existingTicket != null;
  const section = el('section', { className: 'ticket-form-section' });

  const detailsEl = el('details', { className: 'ticket-form-section__collapsible' });
  if (hasTicket) detailsEl.setAttribute('open', '');

  const summaryLabel = setCount > 1
    ? `Ticket Set ${setIndex + 1} of ${setCount}` + (existingTicket?.section ? ` (Sec ${existingTicket.section})` : '')
    : 'My Ticket Info';
  detailsEl.appendChild(el('summary', { className: 'ticket-form-section__summary' }, summaryLabel));

  const fid = setCount > 1 ? `-${setIndex}` : '';
  const formId = setCount > 1 ? `ticket-form-${setIndex}` : 'ticket-form';
  const form = el('form', { className: 'ticket-form', id: formId });
  detailsEl.appendChild(form);
  section.appendChild(detailsEl);

  // How Acquired
  const acquiredEl = el('div', { style: 'display:flex;align-items:baseline;gap:6px;' });
  if (hasTicket) {
    const t = existingTicket;
    const STANDARD_COST = 84.35;
    const costClose = t.costPerTicket != null && Math.abs(t.costPerTicket - STANDARD_COST) < 1;

    if (t.tradeLink) {
      const linkedGame = getGameByDate(t.tradeLink);
      if (linkedGame) {
        const verb = t.status === 'TRADED' ? 'Traded for' : 'Traded from';
        acquiredEl.appendChild(el('a', {
          href: `#/game/${t.tradeLink}`, style: 'font-size:13px;color:var(--color-navy);',
        }, `${verb}: vs ${linkedGame.opponent} (${formatDateLong(t.tradeLink)})`));
      } else {
        acquiredEl.appendChild(el('span', { style: 'font-size:13px;' }, 'Trade'));
      }
    } else if (costClose && (t.section || '') === DEFAULT_SECTION) {
      acquiredEl.appendChild(el('span', { style: 'font-size:13px;color:var(--color-text);' }, 'Season Package'));
    } else {
      acquiredEl.appendChild(el('span', { style: 'font-size:13px;color:var(--color-text);' }, 'Purchased'));
    }
  } else {
    acquiredEl.appendChild(el('span', { style: 'font-size:13px;color:var(--color-text-secondary);' }, '\u2014'));
  }
  form.appendChild(buildFieldGroup('How Acquired', `field-acquired${fid}`, acquiredEl, { full: true }));

  // Section
  const sectionSelect = el('select', { name: 'section', id: `field-section${fid}`, className: 'ticket-form__select' });
  sectionSelect.appendChild(el('option', { value: '' }, '-- Select section --'));
  for (const s of sections) {
    const label = s.zone ? `${s.id} - ${s.level} / ${s.zone}` : `${s.id} - ${s.level}`;
    const opt = el('option', { value: s.id }, label);
    if (existingTicket && existingTicket.section === s.id) opt.selected = true;
    sectionSelect.appendChild(opt);
  }
  form.appendChild(buildFieldGroup('Section', `field-section${fid}`, sectionSelect));

  // Row
  const rowInput = el('input', {
    type: 'text', name: 'row', id: `field-row${fid}`, placeholder: 'e.g. 6',
    value: existingTicket?.row || '', className: 'ticket-form__input', style: 'max-width:80px;',
  });
  form.appendChild(buildFieldGroup('Row', `field-row${fid}`, rowInput));

  // Seats
  const seatsInput = el('input', {
    type: 'text', name: 'seats', id: `field-seats${fid}`, placeholder: 'e.g. 6-7',
    value: existingTicket?.seats || '', className: 'ticket-form__input', style: 'max-width:100px;',
  });
  form.appendChild(buildFieldGroup('Seats', `field-seats${fid}`, seatsInput));

  // Quantity
  const qtyInput = el('input', {
    type: 'number', name: 'quantity', id: `field-quantity${fid}`, min: '1', max: '10',
    value: existingTicket ? String(existingTicket.quantity || 1) : '1', className: 'ticket-form__input',
  });
  form.appendChild(buildFieldGroup('Quantity', `field-quantity${fid}`, qtyInput));

  // Cost per ticket
  const costInput = el('input', {
    type: 'number', name: 'costPerTicket', id: `field-cost${fid}`, min: '0', step: '0.01', placeholder: '0.00',
    value: existingTicket?.costPerTicket != null ? String(existingTicket.costPerTicket) : '', className: 'ticket-form__input',
  });
  form.appendChild(buildFieldGroup('Cost per Ticket', `field-cost${fid}`, costInput));

  // Total cost (read-only)
  const totalDisplay = el('output', { id: `field-total${fid}`, className: 'ticket-form__output' }, calculateTotal(existingTicket));
  form.appendChild(buildFieldGroup('Total Cost', `field-total${fid}`, totalDisplay));

  const recalculate = () => {
    const qty = parseInt(qtyInput.value, 10) || 0;
    const cost = parseFloat(costInput.value) || 0;
    totalDisplay.textContent = formatCurrency(qty * cost);
  };
  qtyInput.addEventListener('input', recalculate);
  costInput.addEventListener('input', recalculate);

  // Status
  const statusSelect = el('select', { name: 'status', id: `field-status${fid}`, className: 'ticket-form__select' });
  const statuses = ['KEEP', 'SELL', 'ACQUIRED', 'PENDING TRADE', 'SOLD', 'TRADED', 'WATCHING'];
  for (const s of statuses) {
    const opt = el('option', { value: s }, s);
    if (existingTicket && existingTicket.status === s) opt.selected = true;
    statusSelect.appendChild(opt);
  }
  form.appendChild(buildFieldGroup('Status', `field-status${fid}`, statusSelect));

  // Sell Quantity (shown only when status is SELL and qty > 1)
  const sellQtyGroup = el('div', { className: 'ticket-form__field', id: `sell-qty-group${fid}`, style: 'display:none;' });
  const sellQtyInput = el('input', {
    type: 'number', name: 'sellQuantity', id: `field-sell-qty${fid}`, min: '1',
    max: String(existingTicket?.quantity || 1),
    value: existingTicket?.sellQuantity != null ? String(existingTicket.sellQuantity) : String(existingTicket?.quantity || 1),
    className: 'ticket-form__input', style: 'max-width:80px;',
  });
  const sellQtyHint = el('span', { className: 'ticket-form__static-text', style: 'margin-left:8px;' });
  const sellQtyControl = el('div', { style: 'display:flex;align-items:center;' });
  sellQtyControl.appendChild(sellQtyInput);
  sellQtyControl.appendChild(sellQtyHint);
  sellQtyGroup.appendChild(el('label', { for: `field-sell-qty${fid}`, className: 'ticket-form__label' }, 'Qty to Sell'));
  sellQtyGroup.appendChild(sellQtyControl);
  form.appendChild(sellQtyGroup);

  function updateSellQtyVisibility() {
    const isSell = statusSelect.value === 'SELL';
    const totalQty = parseInt(qtyInput.value, 10) || 1;
    sellQtyInput.max = String(totalQty);
    if (isSell && totalQty > 1) {
      sellQtyGroup.style.display = '';
      const sellQty = parseInt(sellQtyInput.value, 10) || totalQty;
      if (sellQty > totalQty) sellQtyInput.value = String(totalQty);
      const keeping = totalQty - (parseInt(sellQtyInput.value, 10) || totalQty);
      sellQtyHint.textContent = keeping > 0 ? `(keeping ${keeping})` : '(selling all)';
    } else {
      sellQtyGroup.style.display = 'none';
    }
  }
  statusSelect.addEventListener('change', updateSellQtyVisibility);
  qtyInput.addEventListener('input', updateSellQtyVisibility);
  sellQtyInput.addEventListener('input', updateSellQtyVisibility);
  updateSellQtyVisibility();

  // Platform
  const platformSelect = el('select', { name: 'platform', id: `field-platform${fid}`, className: 'ticket-form__select' });
  const platformsConfig = getPlatforms();
  platformSelect.appendChild(el('option', { value: '' }, '-- Platform --'));
  if (platformsConfig) {
    for (const [key, cfg] of Object.entries(platformsConfig)) {
      const opt = el('option', { value: key }, `${cfg.name} (${cfg.sellerFeePercent}% fee)`);
      if (existingTicket && existingTicket.platform === key) opt.selected = true;
      platformSelect.appendChild(opt);
    }
  }
  form.appendChild(buildFieldGroup('Platform', `field-platform${fid}`, platformSelect));

  // Trade link
  const tradeLinkGroup = el('div', { className: 'ticket-form__field ticket-form__field--full', id: `trade-link-group${fid}`, style: 'display:none;' });
  const tradeLinkSelect = el('select', { name: 'tradeLink', id: `field-trade-link${fid}`, className: 'ticket-form__select' });

  function populateTradeOptions() {
    tradeLinkSelect.innerHTML = '';
    tradeLinkSelect.appendChild(el('option', { value: '' }, '-- None --'));
    const games = getGames();
    const myTickets = getMyTickets().tickets;
    for (const g of games) {
      if (g.date === date) continue;
      const t = myTickets[g.date];
      if (!t) continue;
      const statusHint = t.status ? ` [${t.status}]` : '';
      const opt = el('option', { value: g.date }, `${g.opponent} (${formatDateLong(g.date)})${statusHint}`);
      if (existingTicket && existingTicket.tradeLink === g.date) opt.selected = true;
      tradeLinkSelect.appendChild(opt);
    }
  }
  populateTradeOptions();

  tradeLinkGroup.appendChild(el('label', { for: `field-trade-link${fid}`, className: 'ticket-form__label' }, 'Trade Link'));
  tradeLinkGroup.appendChild(tradeLinkSelect);
  form.appendChild(tradeLinkGroup);

  const TRADE_STATUSES = ['TRADED', 'ACQUIRED', 'PENDING TRADE'];
  function updateTradeLinkVisibility() {
    tradeLinkGroup.style.display = TRADE_STATUSES.includes(statusSelect.value) ? '' : 'none';
  }
  updateTradeLinkVisibility();

  // Last checked display (needed before feedback is created)
  const lastCheckedValue = existingTicket?.lastChecked || '';
  const lastCheckedDisplay = el('span', { id: `field-last-checked${fid}`, className: 'ticket-form__static-text' }, lastCheckedValue || 'Not set');
  if (lastCheckedValue) lastCheckedDisplay.dataset.value = lastCheckedValue;

  // Feedback area (created early so status/trade handlers can reference it)
  const feedback = el('div', { id: `form-feedback${fid}`, className: 'ticket-form__feedback', 'aria-live': 'polite' });

  // Auto-save on status change
  statusSelect.addEventListener('change', () => {
    updateTradeLinkVisibility();
    const formData = collectFormData(form, lastCheckedDisplay);
    saveTicket(date, formData, setIndex);
    showFeedback(feedback, 'Status saved!', 'success');
  });

  // Trade link change handler
  tradeLinkSelect.addEventListener('change', () => {
    const oldLink = existingTicket?.tradeLink;
    const newLink = tradeLinkSelect.value || null;

    if (oldLink && oldLink !== newLink) {
      const oldPartner = getTicketForGame(oldLink);
      if (oldPartner && oldPartner.tradeLink === date) {
        saveTicket(oldLink, { ...oldPartner, tradeLink: null });
      }
    }

    const formData = collectFormData(form, lastCheckedDisplay);
    formData.tradeLink = newLink;
    saveTicket(date, formData, setIndex);
    if (existingTicket) existingTicket.tradeLink = newLink;

    if (newLink) {
      const partner = getTicketForGame(newLink);
      if (partner) saveTicket(newLink, { ...partner, tradeLink: date });
    }

    showFeedback(feedback, 'Trade link saved!', 'success');
  });

  // AVG SeatGeek $
  const ticketSec = existingTicket?.section || DEFAULT_SECTION;
  const mktPrices = getMarketPrices();
  const gamePrices = mktPrices[date] || null;
  const secLow = gamePrices?.sections?.[ticketSec];
  const secHigh = gamePrices?.sectionsHigh?.[ticketSec];
  const avgSeatGeek = (secLow != null && secHigh != null) ? +((secLow + secHigh) / 2).toFixed(2) : null;
  const marketInput = el('input', {
    type: 'number', name: 'marketPrice', id: `field-market-price${fid}`, min: '0', step: '0.01', placeholder: '-',
    value: avgSeatGeek != null ? String(avgSeatGeek) : (existingTicket?.marketPrice != null ? String(existingTicket.marketPrice) : ''),
    className: 'ticket-form__input',
  });
  form.appendChild(buildFieldGroup('AVG SeatGeek $', `field-market-price${fid}`, marketInput));

  // Last checked
  form.appendChild(buildFieldGroup('Last Checked', `field-last-checked${fid}`, lastCheckedDisplay));

  marketInput.addEventListener('input', () => {
    if (marketInput.value) {
      const today = new Date().toISOString().split('T')[0];
      lastCheckedDisplay.textContent = today;
      lastCheckedDisplay.dataset.value = today;
    }
  });

  // Notes
  const notesInput = el('textarea', {
    name: 'notes', id: `field-notes${fid}`, rows: '3',
    placeholder: 'Any notes about this ticket...', className: 'ticket-form__textarea',
  });
  if (existingTicket?.notes) notesInput.textContent = existingTicket.notes;
  form.appendChild(buildFieldGroup('Notes', `field-notes${fid}`, notesInput, { full: true }));

  // Sale Listings
  const listingsData = existingTicket?.listings || [];
  const listingsContainer = el('div', { className: 'ticket-form__field ticket-form__field--full' });
  listingsContainer.appendChild(el('label', { className: 'ticket-form__label' }, 'Sale Listings'));

  const listingsRows = el('div', { id: `listings-rows${fid}` });
  listingsContainer.appendChild(listingsRows);

  const datalist = el('datalist', { id: `platform-suggestions${fid}` });
  for (const name of PLATFORM_SUGGESTIONS) datalist.appendChild(el('option', { value: name }));
  listingsContainer.appendChild(datalist);

  for (const l of listingsData) listingsRows.appendChild(buildListingRow(l, fid));

  const addListingBtn = el('button', {
    type: 'button', className: 'btn btn-secondary btn-sm',
    style: 'margin-top:4px;font-size:12px;',
  }, '+ Add Listing');
  addListingBtn.addEventListener('click', () => listingsRows.appendChild(buildListingRow({}, fid)));
  listingsContainer.appendChild(addListingBtn);
  form.appendChild(listingsContainer);

  // Feedback
  form.appendChild(feedback);

  // Buttons
  const btnRow = el('div', { className: 'ticket-form__actions' });
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary', style: 'background:var(--status-keep);' }, 'Save');
  const deleteBtn = el('button', { type: 'button', className: 'btn btn-danger' }, 'Delete');
  if (!hasTicket) deleteBtn.disabled = true;
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(deleteBtn);
  form.appendChild(btnRow);

  // Form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = collectFormData(form, lastCheckedDisplay);

    // Auto-split: if SELL and selling fewer than total, create two sets
    const totalQty = formData.quantity || 1;
    const sellQty = parseInt(sellQtyInput.value, 10) || totalQty;
    const isSell = formData.status === 'SELL';
    const needsSplit = isSell && totalQty > 1 && sellQty < totalQty && setCount <= 1;

    if (needsSplit) {
      const keepQty = totalQty - sellQty;
      // Save current set as KEEP with remaining qty
      const keepData = { ...formData, status: 'KEEP', quantity: keepQty, totalCost: keepQty * (formData.costPerTicket || 0) };
      delete keepData.sellQuantity;
      saveTicket(date, keepData, setIndex);
      // Add a new SELL set
      const sellData = {
        section: formData.section, row: formData.row, seats: null,
        quantity: sellQty, costPerTicket: formData.costPerTicket,
        status: 'SELL', platform: formData.platform,
        marketPrice: formData.marketPrice, notes: '',
      };
      addTicketSet(date, sellData);
      showFeedback(feedback, `Split: ${keepQty} KEEP + ${sellQty} SELL`, 'success');
      // Re-render to show both sets
      setTimeout(() => { if (callbacks.onRerender) callbacks.onRerender(); }, 800);
    } else {
      saveTicket(date, formData, setIndex);
      showFeedback(feedback, 'Saved!', 'success');
    }

    deleteBtn.disabled = false;
    if (callbacks.onSave) callbacks.onSave(formData);
  });

  // Delete
  const deleteLabel = setCount > 1 ? 'Delete This Set' : 'Delete';
  const deleteMsg = setCount > 1
    ? `Delete ticket set ${setIndex + 1} (Sec ${existingTicket?.section || '?'})? This cannot be undone.`
    : 'Are you sure you want to delete this ticket info? This cannot be undone.';
  deleteBtn.textContent = deleteLabel;
  deleteBtn.addEventListener('click', () => {
    showConfirmModal('Delete Ticket', deleteMsg, () => {
      deleteTicket(date, setCount > 1 ? setIndex : undefined);
      if (callbacks.onRerender) callbacks.onRerender();
    });
  });

  return section;
}

// ---------------------------------------------------------------------------
// Per-game Profit/Loss Calculator
// ---------------------------------------------------------------------------

function buildResultRow(label, value, valueClass) {
  return el('div', { className: 'profit-loss__row' },
    el('span', { className: 'profit-loss__label' }, label),
    el('span', { className: `profit-loss__value ${valueClass || ''}`.trim() }, value)
  );
}

/**
 * Renders the per-game profit/loss calculator section.
 * @param {HTMLElement} container
 * @param {Object} ticket
 * @param {Object} platforms
 */
export function renderProfitLoss(container, ticket, platforms) {
  container.innerHTML = '';
  if (ticket.costPerTicket == null || ticket.marketPrice == null) return;

  const costPerTicket = ticket.costPerTicket;
  const marketPrice = ticket.marketPrice;

  // Use SELL set quantity if split, otherwise total
  let quantity = ticket.quantity || 1;
  if (ticket.sets && ticket.sets.length > 1) {
    const sellSet = ticket.sets.find(s => (s.status || '').toUpperCase() === 'SELL');
    if (sellSet) quantity = sellSet.quantity || quantity;
  }

  const panelStyle = 'background:var(--color-white);border:1px solid var(--color-mid-gray);border-radius:var(--radius);box-shadow:var(--shadow-sm);margin-top:16px;overflow:hidden;';
  const panel = el('div', { style: panelStyle });

  // Header
  const header = el('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--color-mid-gray);display:flex;align-items:center;justify-content:space-between;' });
  header.appendChild(el('h2', { style: 'font-size:16px;font-weight:700;margin:0;' }, 'Profit / Loss Calculator'));

  // Platform selector in header
  const platformWrap = el('div', { style: 'display:flex;align-items:center;gap:8px;' });
  platformWrap.appendChild(el('label', { for: 'profit-platform-select', style: 'font-size:13px;color:var(--color-text-secondary);white-space:nowrap;' }, 'Sell on'));
  const platformSelect = el('select', { id: 'profit-platform-select', style: 'padding:4px 8px;font-size:13px;border:1px solid var(--color-mid-gray);border-radius:var(--radius-sm);font-family:inherit;' });
  for (const key of Object.keys(platforms)) {
    const opt = el('option', { value: key }, platforms[key].name);
    if (ticket.platform === key) opt.selected = true;
    platformSelect.appendChild(opt);
  }
  platformWrap.appendChild(platformSelect);
  header.appendChild(platformWrap);
  panel.appendChild(header);

  // Body
  const body = el('div', { style: 'padding:0;' });
  panel.appendChild(body);

  const rowStyle = 'display:flex;justify-content:space-between;align-items:center;padding:8px 16px;font-size:14px;';
  const altBg = 'background:var(--color-light-gray);';
  const labelStyle = 'color:var(--color-text-secondary);';
  const valueStyle = 'font-weight:600;font-variant-numeric:tabular-nums;';

  const render = () => {
    body.innerHTML = '';
    const selectedKey = platformSelect.value;
    const feePercent = getSellerFee(selectedKey);
    const netPerTicket = marketPrice * (1 - feePercent / 100);
    const profitPerTicket = netPerTicket - costPerTicket;
    const totalProfit = profitPerTicket * quantity;
    const plColor = totalProfit >= 0 ? 'color:var(--status-keep);' : 'color:var(--color-red);';

    const rows = [
      { label: 'Cost per ticket', value: formatCurrency(costPerTicket), alt: false },
      { label: 'AVG SeatGeek $', value: formatCurrency(marketPrice), alt: true },
      { label: `Seller fee (${platforms[selectedKey]?.name || selectedKey})`, value: `${feePercent}%`, alt: false },
      { label: 'Net per ticket', value: formatCurrency(netPerTicket), alt: true },
      { label: 'P/L per ticket', value: `${profitPerTicket >= 0 ? '+' : ''}${formatCurrency(profitPerTicket)}`, alt: false, color: plColor },
    ];

    for (const r of rows) {
      const row = el('div', { style: rowStyle + (r.alt ? altBg : '') });
      row.appendChild(el('span', { style: labelStyle }, r.label));
      row.appendChild(el('span', { style: valueStyle + (r.color || '') }, r.value));
      body.appendChild(row);
    }

    // Total row — emphasized
    const totalRow = el('div', { style: `${rowStyle}border-top:2px solid var(--color-navy);padding:12px 16px;` });
    totalRow.appendChild(el('span', { style: 'font-weight:700;' }, `Total P/L (${quantity} ticket${quantity !== 1 ? 's' : ''})`));
    totalRow.appendChild(el('span', { style: `font-weight:700;font-size:18px;font-variant-numeric:tabular-nums;${plColor}` }, `${totalProfit >= 0 ? '+' : ''}${formatCurrency(totalProfit)}`));
    body.appendChild(totalRow);
  };

  platformSelect.addEventListener('change', render);
  render();
  container.appendChild(panel);
}

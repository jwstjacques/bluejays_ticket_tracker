/**
 * Game Detail view — main coordinator.
 * Composes the game header, pricing section, promotion, and ticket form(s).
 */

import { getGameByDate, getAllSections, getPlatforms } from '../data.js';
import { getTicketForGame, getTicketSets, addTicketSet, getMarketPrices } from '../storage.js';
import { el, formatDateLong, formatTimeFull, formatCurrency } from '../utils.js';
import { buildPricingSection } from './game-detail-pricing.js';
import { buildTicketForm, renderProfitLoss } from './game-detail-form.js';

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

/**
 * Renders the game detail view into the given container element.
 * @param {HTMLElement} container
 * @param {string} date - ISO date string like "2026-03-27"
 * @param {string} from - Navigation source ('schedule', 'my-tickets', 'financials')
 */
export function renderGameDetail(container, date, from) {
  const backMap = {
    'my-tickets': { href: '#/my-tickets', label: 'Back to My Tickets' },
    'financials': { href: '#/financials', label: 'Back to Financials' },
  };
  const back = backMap[from] || { href: '#/schedule', label: 'Back to Schedule' };
  const game = getGameByDate(date);

  if (!game) {
    container.innerHTML = '';
    container.appendChild(
      el('div', { className: 'game-detail game-detail--not-found' },
        el('a', { href: back.href, className: 'back-link' }, back.label),
        el('p', { className: 'error-message' }, `No game found for ${date}.`)
      )
    );
    return;
  }

  const platforms = getPlatforms();
  const sections = getAllSections();
  const existingTicket = getTicketForGame(date);
  const ticketSets = getTicketSets(date);

  container.innerHTML = '';
  const wrapper = el('div', { className: 'game-detail' });
  container.appendChild(wrapper);

  // 1. Back button
  wrapper.appendChild(el('a', { href: back.href, className: 'back-link' }, back.label));

  // 2. Game header
  wrapper.appendChild(buildGameHeader(game, date));

  // 3. SeatGeek Prices + Sell Targets
  wrapper.appendChild(buildPricingSection(game, date, existingTicket));

  // 4. Promotion section
  if (game.promotion) {
    wrapper.appendChild(buildPromotionSection(game.promotion));
  }

  // 5. Ticket forms
  const callbacks = {
    onRerender: () => renderGameDetail(container, date, from),
    onSave: (formData) => {
      const calcContainer = document.getElementById('profit-loss-calculator');
      if (calcContainer && formData.marketPrice) {
        renderProfitLoss(calcContainer, formData, platforms, date);
      } else if (calcContainer) {
        calcContainer.innerHTML = '';
      }
    },
  };

  if (ticketSets.length > 1) {
    for (let i = 0; i < ticketSets.length; i++) {
      wrapper.appendChild(buildTicketForm(date, sections, ticketSets[i], i, ticketSets.length, callbacks));
    }
  } else {
    wrapper.appendChild(buildTicketForm(date, sections, existingTicket, 0, ticketSets.length, callbacks));
  }

  // Add another ticket set button
  const addSetBtn = el('button', {
    type: 'button', className: 'btn btn-secondary btn-sm', style: 'margin-top:8px;',
  }, '+ Add Ticket Set');
  addSetBtn.addEventListener('click', () => {
    addTicketSet(date, { status: 'KEEP', quantity: 2, costPerTicket: 0 });
    renderGameDetail(container, date, from);
  });
  wrapper.appendChild(addSetBtn);

  // 6. Profit/Loss calculator — derive market price from pricing section data
  const calcContainer = el('div', { id: 'profit-loss-calculator' });
  wrapper.appendChild(calcContainer);
  if (existingTicket) {
    const mktPrices = getMarketPrices();
    const gamePrices = mktPrices[date] || null;
    const ticketSec = existingTicket.section || '231';
    const lo = gamePrices?.sections?.[ticketSec];
    const hi = gamePrices?.sectionsHigh?.[ticketSec];
    const liveAvg = (lo != null && hi != null) ? +((lo + hi) / 2).toFixed(2)
      : (lo != null ? lo : hi != null ? hi : null);
    if (liveAvg != null) existingTicket.marketPrice = liveAvg;
    if (existingTicket.marketPrice) {
      renderProfitLoss(calcContainer, existingTicket, platforms, date);
    }
  }

  // Listen for price updates from the pricing section and re-render P/L
  const onPriceUpdate = (e) => {
    if (e.detail.date !== date) return;
    const newPrice = e.detail.marketPrice;
    if (existingTicket && newPrice != null) {
      existingTicket.marketPrice = newPrice;
      // Also update the market price input in the form if present
      const mktInput = document.querySelector('[name="marketPrice"]');
      if (mktInput) mktInput.value = String(newPrice);
      renderProfitLoss(calcContainer, existingTicket, platforms, date);
    }
  };
  document.addEventListener('market-price-updated', onPriceUpdate);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function buildGameHeader(game, date) {
  const timeStr = formatTimeFull(game.startTime);
  const dateTime = timeStr !== 'TBD' ? `${formatDateLong(date)}, ${timeStr}` : formatDateLong(date);
  return el('section', { className: 'game-header' },
    el('h1', { className: 'game-header__opponent' },
      `vs ${game.opponent} `,
      el('span', { style: 'font-size:0.6em;font-weight:400;color:var(--color-text-secondary);' }, `(${dateTime})`)
    )
  );
}

function buildPromotionSection(promotion) {
  const section = el('section', { className: 'promotion-section' },
    el('h2', { className: 'promotion-section__title' }, 'Promotion'),
    el('p', { className: 'promotion-section__name' }, promotion.name),
    el('span', { className: `promotion-section__badge promotion-section__badge--${slugify(promotion.type)}` }, promotion.type)
  );
  if (promotion.details) {
    section.appendChild(el('p', { className: 'promotion-section__details' }, promotion.details));
  }
  return section;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

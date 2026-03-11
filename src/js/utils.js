/**
 * Shared utility functions for Blue Jays Ticket Tracker.
 * Centralizes formatting, status config, fee resolution, and ticket data enrichment.
 */

import { getPlatforms, getGameByDate } from './data.js';
import { getMyTickets, getMarketPrices } from './storage.js';

// ---------------------------------------------------------------------------
// Date formatters
// ---------------------------------------------------------------------------

/** "2026-03-27" -> "Fri, Mar 27" */
export function formatDateShort(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "2026-03-27" -> "Friday, March 27, 2026" */
export function formatDateLong(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Time formatters
// ---------------------------------------------------------------------------

/** "19:07" -> "7:07" (no AM/PM — all games are PM) */
export function formatTime(time) {
  if (!time || time === 'TBD') return 'TBD';
  const [h, m] = time.split(':').map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')}`;
}

/** "19:07" -> "7:07 PM" */
export function formatTimeFull(time) {
  if (!time || time === 'TBD') return 'TBD';
  const [hourStr, minute] = time.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minute} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Currency formatter
// ---------------------------------------------------------------------------

/** 84.35 -> "$84.35", null -> "" */
export function formatCurrency(amount) {
  if (amount == null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ---------------------------------------------------------------------------
// DOM helper
// ---------------------------------------------------------------------------

/**
 * Create an HTML element with attributes and children.
 * @param {string} tag
 * @param {Object} attrs - className, dataset, on* handlers, or standard attributes
 * @param  {...(string|Node|null)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = val;
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(val)) element.dataset[dk] = dv;
    } else if (key.startsWith('on') && typeof val === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), val);
    } else {
      element.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

export const GONE_STATUSES = ['SOLD', 'TRADED'];

export const STATUS_CONFIG = {
  KEEP: { label: 'Keep', cssClass: 'badge-keep', color: '#1a8a3f' },
  SELL: { label: 'Sell', cssClass: 'badge-sell', color: '#d97706' },
  ACQUIRED: { label: 'Acquired', cssClass: 'badge-acquired', color: '#1D428A' },
  PENDING: { label: 'Pending', cssClass: 'badge-pending', color: '#ca8a04' },
  'PENDING TRADE': { label: 'Pending Trade', cssClass: 'badge-pending', color: '#ca8a04' },
  SOLD: { label: 'Sold', cssClass: 'badge-sold', color: '#555' },
  TRADED: { label: 'Traded', cssClass: 'badge-traded', color: '#7c3aed' },
  WATCHING: { label: 'Watching', cssClass: 'badge-watching', color: '#0d9488' },
};

export function getStatusConfig(status) {
  const key = (status || '').toUpperCase();
  return STATUS_CONFIG[key] || { label: status || '?', cssClass: '', color: '#999' };
}

// ---------------------------------------------------------------------------
// Fee resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the seller fee rate for a platform slug.
 * @param {string|undefined} platformSlug
 * @returns {number|null} fee as decimal (e.g. 0.10), or null if unknown
 */
export function resolveFeeRate(platformSlug) {
  const platforms = getPlatforms();
  if (!platforms) return null;
  const slug = platformSlug || 'seatgeek';
  const cfg = platforms[slug];
  if (!cfg || cfg.sellerFeePercent == null) return null;
  return cfg.sellerFeePercent / 100;
}

// ---------------------------------------------------------------------------
// Enriched ticket row builder
// ---------------------------------------------------------------------------

/**
 * Build an enriched list of tickets joined with game data and market prices.
 * Used by My Tickets and Financials views.
 * @returns {Array<Object>}
 */
export function buildTicketRows() {
  const data = getMyTickets();
  const ticketEntries = Object.entries(data.tickets);
  if (ticketEntries.length === 0) return [];

  const rows = [];
  const mktPrices = getMarketPrices();

  for (const [date, ticket] of ticketEntries) {
    const game = getGameByDate(date);
    if (!game) continue;

    const sets = ticket.sets || [ticket];
    const gamePrices = mktPrices[date] || null;

    for (let si = 0; si < sets.length; si++) {
      const s = sets[si];
      const defaultFee = 0.10;
      const feeRate = resolveFeeRate(s.platform) ?? defaultFee;

      const ticketSec = s.section || '';
      const secLow = gamePrices?.sections?.[ticketSec];
      const secHigh = gamePrices?.sectionsHigh?.[ticketSec];
      const sgAvgPrice = (secLow != null && secHigh != null)
        ? +((secLow + secHigh) / 2).toFixed(2)
        : null;

      const hasMkt = sgAvgPrice != null && sgAvgPrice > 0;
      const plPerTicket = hasMkt
        ? sgAvgPrice * (1 - feeRate) - (s.costPerTicket || 0)
        : null;

      rows.push({
        date: game.date,
        dayOfWeek: game.dayOfWeek,
        opponent: game.opponent,
        startTime: game.startTime,
        section: ticketSec,
        qty: s.quantity || 0,
        costPerTicket: s.costPerTicket || 0,
        totalCost: s.totalCost || 0,
        status: s.status || '',
        marketPrice: sgAvgPrice,
        avgSgComps: sgAvgPrice,
        plPerTicket,
        feeRate,
        platform: s.platform || 'seatgeek',
        tradeLink: s.tradeLink || null,
        setIndex: si,
        setCount: sets.length,
      });
    }
  }
  return rows;
}

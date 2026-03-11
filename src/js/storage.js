/**
 * Personal ticket storage layer for Blue Jays Ticket Tracker.
 * Reads/writes to JSON files on disk via the Express API server.
 * Keeps an in-memory cache so all getters remain synchronous.
 *
 * Storage format v2 (file: config/personal/my_tickets.json):
 * {
 *   version: 2,
 *   tickets: {
 *     "2026-03-27": {
 *       sets: [
 *         { section, row, seats, quantity, costPerTicket, totalCost, status, notes, tradeLink, ... }
 *       ]
 *     }
 *   }
 * }
 *
 * Public API returns aggregated top-level fields for backward compatibility:
 *   getTicketForGame("2026-04-07") =>
 *     { section: "232", quantity: 4, totalCost: 337.40, status: "SELL", ..., sets: [{...}, {...}] }
 */

const VALID_STATUSES = ['KEEP', 'SELL', 'ACQUIRED', 'PENDING TRADE', 'SOLD', 'TRADED', 'WATCHING'];

// ---------------------------------------------------------------------------
// In-memory caches (populated by initStorage)
// ---------------------------------------------------------------------------

let _ticketsData = { version: 2, tickets: {} };
let _pricesData = {};

// ---------------------------------------------------------------------------
// Initialization — call once at app startup
// ---------------------------------------------------------------------------

/**
 * Load ticket and price data from the server into memory.
 * Also handles one-time migration from localStorage if the files are empty.
 */
export async function initStorage() {
  // Load tickets from file
  try {
    const res = await fetch('/api/tickets');
    if (res.ok) {
      const data = await res.json();
      _ticketsData = _normalizeTicketData(data);
    }
  } catch {}

  // One-time migration: if file is empty but localStorage has data, migrate
  if (Object.keys(_ticketsData.tickets).length === 0) {
    const lsRaw = localStorage.getItem('bjt-my-tickets');
    if (lsRaw) {
      try {
        const lsData = JSON.parse(lsRaw);
        _ticketsData = _normalizeTicketData(lsData);
        _persistTickets();
        localStorage.removeItem('bjt-my-tickets');
      } catch {}
    }
  }

  // Load prices from file
  try {
    const res = await fetch('/api/prices');
    if (res.ok) {
      const data = await res.json();
      _pricesData = data.prices || data;
    }
  } catch {}

  // One-time migration: localStorage prices
  if (Object.keys(_pricesData).length === 0) {
    const lsRaw = localStorage.getItem('bjt-market-prices');
    if (lsRaw) {
      try {
        _pricesData = JSON.parse(lsRaw);
        _persistPrices();
        localStorage.removeItem('bjt-market-prices');
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize any ticket data format (array, v1 flat, v2 sets) into v2.
 */
function _normalizeTicketData(data) {
  if (!data || typeof data !== 'object') {
    return { version: 2, tickets: {} };
  }

  // Array format (from old config file)
  if (Array.isArray(data.tickets)) {
    const v2 = { version: 2, tickets: {} };
    for (const t of data.tickets) {
      if (!t || !t.date) continue;
      const { date, opponent, ...rest } = t;
      if (!v2.tickets[date]) {
        v2.tickets[date] = { sets: [rest] };
      } else {
        v2.tickets[date].sets.push(rest);
      }
    }
    return v2;
  }

  if (!data.tickets || typeof data.tickets !== 'object') {
    return { version: 2, tickets: {} };
  }

  // v1 flat format — each date has fields directly, no sets array
  if (!data.version || data.version < 2) {
    const v2 = { version: 2, tickets: {} };
    for (const [date, ticket] of Object.entries(data.tickets)) {
      if (ticket.sets && Array.isArray(ticket.sets)) {
        v2.tickets[date] = { sets: [...ticket.sets] };
      } else {
        v2.tickets[date] = { sets: [{ ...ticket }] };
      }
    }
    return v2;
  }

  // Ensure every v2 entry has a sets array
  for (const [date, ticket] of Object.entries(data.tickets)) {
    if (!ticket.sets || !Array.isArray(ticket.sets)) {
      const { sets, ...rest } = ticket;
      data.tickets[date] = { sets: [rest] };
    }
  }

  return data;
}

/**
 * Read from the in-memory cache.
 */
function _readRaw() {
  return _ticketsData;
}

/**
 * Update in-memory cache and persist to disk via API.
 */
function _writeRaw(data) {
  _ticketsData = data;
  _persistTickets();
}

/**
 * Fire-and-forget POST to save tickets to disk.
 */
function _persistTickets() {
  fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(_ticketsData, null, 2),
  }).catch(err => console.warn('[storage] Failed to persist tickets:', err));
}

/**
 * Fire-and-forget POST to save prices to disk.
 */
function _persistPrices() {
  fetch('/api/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(_pricesData, null, 2),
  }).catch(err => console.warn('[storage] Failed to persist prices:', err));
}

/**
 * Compute aggregated top-level fields from a date entry's sets array.
 * Primary set (index 0) provides most fields; quantity and totalCost are summed.
 */
function _aggregate(entry) {
  if (!entry || !entry.sets || entry.sets.length === 0) return null;
  const primary = entry.sets[0];
  const agg = { ...primary };
  if (entry.sets.length > 1) {
    agg.quantity = entry.sets.reduce((sum, s) => sum + (s.quantity || 0), 0);
    agg.totalCost = +(entry.sets.reduce((sum, s) => sum + (s.totalCost || 0), 0)).toFixed(2);
  }
  agg.sets = entry.sets.map(s => ({ ...s }));
  return agg;
}

// ---------------------------------------------------------------------------
// Public API — Tickets
// ---------------------------------------------------------------------------

/**
 * Return the full storage object with aggregated ticket data.
 */
export function getMyTickets() {
  const raw = _readRaw();
  const result = { version: raw.version, tickets: {} };
  for (const [date, entry] of Object.entries(raw.tickets)) {
    const agg = _aggregate(entry);
    if (agg) result.tickets[date] = agg;
  }
  return result;
}

/**
 * Return the aggregated ticket entry for a specific game date, or null.
 */
export function getTicketForGame(date) {
  const raw = _readRaw();
  const entry = raw.tickets[date];
  if (!entry) return null;
  return _aggregate(entry);
}

/**
 * Return the raw sets array for a specific game date.
 */
export function getTicketSets(date) {
  const raw = _readRaw();
  const sets = raw.tickets[date]?.sets;
  return sets ? sets.map(s => ({ ...s })) : [];
}

/**
 * Create or update a ticket set for a game date.
 */
export function saveTicket(date, ticketData, setIndex = 0) {
  const data = _readRaw();
  const now = new Date().toISOString();

  const { sets, ...cleanData } = ticketData;

  if (cleanData.status && !VALID_STATUSES.includes(cleanData.status.toUpperCase())) {
    console.warn(`[storage] Unknown status "${cleanData.status}" for ${date}. Valid: ${VALID_STATUSES.join(', ')}`);
  }

  if (!data.tickets[date]) {
    data.tickets[date] = { sets: [] };
  }

  const entry = data.tickets[date];
  const existing = entry.sets[setIndex] ?? null;

  const merged = {
    section: null,
    row: null,
    seats: null,
    quantity: 1,
    costPerTicket: 0,
    totalCost: 0,
    status: 'ACQUIRED',
    notes: '',
    tradeLink: null,
    marketPrice: null,
    marketPriceDate: null,
    lastChecked: null,
    platform: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...existing,
    ...cleanData,
  };

  merged.totalCost = +(merged.quantity * merged.costPerTicket).toFixed(2);
  merged.updatedAt = now;

  if (setIndex < entry.sets.length) {
    entry.sets[setIndex] = merged;
  } else {
    entry.sets.push(merged);
  }

  _writeRaw(data);
  return merged;
}

/**
 * Add a new ticket set to a game date (appended after existing sets).
 */
export function addTicketSet(date, ticketData) {
  const data = _readRaw();
  if (!data.tickets[date]) {
    data.tickets[date] = { sets: [] };
  }
  const idx = data.tickets[date].sets.length;
  return saveTicket(date, ticketData, idx);
}

/**
 * Remove a ticket entry or a specific set.
 */
export function deleteTicket(date, setIndex) {
  const data = _readRaw();
  if (!(date in data.tickets)) return false;

  if (setIndex == null || data.tickets[date].sets.length <= 1) {
    delete data.tickets[date];
  } else {
    data.tickets[date].sets.splice(setIndex, 1);
  }

  _writeRaw(data);
  return true;
}

/**
 * Trigger a browser file-download of all personal ticket data as JSON.
 */
export function exportToJSON() {
  const data = getMyTickets();
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    tickets: data.tickets,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bluejays-tickets-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser file-download of all market price data as JSON.
 */
export function exportMarketPrices() {
  const prices = getMarketPrices();
  const payload = {
    lastFetched: new Date().toISOString(),
    trackedSections: ['229', '230', '231', '232', '233'],
    prices,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `market_prices.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Import ticket data from a JSON string.
 */
export function importFromJSON(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('File does not contain valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('File does not contain a valid JSON object');
  }
  if (typeof parsed.version !== 'number') {
    throw new Error('Missing or invalid "version" field');
  }
  if (!parsed.tickets || typeof parsed.tickets !== 'object') {
    throw new Error('Missing or invalid "tickets" field');
  }

  // Validate dates before normalizing
  if (Array.isArray(parsed.tickets)) {
    for (const entry of parsed.tickets) {
      if (!entry || !entry.date) {
        throw new Error('Array entry missing required "date" field');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        throw new Error(`Invalid date "${entry.date}". Expected format: YYYY-MM-DD`);
      }
    }
  } else {
    for (const date of Object.keys(parsed.tickets)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid date key "${date}". Expected format: YYYY-MM-DD`);
      }
    }
  }

  const normalized = _normalizeTicketData(parsed);
  _writeRaw(normalized);

  return { imported: Object.keys(normalized.tickets).length };
}

// ---------------------------------------------------------------------------
// Market Prices
// ---------------------------------------------------------------------------

/**
 * Read all cached market price data.
 */
export function getMarketPrices() {
  return _pricesData;
}

/**
 * Merge price data for a specific game date into the market prices store.
 * Preserves the previous sections as `previousSections` for change tracking.
 */
export function saveMarketPrices(date, priceData) {
  const existing = _pricesData[date] || {};

  if (existing.sections && priceData.sections) {
    priceData.previousSections = existing.sections;
    priceData.previousFetchedAt = existing.fetchedAt || null;
  }
  if (existing.sectionsHigh && priceData.sectionsHigh) {
    priceData.previousSectionsHigh = existing.sectionsHigh;
  }

  _pricesData[date] = { ...existing, ...priceData };
  _persistPrices();
}

// ---------------------------------------------------------------------------

/**
 * Remove all personal ticket data.
 */
export function clearAllData() {
  _ticketsData = { version: 2, tickets: {} };
  _persistTickets();
}

/**
 * Compute summary statistics across all saved tickets (all sets).
 */
export function getStats() {
  const data = getMyTickets();
  const dates = Object.values(data.tickets);

  const byStatus = {};
  let totalTickets = 0;
  let totalSpent = 0;
  let totalGames = 0;

  for (const entry of dates) {
    const sets = entry.sets || [entry];
    for (const ticket of sets) {
      totalGames++;
      const status = ticket.status || 'ACQUIRED';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (status !== 'TRADED') {
        totalTickets += ticket.quantity || 0;
        totalSpent += ticket.totalCost || 0;
      }
    }
  }

  return {
    totalGames,
    totalTickets,
    totalSpent: +totalSpent.toFixed(2),
    byStatus,
  };
}

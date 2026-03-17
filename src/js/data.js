/**
 * Data layer for Blue Jays Ticket Tracker.
 * Loads and exposes the immutable game schedule, section layout, and platform
 * configuration from JSON config files.  All mutating state lives in storage.js;
 * this module is read-only after the initial fetch.
 */

// ---------------------------------------------------------------------------
// Module-level caches (populated by the load* functions)
// ---------------------------------------------------------------------------
let seasonData = null;       // full parsed 2026_season.json
let sectionData = null;      // full parsed rogers_centre_sections.json
let platformData = null;     // full parsed platforms.json
let packagesData = null;     // full parsed ticket_packages.json
let tmTradeData = null;      // full parsed tm_trading_values.json

// Pre-built lookup tables populated after load
let _sectionIndex = null; // Map<sectionId, {level, zone, position, notes}>

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/**
 * Fetch and cache the 2026 season schedule.
 * @returns {Promise<Object>} The full season object (metadata + games array).
 */
export async function loadSeasonData() {
  const url = window.APP_CONFIG?.seasonDataUrl || 'config/2026_season.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load season data: ${res.status}`);
  seasonData = await res.json();
  return seasonData;
}

/**
 * Fetch and cache the Rogers Centre section map.
 * Also builds the internal section-lookup index.
 * @returns {Promise<Object>} The full sections object.
 */
export async function loadSectionData() {
  const url = window.APP_CONFIG?.sectionsUrl || 'config/rogers_centre_sections.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load section data: ${res.status}`);
  sectionData = await res.json();
  _buildSectionIndex();
  return sectionData;
}

/**
 * Fetch and cache the ticket-platform configuration.
 * @returns {Promise<Object>} The full platforms object.
 */
export async function loadPlatformData() {
  const url = window.APP_CONFIG?.platformsUrl || 'config/platforms.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load platform data: ${res.status}`);
  platformData = await res.json();
  return platformData;
}

/**
 * Fetch and cache the TM trading values.
 * @returns {Promise<Object|null>}
 */
export async function loadTmTradeValues() {
  try {
    const res = await fetch('config/personal/tm_trading_values.json');
    if (!res.ok) return null;
    tmTradeData = await res.json();
    return tmTradeData;
  } catch {
    return null;
  }
}

/**
 * Get the TM trade value for a game date, optionally for a specific section.
 * @param {string} date - e.g. "2026-03-27"
 * @param {string} [section] - e.g. "232" (for games with per-section values)
 * @returns {number|null}
 */
export function getTmTradeValue(date, section) {
  const val = tmTradeData?.values?.[date];
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && section && val[section] != null) return val[section];
  // If object but no matching section, return first available value
  if (typeof val === 'object') {
    const first = Object.values(val)[0];
    return typeof first === 'number' ? first : null;
  }
  return null;
}

/**
 * Fetch and cache the ticket packages config.
 * @returns {Promise<Object|null>}
 */
export async function loadPackagesData() {
  const url = window.APP_CONFIG?.packagesUrl;
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    packagesData = await res.json();
    return packagesData;
  } catch {
    return null;
  }
}

/**
 * @returns {Object|null} The loaded packages config.
 */
export function getPackages() {
  return packagesData;
}

// ---------------------------------------------------------------------------
// Section index builder (called once after loadSectionData)
// ---------------------------------------------------------------------------

function _buildSectionIndex() {
  _sectionIndex = new Map();
  if (!sectionData || !sectionData.levels) return;

  for (const level of sectionData.levels) {
    for (const zone of level.zones) {
      for (const sectionId of zone.sections) {
        _sectionIndex.set(sectionId, {
          level: level.name,
          zone: zone.name,
          position: zone.position || null,
          notes: zone.notes || null,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Game accessors
// ---------------------------------------------------------------------------

/**
 * @returns {Array<Object>} All games in the season, or an empty array if data
 *   has not been loaded yet.
 */
export function getGames() {
  return seasonData?.games ?? [];
}

/**
 * Find a single game by its ISO-8601 date string.
 * @param {string} date - e.g. "2026-03-27"
 * @returns {Object|undefined} The matching game object, or undefined.
 */
export function getGameByDate(date) {
  return getGames().find((g) => g.date === date);
}

/**
 * Filter games by calendar month.
 * @param {number} month - 1-12 (March = 3, September = 9, etc.)
 * @returns {Array<Object>}
 */
export function getGamesByMonth(month) {
  const mm = String(month).padStart(2, '0');
  return getGames().filter((g) => g.date.slice(5, 7) === mm);
}

/**
 * Filter games by opponent name (case-insensitive partial match).
 * @param {string} name - e.g. "yankees" or "New York"
 * @returns {Array<Object>}
 */
export function getGamesByOpponent(name) {
  const needle = name.toLowerCase();
  return getGames().filter((g) => g.opponent.toLowerCase().includes(needle));
}

/**
 * @returns {Array<Object>} Games whose date is strictly after today.
 */
export function getUpcomingGames() {
  const today = new Date().toISOString().slice(0, 10);
  return getGames().filter((g) => g.date > today);
}

/**
 * @returns {Array<Object>} Games that have a non-null promotion.
 */
export function getGamesWithPromotions() {
  return getGames().filter((g) => g.promotion != null);
}

/**
 * @returns {Array<string>} Unique opponent names, sorted alphabetically.
 */
export function getOpponents() {
  const names = new Set(getGames().map((g) => g.opponent));
  return [...names].sort();
}

// ---------------------------------------------------------------------------
// Section accessors
// ---------------------------------------------------------------------------

/**
 * Retrieve metadata for a single section by its ID.
 * @param {string} sectionId - e.g. "231", "23A", "WestJet Flight Deck"
 * @returns {{level: string, zone: string, position: string|null, notes: string|null}|undefined}
 */
export function getSectionInfo(sectionId) {
  return _sectionIndex?.get(sectionId);
}

/**
 * @returns {Array<string>} Flat list of every section ID across all levels.
 */
export function getAllSections() {
  if (!sectionData?.levels) return [];
  const sections = [];
  for (const level of sectionData.levels) {
    for (const zone of level.zones) {
      for (const sectionId of zone.sections) {
        sections.push({
          id: sectionId,
          level: level.name,
          zone: zone.name,
        });
      }
    }
  }
  return sections;
}

/**
 * Filter sections by level name (exact match).
 * @param {string} level - e.g. "Field Level", "100 Level", "200 Level", "500 Level"
 * @returns {Array<string>} Section IDs belonging to that level.
 */
export function getSectionsByLevel(level) {
  const found = sectionData?.levels?.find((l) => l.name === level);
  if (!found) return [];
  const sections = [];
  for (const zone of found.zones) {
    sections.push(...zone.sections);
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Platform accessors
// ---------------------------------------------------------------------------

/**
 * @returns {Object|null} The full platforms config object, keyed by platform slug.
 */
export function getPlatforms() {
  return platformData?.platforms ?? null;
}

/**
 * Look up the seller fee percentage for a given platform.
 * @param {string} platform - e.g. "seatgeek", "stubHub"
 * @returns {number|undefined} Fee as a whole-number percent (e.g. 10 for 10%),
 *   or undefined if the platform key is not found.
 */
export function getSellerFee(platform) {
  return platformData?.platforms?.[platform]?.sellerFeePercent;
}

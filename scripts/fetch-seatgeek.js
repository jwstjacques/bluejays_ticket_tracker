#!/usr/bin/env node

/**
 * Fetch SeatGeek listing prices for tracked sections across all 2026 Blue Jays home games.
 *
 * Usage:
 *   node scripts/fetch-seatgeek.js
 *   node scripts/fetch-seatgeek.js --date 2026-04-07   (single game)
 *
 * Requires: SEATGEEK_CLIENT_ID environment variable (get one at https://seatgeek.com/account/develop)
 *
 * Output: writes to config/personal/market_prices.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SEASON_PATH = join(ROOT, 'config', '2026_season.json');
const PRICES_PATH = join(ROOT, 'config', 'personal', 'market_prices.json');

const TRACKED_SECTIONS = ['229', '230', '231', '232', '233'];

// SeatGeek API base — needs client_id
const SG_API = 'https://api.seatgeek.com/2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// SeatGeek API fetching
// ---------------------------------------------------------------------------

/**
 * Fetch listings for a SeatGeek event and extract prices for tracked sections.
 * Returns an object like: { "229": 65.00, "231": 78.00, ... }
 */
async function fetchEventPrices(eventId, clientId) {
  const url = `${SG_API}/events/${eventId}?client_id=${clientId}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SeatGeek API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const stats = data.stats || {};

  // The public API returns aggregate stats, not per-section listings.
  // We get: lowest_price, average_price, highest_price, listing_count
  const result = {
    lowestPrice: stats.lowest_price ?? null,
    averagePrice: stats.average_price ?? null,
    highestPrice: stats.highest_price ?? null,
    listingCount: stats.listing_count ?? 0,
    medianPrice: stats.median_price ?? null,
  };

  // Try the listings endpoint for per-section data
  try {
    const listingsUrl = `${SG_API}/events/${eventId}/listings?client_id=${clientId}&per_page=500`;
    const listingsRes = await fetch(listingsUrl);

    if (listingsRes.ok) {
      const listingsData = await listingsRes.json();
      const listings = listingsData.listings || [];

      // Extract min price per tracked section
      const sectionPrices = {};
      for (const section of TRACKED_SECTIONS) {
        sectionPrices[section] = null;
      }

      for (const listing of listings) {
        const sec = listing.s || listing.section || '';
        const secStr = String(sec).trim();
        if (TRACKED_SECTIONS.includes(secStr)) {
          const price = listing.p || listing.price || null;
          if (price != null) {
            if (sectionPrices[secStr] === null || price < sectionPrices[secStr]) {
              sectionPrices[secStr] = price;
            }
          }
        }
      }

      result.sections = sectionPrices;
    }
  } catch {
    // Listings endpoint may not be available, fall back to aggregate only
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) {
    console.error('Error: Set SEATGEEK_CLIENT_ID environment variable.');
    console.error('Get one at: https://seatgeek.com/account/develop');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dateFlag = args.indexOf('--date');
  const singleDate = dateFlag !== -1 ? args[dateFlag + 1] : null;

  const season = loadJSON(SEASON_PATH);
  const pricesData = loadJSON(PRICES_PATH);

  let games = season.games;
  if (singleDate) {
    games = games.filter((g) => g.date === singleDate);
    if (games.length === 0) {
      console.error(`No game found for date: ${singleDate}`);
      process.exit(1);
    }
  }

  console.log(`Fetching prices for ${games.length} game(s)...`);
  console.log(`Tracked sections: ${TRACKED_SECTIONS.join(', ')}`);
  console.log();

  let fetched = 0;
  let errors = 0;

  for (const game of games) {
    const eventId = game.seatgeek?.eventId;
    if (!eventId) {
      console.log(`  [SKIP] ${game.date} vs ${game.opponent} — no SeatGeek event ID`);
      continue;
    }

    try {
      process.stdout.write(`  ${game.date} vs ${game.opponent}... `);
      const prices = await fetchEventPrices(eventId, clientId);
      pricesData.prices[game.date] = {
        ...prices,
        fetchedAt: new Date().toISOString(),
      };
      fetched++;

      const low = prices.lowestPrice ? `$${prices.lowestPrice}` : 'n/a';
      const sec231 = prices.sections?.['231'] ? `$${prices.sections['231']}` : 'n/a';
      console.log(`low: ${low}, sec 231: ${sec231}, ${prices.listingCount} listings`);

      // Rate limit: 1 second between requests
      if (games.indexOf(game) < games.length - 1) {
        await sleep(1000);
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }
  }

  pricesData.lastFetched = new Date().toISOString();
  pricesData.trackedSections = TRACKED_SECTIONS;
  saveJSON(PRICES_PATH, pricesData);

  console.log();
  console.log(`Done. ${fetched} fetched, ${errors} errors.`);
  console.log(`Saved to: ${PRICES_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

Interactive wizard to scrape SeatGeek prices for Blue Jays games. Guides the user through game selection, scraping, and optional saving.

## Step 1: Load the schedule and ticket data

1. Read `config/2026_season.json` to get all games.
2. Read `config/personal/my_tickets.json` to get the user's ticket data. This is an array of ticket objects, each with a `date` field (e.g. `"2026-04-07"`).
3. Cross-reference: only include games where the user has a ticket entry for that date AND the game has a `seatgeek.url` field AND the ticket status is NOT `SOLD` or `TRADED` (case-insensitive). Skip any sold/traded tickets — there's no reason to track prices for those.

**If the result is empty** (no tickets found), print:

```
=== Blue Jays 2026 — SeatGeek Price Scraper ===

No games with tickets found.
Add your ticket data in config/personal/my_tickets.json or via the app's Schedule tab first.
```

Then stop.

## Step 2: Show the game menu

Print a numbered list of the user's ticketed games, grouped by month. Include the ticket status if available. Format:

```
=== Blue Jays 2026 — SeatGeek Price Scraper ===

Your ticketed games:

MARCH
  1. Mar 27 (Fri) — vs Oakland Athletics [KEEP] (4 tix)
  2. Mar 28 (Sat) — vs Oakland Athletics [SELL] (4 tix)
  3. Mar 29 (Sun) — vs Oakland Athletics [KEEP] (2 tix)

APRIL
  4. Apr 07 (Tue) — vs Los Angeles Dodgers [SELL] (4 tix)
  5. Apr 08 (Wed) — vs Los Angeles Dodgers [KEEP] (2 tix)
  ...
```

Then ask: **"Enter game number(s) to scrape (e.g. 4 or 1,3,5 or all):"**

Wait for the user's response before proceeding.

## Step 3: Open Chrome

1. Use `tabs_context_mcp` (with `createIfEmpty: true`) to get tab context.
2. Use `tabs_create_mcp` to create a new tab for scraping.

## Step 4: Scrape each selected game

For each selected game, do the following:

### 4a. Navigate
Use `navigate` to open the game's `seatgeek.url` **with `?quantity=N`** appended. To determine N: if the game has a SELL set, use that set's `quantity` (that's the listing size). Otherwise use the first set's `quantity`. This filters listings to only show prices for that many tickets together — solo tickets are always priced higher and would skew the results. Wait for the page to load by checking `document.title` contains the opponent name via `javascript_tool`.

### 4b. Extract data via React fiber
Run this JavaScript via `javascript_tool`:

```javascript
const listEl = document.querySelector('.LazyList__List-sc-e707cbda-0');
const fiberKey = Object.keys(listEl).find(k => k.startsWith('__reactFiber'));
let fiber = listEl[fiberKey];
for (let i = 0; i < 4; i++) fiber = fiber.return;
const allIds = fiber.memoizedProps.listingIds;

fiber = listEl[fiberKey];
for (let i = 0; i < 23; i++) fiber = fiber.return;
let state = fiber.memoizedState;
let store = null;
while (state) {
  if (state.memoizedState && typeof state.memoizedState === 'object' && state.memoizedState[allIds[0]]) {
    store = state.memoizedState;
    break;
  }
  state = state.next;
}

const targets = ['229', '230', '231', '232', '233'];
const results = {};
for (const sec of targets) results[sec] = { low: null, high: null, count: 0 };

let totalListings = 0;
let overallLow = null;
const allPrices = [];

for (const id of allIds) {
  const entry = store[id];
  if (!entry || !entry._listing) continue;
  const listing = entry._listing;
  const section = String(listing.s || '');
  const price = listing.p;
  if (price == null) continue;

  totalListings++;
  allPrices.push(price);
  if (overallLow === null || price < overallLow) overallLow = price;

  if (targets.includes(section)) {
    const r = results[section];
    r.count++;
    if (r.low === null || price < r.low) r.low = price;
    if (r.high === null || price > r.high) r.high = price;
  }
}

allPrices.sort((a, b) => a - b);
const median = allPrices.length > 0 ? allPrices[Math.floor(allPrices.length / 2)] : null;

JSON.stringify({ totalListings, overallLow, median, sections: results }, null, 2);
```

**If the LazyList selector fails**, fall back to the `__NEXT_DATA__` script tag for `event.stats` (overall stats only) and report that section-level data couldn't be extracted.

### 4c. Print results for that game

```
=== SeatGeek Prices: [Opponent] ([Date], [Day]) ===

Overall: Lowest $XX | Median $XX | Total Listings: XX

Section | Low    | High   | Listings
--------|--------|--------|--------
229     | $XXX   | $XXX   | X
230     | $XXX   | $XXX   | X
231     | $XXX   | $XXX   | X
232     | $XXX   | $XXX   | X
233     | $XXX   | $XXX   | X
```

- If a section has no listings, show `—` for Low/High and `0` for Listings.
- Prices are base prices (before buyer fees).

If scraping multiple games, print each game's results as you go, then continue to the next.

## Step 5: Ask to save

After all games are scraped, ask:

**"Save these results to config/personal/market_prices.json? (y/n)"**

Wait for the user's response.

- **If yes**: Read the existing `config/personal/market_prices.json`, then for each scraped game, update (or create) the entry under `prices[date]` using this format:
  ```json
  {
    "fetchedAt": "<current ISO timestamp>",
    "lowestOverall": <overallLow>,
    "medianPrice": <median>,
    "totalListings": <totalListings>,
    "sections": {
      "229": <low for 229 or null>,
      "230": <low for 230 or null>,
      "231": <low for 231 or null>,
      "232": <low for 232 or null>,
      "233": <low for 233 or null>
    },
    "sectionsHigh": {
      "229": <high for 229 or null>,
      "230": <high for 230 or null>,
      "231": <high for 231 or null>,
      "232": <high for 232 or null>,
      "233": <high for 233 or null>
    },
    "sectionListingCounts": {
      "229": <count for 229>,
      "230": <count for 230>,
      "231": <count for 231>,
      "232": <count for 232>,
      "233": <count for 233>
    }
  }
  ```
  Also update `lastFetched` at the top level. Write the file and confirm.

- **If no**: Print "Results not saved." and stop.

## Notes
- Use Claude-in-Chrome browser tools throughout.
- Reuse the same tab for each game (navigate to the next URL, no need to create multiple tabs).
- If a game fails to scrape, print the error and continue to the next game.
- Keep a brief pause between games if scraping multiple to avoid being rate-limited.

Scrape SeatGeek prices for a single Blue Jays game. Prints results to terminal, then asks whether to save.

**Game date argument:** $ARGUMENTS

## Step 1: Resolve the date

The argument is a date in `MM-DD` format (no year). Prepend `2026-` and zero-pad to get an ISO date like `2026-04-07`.

Examples: `04-07` → `2026-04-07`, `3-27` → `2026-03-27`

## Step 2: Find the game and ticket quantity

1. Read `config/2026_season.json` and find the game matching that date. If no match, list nearby dates and stop.
2. Read `config/personal/my_tickets.json` and find the ticket entry for that date. The ticket data may have multiple `sets` — each set has its own `quantity` and `status`. A game can be split into a KEEP set and a SELL set (e.g. keeping 2, selling 2 of 4 total).
3. Determine the **scrape quantity**:
   - If there's a set with status `SELL`, use that set's `quantity` (that's the listing size on SeatGeek).
   - Otherwise use the first set's `quantity`.
   - If no ticket entry exists, default to `2`.

Print: **date, opponent, day of week, quantity**.

## Step 3: Open SeatGeek in Chrome

1. Use `tabs_context_mcp` (with `createIfEmpty: true`) to get tab context.
2. Use `tabs_create_mcp` to create a new tab.
3. Use `navigate` to open the game's `seatgeek.url` field **with `?quantity=N`** appended (where N is the ticket quantity from step 2). This filters listings to only show prices for that many tickets together, which is critical for accurate pricing — solo tickets are always priced higher.
4. Wait for the page title to contain the opponent name (use `javascript_tool` to check `document.title`).

## Step 4: Extract listing data via React fiber

Run this JavaScript via `javascript_tool` on the SeatGeek tab. This accesses the internal React store where all listing data is held in memory (no scrolling needed):

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

**If the LazyList selector fails** (SeatGeek may change class names), fall back to reading the `__NEXT_DATA__` script tag for `event.stats` (overall stats only) and report that section-level data couldn't be extracted.

## Step 5: Print results

Format and print to terminal:

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
- Prices are base prices (before buyer fees), which is what sellers net.

## Step 6: Ask to save

After printing results, ask:

**"Save to config/personal/market_prices.json? (y/n)"**

Wait for the user's response.

- **If yes**: Read the existing `config/personal/market_prices.json`, then update (or create) the entry under `prices[date]` using this format:
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
  Also update `lastFetched` at the top level. Write the file and confirm: `"✓ Saved to market_prices.json"`

- **If no**: Print "Results not saved." and stop.

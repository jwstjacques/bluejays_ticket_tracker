# Claude Code Commands

BJTT includes custom [Claude Code](https://claude.ai/code) slash commands that scrape live SeatGeek listing data using browser automation. These are power-user tools — they require Claude Code with the [Claude-in-Chrome](https://chromewebstore.google.com/detail/claude-in-chrome/) extension.

**Heads up — token usage:** These commands use browser automation which is token-heavy. Expect roughly **20-30k tokens per game** (the bulk is the listing data coming back from SeatGeek — 500-800+ listings as JSON). High-demand games (e.g. Dodgers, Yankees) will have more listings and cost more. With `/scrape-wizard`, the first game is slightly more expensive (tab setup + game menu), then each additional game is ~20-25k. Scraping a full 20-game package would run ~500k tokens. Use sparingly — scrape only the games you need.

## Prerequisites

- [Claude Code](https://claude.ai/code) CLI installed
- [Claude-in-Chrome](https://chromewebstore.google.com/detail/claude-in-chrome/) browser extension installed and running in Chrome
- Chrome open with the extension active

## Setup

After cloning the repo, run the setup script to install the commands:

```bash
npm run setup:claude
```

This copies the command templates from `scripts/claude-commands/` into `.claude/commands/` (which is gitignored). Restart Claude Code after running — commands are discovered on session start.

## Commands

### `/scrape-game MM-DD`

Scrape SeatGeek prices for a single game by date.

```
/scrape-game 04-07
```

**What it does:**

1. Looks up the game on `2026-04-07` in the season schedule
2. Reads your ticket data to determine quantity (uses the SELL set quantity if you've split tickets, otherwise your total quantity, defaults to 2)
3. Opens the SeatGeek event page in Chrome with `?quantity=N` to filter for N-ticket listings
4. Extracts all listing data from SeatGeek's React internals — gets every listing, not just the visible ones
5. Prints a summary table:

```
=== SeatGeek Prices: Los Angeles Dodgers (2026-04-07, Tue) ===

Overall: Lowest $45 | Median $89 | Total Listings: 782

Section | Low    | High   | Listings
--------|--------|--------|--------
229     | $52    | $161   | 14
230     | $48    | $145   | 22
231     | $45    | $138   | 18
232     | $51    | $152   | 16
233     | $55    | $168   | 12
```

6. Asks whether to save the results to `config/personal/market_prices.json`

**Notes:**
- Prices are base prices (what sellers net), before buyer fees
- The quantity filter matters — solo tickets are priced significantly higher than pairs

### `/scrape-wizard`

Interactive wizard for scraping multiple games.

```
/scrape-wizard
```

**What it does:**

1. Cross-references the schedule with your ticket data, excluding any SOLD or TRADED games
2. Shows a numbered menu of your ticketed games, grouped by month:

```
=== Blue Jays 2026 — SeatGeek Price Scraper ===

Your ticketed games:

MARCH
  1. Mar 27 (Fri) — vs Oakland Athletics [KEEP] (4 tix)
  2. Mar 28 (Sat) — vs Oakland Athletics [SELL] (2 tix)
  3. Mar 29 (Sun) — vs Oakland Athletics [KEEP] (2 tix)

APRIL
  4. Apr 07 (Tue) — vs Los Angeles Dodgers [SELL] (2 tix)
  5. Apr 08 (Wed) — vs Los Angeles Dodgers [KEEP] (2 tix)
  ...
```

3. Prompts you to pick games: enter a number (`4`), a list (`1,3,5`), or `all`
4. Scrapes each selected game sequentially, printing results as it goes
5. After all games are done, asks whether to save everything to `config/personal/market_prices.json`

**Notes:**
- Reuses a single Chrome tab for all games
- If a game fails to scrape, it prints the error and continues to the next
- Only shows games where you have ticket data and a SeatGeek URL exists

## How It Works

SeatGeek uses a virtualized list (only renders ~10 visible listings at a time), so DOM scraping only captures a fraction. These commands instead traverse SeatGeek's React fiber tree to access the full in-memory listing store — typically 500-800+ listings per event.

The extraction targets sections 229–233 (the sections around a typical 200-level season ticket holder's seats). Overall stats (lowest price, median, total listings) cover all sections.

## Saved Data Format

When you choose to save, each game is stored under `config/personal/market_prices.json` keyed by date:

```json
{
  "2026-04-07": {
    "fetchedAt": "2026-03-10T15:30:00.000Z",
    "lowestOverall": 45,
    "medianPrice": 89,
    "totalListings": 782,
    "sections": {
      "229": 52, "230": 48, "231": 45, "232": 51, "233": 55
    },
    "sectionsHigh": {
      "229": 161, "230": 145, "231": 138, "232": 152, "233": 168
    },
    "sectionListingCounts": {
      "229": 14, "230": 22, "231": 18, "232": 16, "233": 12
    }
  }
}
```

This data feeds into the app's Financials tab and game detail P/L calculations.

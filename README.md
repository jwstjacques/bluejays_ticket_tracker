# BJTT — Blue Jays Ticket Tracker

A browser-based tool for managing Toronto Blue Jays 2026 season tickets — tracking inventory, costs, marketplace prices, and resale profit/loss.

All data is saved to JSON files on disk (`config/personal/`). Nothing is sent externally.

## Quick Start

```bash
npm install
npm run dev
```

Opens at `http://localhost:8080`. Runs an Express server that serves the app and provides API endpoints for reading/writing your ticket data to disk.

## Setting Up Your Tickets

### Option A: Bulk setup via ticket package

Best for season ticket holders with the same section/row across many games.

1. Go to the **Settings** tab
2. Under **Ticket Package**, select your package from the dropdown
3. Fill in your **Section**, **Row**, **Seats**, and **Tickets** (quantity per game)
4. Enter your **Total Package Cost** — the app calculates cost/game and cost/ticket automatically
5. Click **Apply Package** — this populates all games in that package with your seat info
6. Existing ticket entries won't be overwritten, so it's safe to re-apply

### Option B: Add tickets game by game

1. Go to the **Schedule** tab
2. Click any game row to open the game detail view
3. Fill in the ticket form — section, row, seats, quantity, cost per ticket, and status
4. Click **Save**

### Option C: Import from a file

1. Go to **Settings → Data Management**
2. Use **Import Data** to upload a `.json` file

The import file must follow this schema (see `config/sample_import.json` for a working example):

```json
{
  "version": 2,
  "tickets": {
    "2026-04-07": {
      "sets": [
        {
          "section": "231",
          "row": "6",
          "seats": "6-7",
          "quantity": 2,
          "costPerTicket": 84.35,
          "totalCost": 168.70,
          "status": "KEEP",
          "notes": ""
        }
      ]
    }
  }
}
```

**Required fields:** `version`, `tickets`

**Per-ticket fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `section` | string | yes | Section ID (e.g. "231", "144B") |
| `row` | string | no | Row number |
| `seats` | string | no | Seat range (e.g. "6-7") |
| `quantity` | number | yes | Number of tickets |
| `costPerTicket` | number | yes | Cost per ticket in CAD |
| `totalCost` | number | yes | quantity x costPerTicket |
| `status` | string | yes | KEEP, SELL, ACQUIRED, PENDING TRADE, SOLD, TRADED, or WATCHING |
| `notes` | string | no | Free text |
| `platform` | string | no | Marketplace (seatgeek, stubHub, ticketmaster, vividSeats) |
| `marketPrice` | number | no | Current market price per ticket |
| `tradeLink` | string | no | Date of the game traded to/from (e.g. "2026-06-10") |

Games can have multiple sets (e.g. keeping 2 and selling 2), each as a separate entry in the `sets` array.

## Tabs

### Schedule

The main view — all 81 home games in a filterable table.

- **Filter** by month, opponent, promotions, or "My Games Only" (games you have tickets for)
- **Summary bar** shows game count, ticket count, and total spent for the current filter
- **Click a row** to open the game detail view for editing tickets and viewing market prices

### My Tickets

Portfolio view of every game you have ticket data for.

- **Stat cards**: total games, total tickets, total spent, average cost per ticket
- **Status pills**: at-a-glance count by status (KEEP, SELL, ACQUIRED, etc.)
- **Search**: filter by opponent, section, or status
- **Show sold/traded**: toggle to include completed transactions (hidden by default)
- **Sortable columns**: click any header to sort
- Click a row to edit that game's ticket details

### Financials

Profit/loss analysis focused on tickets you plan to sell.

- **Summary cards**: total investment, gross revenue, net revenue (after fees), and net P/L for all SELL games
- **Per-game breakdown**: each SELL game with section, quantity, cost basis, market price, fees, and individual P/L
- **Full portfolio valuation**: what your entire ticket inventory is worth at current market prices
- Market prices come from the SeatGeek data you enter (or scrape) in each game's detail view

### Settings

Configuration and data management.

- **Ticket Package**: bulk-apply seat info to a package of games (enter total package cost, per-ticket cost is derived)
- **Export Tickets**: download as JSON (re-importable) or CSV (for spreadsheets)
- **Export Prices**: download market price data as JSON or CSV
- **Import**: restore from a previously exported JSON file or a manually created one
- **Clear All Data**: wipe everything (destructive, with confirmation)
- **Platform Fees**: reference table for seller fee rates by marketplace

### Map

Link to the Rogers Centre seating chart on MLB.com (opens in new tab).

## Game Detail View

Click any game from Schedule, My Tickets, or Financials to open the detail view:

- **SeatGeek Comparable Prices**: editable low/high prices for your section and nearby sections. Section headers link directly to that section's listings on SeatGeek.
- **Sell Targets**: breakeven and profit target prices at different fee rates
- **Ticket Form**: section, row, seats, quantity, cost, status, platform, market price, notes
- **Qty to Sell**: when status is SELL and you have more than 1 ticket, you can sell a portion — the app auto-splits into a KEEP set and a SELL set
- **Profit/Loss Calculator**: shows net gain/loss for selling at market price, accounting for platform fees
- **Marketplace Links**: direct links to view the game on SeatGeek, Ticketmaster, StubHub, and Vivid Seats

## Ticket Statuses

| Status | Meaning |
|--------|---------|
| **KEEP** | Attending — not for sale |
| **SELL** | Listed or planning to list for resale |
| **ACQUIRED** | Obtained via trade from another game |
| **PENDING TRADE** | Trade in progress |
| **SOLD** | Successfully sold |
| **TRADED** | Successfully traded away |
| **WATCHING** | Monitoring — no tickets yet |

## Data Storage

Ticket and price data is saved to JSON files on disk via the Express server:

| File | Contents |
|------|----------|
| `config/personal/my_tickets.json` | Your ticket inventory (section, qty, cost, status per game) |
| `config/personal/market_prices.json` | SeatGeek comparable prices per game |

The `config/personal/` directory is gitignored. Back up regularly via **Settings → Export**.

Package settings (last-selected package, section, cost) are stored in browser localStorage as a convenience — not critical data.

## Project Structure

```
index.html              — Entry point
server.js               — Express server (static files + JSON read/write API)
src/
  js/                   — App logic (router, views, storage, utils)
  css/                  — Styles
config/
  2026_season.json      — Full 81-game schedule with promotions and marketplace URLs
  ticket_packages.json  — Pre-defined ticket packages (Full, Quarter A-D)
  platforms.json        — Marketplace platform definitions and fee rates
  personal/             — Your data (gitignored)
    my_tickets.json
    market_prices.json
  sample_import.json    — Example import file for reference
```

## Claude Code Integration

If you use [Claude Code](https://claude.ai/code), this project includes slash commands for scraping live SeatGeek prices via browser automation. After cloning:

```bash
npm run setup:claude
```

Then restart Claude Code. You'll have access to `/scrape-game 04-07` (single game) and `/scrape-wizard` (interactive multi-game picker). See [scripts/README.md](scripts/README.md) for full details.

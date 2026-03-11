import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMyTickets,
  getTicketForGame,
  saveTicket,
  deleteTicket,
  importFromJSON,
  exportToJSON,
  clearAllData,
  getStats,
} from '../src/js/storage.js';

beforeEach(() => {
  clearAllData();
});

describe('getMyTickets', () => {
  it('returns default structure when empty', () => {
    const result = getMyTickets();
    expect(result).toEqual({ version: 2, tickets: {} });
  });

  it('returns stored data', () => {
    saveTicket('2026-03-27', { section: '231', quantity: 2, costPerTicket: 84.35 });
    const result = getMyTickets();
    expect(result.version).toBe(2);
    expect(result.tickets['2026-03-27']).toBeDefined();
    expect(result.tickets['2026-03-27'].section).toBe('231');
  });
});

describe('getTicketForGame', () => {
  it('returns null when no ticket exists', () => {
    expect(getTicketForGame('2026-03-27')).toBeNull();
  });

  it('returns the ticket when it exists', () => {
    saveTicket('2026-03-27', { section: '231', quantity: 2, costPerTicket: 84.35 });
    const ticket = getTicketForGame('2026-03-27');
    expect(ticket).not.toBeNull();
    expect(ticket.section).toBe('231');
    expect(ticket.quantity).toBe(2);
  });
});

describe('saveTicket', () => {
  it('saves a new ticket with auto-calculated totalCost', () => {
    const result = saveTicket('2026-04-07', { section: '232', quantity: 2, costPerTicket: 84.35 });
    expect(result.totalCost).toBe(168.70);
    expect(result.quantity).toBe(2);
    expect(result.costPerTicket).toBe(84.35);
  });

  it('sets createdAt on first save', () => {
    const result = saveTicket('2026-04-07', { section: '231' });
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('preserves createdAt on update', () => {
    const first = saveTicket('2026-04-07', { section: '231' });
    const createdAt = first.createdAt;
    const second = saveTicket('2026-04-07', { section: '232' });
    expect(second.createdAt).toBe(createdAt);
    expect(second.section).toBe('232');
  });

  it('defaults to ACQUIRED status', () => {
    const result = saveTicket('2026-04-07', { section: '231' });
    expect(result.status).toBe('ACQUIRED');
  });

  it('allows overriding status', () => {
    const result = saveTicket('2026-04-07', { section: '231', status: 'KEEP' });
    expect(result.status).toBe('KEEP');
  });
});

describe('deleteTicket', () => {
  it('returns false when no ticket exists', () => {
    expect(deleteTicket('2026-03-27')).toBe(false);
  });

  it('deletes an existing ticket and returns true', () => {
    saveTicket('2026-03-27', { section: '231' });
    expect(deleteTicket('2026-03-27')).toBe(true);
    expect(getTicketForGame('2026-03-27')).toBeNull();
  });
});

describe('importFromJSON', () => {
  it('imports object-format tickets (from export)', () => {
    const json = JSON.stringify({
      version: 2,
      tickets: {
        '2026-03-27': { section: '232', quantity: 4, costPerTicket: 188.60, totalCost: 754.40, status: 'KEEP' },
        '2026-04-07': { section: '231', quantity: 2, costPerTicket: 84.35, totalCost: 168.70, status: 'SELL' },
      },
    });
    const result = importFromJSON(json);
    expect(result.imported).toBe(2);
    expect(getTicketForGame('2026-03-27').section).toBe('232');
    expect(getTicketForGame('2026-04-07').status).toBe('SELL');
  });

  it('imports array-format tickets (from personal config)', () => {
    const json = JSON.stringify({
      version: 1,
      seats: [],
      tickets: [
        { date: '2026-03-27', opponent: 'Oakland Athletics', section: '232', quantity: 4, costPerTicket: 188.60, totalCost: 754.40, status: 'KEEP' },
        { date: '2026-04-07', opponent: 'Los Angeles Dodgers', section: '231', quantity: 2, costPerTicket: 84.35, totalCost: 168.70, status: 'SELL' },
      ],
    });
    const result = importFromJSON(json);
    expect(result.imported).toBe(2);
    const ticket = getTicketForGame('2026-03-27');
    expect(ticket.section).toBe('232');
    expect(ticket.opponent).toBeUndefined(); // opponent stripped during import
  });

  it('deduplicates array entries by date (merged into sets)', () => {
    const json = JSON.stringify({
      version: 1,
      tickets: [
        { date: '2026-04-07', section: '232', quantity: 2, costPerTicket: 84.35, totalCost: 168.70, status: 'SELL' },
        { date: '2026-04-07', section: '234', quantity: 2, costPerTicket: 84.35, totalCost: 168.70, status: 'SELL' },
      ],
    });
    const result = importFromJSON(json);
    expect(result.imported).toBe(1); // 1 date key
    expect(getTicketForGame('2026-04-07').section).toBe('232'); // primary set
  });

  it('throws on invalid JSON', () => {
    expect(() => importFromJSON('not json')).toThrow('valid JSON');
  });

  it('throws on missing version', () => {
    expect(() => importFromJSON(JSON.stringify({ tickets: {} }))).toThrow('version');
  });

  it('throws on missing tickets', () => {
    expect(() => importFromJSON(JSON.stringify({ version: 1 }))).toThrow('tickets');
  });

  it('throws on invalid date key in object format', () => {
    const json = JSON.stringify({ version: 1, tickets: { 'bad-date': {} } });
    expect(() => importFromJSON(json)).toThrow('Invalid date');
  });

  it('throws on invalid date in array format', () => {
    const json = JSON.stringify({ version: 1, tickets: [{ date: 'nope' }] });
    expect(() => importFromJSON(json)).toThrow('Invalid date');
  });

  it('throws on array entries without date field', () => {
    const json = JSON.stringify({ version: 1, tickets: [{ section: '231' }] });
    expect(() => importFromJSON(json)).toThrow('date');
  });
});

describe('clearAllData', () => {
  it('removes all tickets', () => {
    saveTicket('2026-03-27', { section: '231' });
    saveTicket('2026-04-07', { section: '232' });
    clearAllData();
    const result = getMyTickets();
    expect(result).toEqual({ version: 2, tickets: {} });
  });
});

describe('getStats', () => {
  it('returns zeros when empty', () => {
    const stats = getStats();
    expect(stats.totalGames).toBe(0);
    expect(stats.totalTickets).toBe(0);
    expect(stats.totalSpent).toBe(0);
    expect(stats.byStatus).toEqual({});
  });

  it('calculates correct stats', () => {
    saveTicket('2026-03-27', { section: '232', quantity: 4, costPerTicket: 188.60, status: 'KEEP' });
    saveTicket('2026-04-07', { section: '231', quantity: 2, costPerTicket: 84.35, status: 'SELL' });
    saveTicket('2026-04-24', { section: '231', quantity: 2, costPerTicket: 84.35, status: 'KEEP' });

    const stats = getStats();
    expect(stats.totalGames).toBe(3);
    expect(stats.totalTickets).toBe(8);
    expect(stats.totalSpent).toBeCloseTo(754.40 + 168.70 + 168.70, 2);
    expect(stats.byStatus.KEEP).toBe(2);
    expect(stats.byStatus.SELL).toBe(1);
  });
});

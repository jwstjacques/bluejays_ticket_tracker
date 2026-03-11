/**
 * Settings view — data management, about info, and platform fee reference.
 */

import { exportToJSON, importFromJSON, clearAllData, getMyTickets, exportMarketPrices, getMarketPrices, saveTicket } from '../storage.js';
import { getPackages, getGameByDate, getAllSections } from '../data.js';

/**
 * Render the settings view into the given container element.
 * @param {HTMLElement} container
 */
export function renderSettings(container) {
  const data = getMyTickets();
  const gameCount = Object.keys(data.tickets).length;

  container.innerHTML = `
    <h1 class="mb-16" style="font-size:22px;font-weight:700;">Settings</h1>

    <!-- Ticket Package -->
    <div class="panel mb-16" id="package-panel"></div>

    <!-- Data Management -->
    <div class="panel mb-16">
      <div class="panel-header">
        <h2>Data Management</h2>
      </div>
      <div class="panel-body">
        <p class="text-muted mb-16" style="font-size:14px;">
          You have ticket data for <strong>${gameCount}</strong> game${gameCount !== 1 ? 's' : ''}.
        </p>

        <div class="flex flex-wrap gap-8 mb-16" style="align-items:center;">
          <span style="font-size:13px;font-weight:600;">Export Tickets:</span>
          <button class="btn btn-primary btn-sm" id="settings-export-json">JSON</button>
          <button class="btn btn-primary btn-sm" id="settings-export-csv">CSV</button>
          <span style="font-size:13px;font-weight:600;margin-left:8px;">Export Prices:</span>
          <button class="btn btn-primary btn-sm" id="settings-export-prices-json">JSON</button>
          <button class="btn btn-primary btn-sm" id="settings-export-prices-csv">CSV</button>
          <button class="btn btn-danger btn-sm" id="settings-clear" style="margin-left:auto;">Clear All Data</button>
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="settings-import-file">Import Data</label>
          <input class="form-input" type="file" id="settings-import-file" accept=".json">
          <p class="form-hint">Select a previously exported .json file to restore your data.</p>
        </div>

        <div id="settings-message" style="margin-top:12px;"></div>
      </div>
    </div>

    <!-- Platform Fees Reference -->
    <div class="panel mb-16">
      <div class="panel-header">
        <h2>Platform Fees Reference</h2>
      </div>
      <div class="panel-body" style="padding:0;">
        <table class="schedule-table" style="margin:0;box-shadow:none;">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Seller Fee</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>SeatGeek</td>
              <td>10%</td>
            </tr>
            <tr>
              <td>StubHub</td>
              <td>~15%</td>
            </tr>
            <tr>
              <td>Ticketmaster</td>
              <td>~15%</td>
            </tr>
            <tr>
              <td>Vivid Seats</td>
              <td>10%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- About -->
    <div class="panel">
      <div class="panel-header">
        <h2>About</h2>
      </div>
      <div class="panel-body">
        <p style="font-size:16px;font-weight:700;margin-bottom:8px;">BJTT &mdash; Blue Jays Ticket Tracker</p>
        <p class="text-muted" style="font-size:14px;margin-bottom:12px;">
          Track your Blue Jays tickets, compare marketplace prices, and calculate profit/loss.
        </p>
        <p class="text-muted" style="font-size:13px;margin-bottom:16px;">
          Your ticket data is saved to JSON files on disk (config/personal/).
          Use Export to download a portable backup.
        </p>
      </div>
    </div>
  `;

  // --- Wire up event handlers ---

  // Export tickets JSON
  container.querySelector('#settings-export-json').addEventListener('click', () => {
    exportToJSON();
    showMessage('settings-message', 'Ticket data exported as JSON.', 'success');
  });

  // Export tickets CSV
  container.querySelector('#settings-export-csv').addEventListener('click', () => {
    const data = getMyTickets();
    const entries = Object.entries(data.tickets);
    if (entries.length === 0) {
      showMessage('settings-message', 'No ticket data to export.', 'error');
      return;
    }
    const headers = ['Date', 'Set', 'Section', 'Row', 'Seats', 'Quantity', 'Cost/Ticket', 'Total Cost', 'Status', 'Market Price', 'Notes'];
    const rows = [];
    for (const [date, ticket] of entries) {
      const sets = ticket.sets || [ticket];
      for (let i = 0; i < sets.length; i++) {
        const t = sets[i];
        rows.push([
          date,
          sets.length > 1 ? i + 1 : '',
          t.section || '',
          t.row || '',
          t.seats || '',
          t.quantity || 0,
          t.costPerTicket || 0,
          t.totalCost || 0,
          t.status || '',
          t.marketPrice || '',
          csvEscape(t.notes || ''),
        ]);
      }
    }
    downloadCSV('bluejays-tickets', headers, rows);
    showMessage('settings-message', 'Ticket data exported as CSV.', 'success');
  });

  // Export prices JSON
  container.querySelector('#settings-export-prices-json').addEventListener('click', () => {
    const prices = getMarketPrices();
    if (Object.keys(prices).length === 0) {
      showMessage('settings-message', 'No price data to export.', 'error');
      return;
    }
    exportMarketPrices();
    showMessage('settings-message', 'Market prices exported as JSON.', 'success');
  });

  // Export prices CSV
  container.querySelector('#settings-export-prices-csv').addEventListener('click', () => {
    const prices = getMarketPrices();
    const entries = Object.entries(prices);
    if (entries.length === 0) {
      showMessage('settings-message', 'No price data to export.', 'error');
      return;
    }
    // Collect all section IDs across all dates
    const allSections = new Set();
    for (const [, p] of entries) {
      if (p.sections) Object.keys(p.sections).forEach(s => allSections.add(s));
    }
    const secs = [...allSections].sort();
    const headers = ['Date', 'Primary Section', 'Last Updated', ...secs.flatMap(s => [`Sec ${s} Low`, `Sec ${s} High`])];
    const rows = entries.sort(([a],[b]) => a.localeCompare(b)).map(([date, p]) => [
      date,
      p.primarySection || '',
      p.fetchedAt ? new Date(p.fetchedAt).toLocaleDateString() : '',
      ...secs.flatMap(s => [p.sections?.[s] ?? '', p.sectionsHigh?.[s] ?? '']),
    ]);
    downloadCSV('market-prices', headers, rows);
    showMessage('settings-message', 'Market prices exported as CSV.', 'success');
  });

  // Import
  container.querySelector('#settings-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = importFromJSON(text);
      showMessage('settings-message', `Imported ${result.imported} ticket(s) successfully. Reloading view...`, 'success');
      setTimeout(() => renderSettings(container), 800);
    } catch (err) {
      showMessage('settings-message', `Import failed: ${err.message}`, 'error');
    }
  });

  // Clear all data
  container.querySelector('#settings-clear').addEventListener('click', () => {
    const confirmed = window.confirm('Are you sure? This cannot be undone.');
    if (!confirmed) return;

    clearAllData();
    showMessage('settings-message', 'All data cleared.', 'success');
    // Re-render to reflect zero game count
    setTimeout(() => renderSettings(container), 800);
  });

  // --- Ticket Package selector ---
  buildPackagePanel(container.querySelector('#package-panel'), container);
}

// ---------------------------------------------------------------------------
// Ticket Package
// ---------------------------------------------------------------------------

function buildPackagePanel(panel, rootContainer) {
  const packages = getPackages();
  if (!packages || !packages.packages) {
    panel.style.display = 'none';
    return;
  }

  const pkgs = packages.packages;
  const saved = JSON.parse(localStorage.getItem('bjt-package-info') || '{}');
  const sections = getAllSections();

  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = '<h2>Ticket Package</h2>';
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'panel-body';

  const fieldStyle = 'max-width:300px;';
  const rowStyle = 'display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;';

  // Package dropdown
  body.innerHTML += `<div class="form-group" style="margin-bottom:12px;">
    <label class="form-label" for="pkg-type">Package</label>
    <select class="form-select" id="pkg-type" style="${fieldStyle}">
      <option value="">-- Select your package --</option>
      ${Object.entries(pkgs).map(([k, v]) =>
        `<option value="${k}"${saved.package === k ? ' selected' : ''}>${v.label} (${v.games.length} games)</option>`
      ).join('')}
    </select>
  </div>`;

  // Seat info row
  body.innerHTML += `<div style="${rowStyle}">
    <div class="form-group" style="margin-bottom:0;flex:1;min-width:140px;">
      <label class="form-label" for="pkg-section">Section</label>
      <select class="form-select" id="pkg-section" style="width:100%;">
        <option value="">-- Section --</option>
        ${sections.map(s => {
          const label = s.zone ? `${s.id} - ${s.level} / ${s.zone}` : `${s.id} - ${s.level}`;
          return `<option value="${s.id}"${saved.section === s.id ? ' selected' : ''}>${label}</option>`;
        }).join('')}
      </select>
    </div>
    <div class="form-group" style="margin-bottom:0;width:80px;">
      <label class="form-label" for="pkg-row">Row</label>
      <input class="form-input" type="text" id="pkg-row" placeholder="e.g. 6" value="${saved.row || ''}">
    </div>
    <div class="form-group" style="margin-bottom:0;width:100px;">
      <label class="form-label" for="pkg-seats">Seats</label>
      <input class="form-input" type="text" id="pkg-seats" placeholder="e.g. 6-7" value="${saved.seats || ''}">
    </div>
  </div>`;

  // Quantity and cost row
  body.innerHTML += `<div style="${rowStyle}">
    <div class="form-group" style="margin-bottom:0;width:80px;">
      <label class="form-label" for="pkg-qty">Tickets</label>
      <input class="form-input" type="number" id="pkg-qty" min="1" max="20" value="${saved.quantity || 2}">
    </div>
    <div class="form-group" style="margin-bottom:0;width:160px;">
      <label class="form-label" for="pkg-cost">Total Package Cost ($)</label>
      <input class="form-input" type="number" id="pkg-cost" min="0" step="0.01" placeholder="e.g. 3374" value="${saved.totalCost || ''}">
    </div>
    <div class="form-group" style="margin-bottom:0;width:110px;">
      <label class="form-label">/ Game</label>
      <output class="form-input" id="pkg-per-game" style="display:block;background:var(--color-light-gray);">—</output>
    </div>
    <div class="form-group" style="margin-bottom:0;width:110px;">
      <label class="form-label">/ Ticket</label>
      <output class="form-input" id="pkg-per-ticket" style="display:block;background:var(--color-light-gray);">—</output>
    </div>
  </div>`;

  // Info text
  body.innerHTML += `<p class="form-hint" style="margin-bottom:12px;">
    Applying will create ticket entries for all games in the package with this seat info. Existing entries won't be overwritten.
  </p>`;

  body.innerHTML += `<button class="btn btn-primary btn-sm" id="pkg-apply">Apply Package</button>
    <div id="settings-package-message" style="margin-top:12px;"></div>`;

  panel.appendChild(body);

  // Live cost breakdown
  const pkgSelect = panel.querySelector('#pkg-type');
  const qtyInput = panel.querySelector('#pkg-qty');
  const costInput = panel.querySelector('#pkg-cost');
  const perGameOutput = panel.querySelector('#pkg-per-game');
  const perTicketOutput = panel.querySelector('#pkg-per-ticket');
  const recalc = () => {
    const totalCost = parseFloat(costInput.value) || 0;
    const qty = parseInt(qtyInput.value, 10) || 0;
    const selectedPkg = pkgs[pkgSelect.value];
    const numGames = selectedPkg ? selectedPkg.games.length : 0;

    if (totalCost > 0 && numGames > 0) {
      const perGame = totalCost / numGames;
      perGameOutput.textContent = '$' + perGame.toFixed(2);
      perTicketOutput.textContent = qty > 0 ? '$' + (perGame / qty).toFixed(2) : '—';
    } else {
      perGameOutput.textContent = '—';
      perTicketOutput.textContent = '—';
    }
  };
  pkgSelect.addEventListener('change', recalc);
  qtyInput.addEventListener('input', recalc);
  costInput.addEventListener('input', recalc);
  recalc();

  // Apply handler
  panel.querySelector('#pkg-apply').addEventListener('click', () => {
    const pkgKey = panel.querySelector('#pkg-type').value;
    if (!pkgKey) {
      showMessage('settings-package-message', 'Select a package first.', 'error');
      return;
    }

    const section = panel.querySelector('#pkg-section').value;
    const row = panel.querySelector('#pkg-row').value.trim();
    const seats = panel.querySelector('#pkg-seats').value.trim();
    const quantity = parseInt(qtyInput.value, 10) || 0;
    const totalCost = parseFloat(costInput.value) || 0;

    if (!section) {
      showMessage('settings-package-message', 'Select a section.', 'error');
      return;
    }

    const pkg = pkgs[pkgKey];
    if (!pkg || !pkg.games) return;

    const numGames = pkg.games.length;
    const costPerGame = numGames > 0 ? +(totalCost / numGames).toFixed(2) : 0;
    const costPerTicket = quantity > 0 ? +(costPerGame / quantity).toFixed(2) : 0;

    // Save settings for next time
    localStorage.setItem('bjt-package-info', JSON.stringify({
      package: pkgKey, section, row, seats, quantity, totalCost,
    }));

    const existing = getMyTickets();
    let added = 0;
    for (const date of pkg.games) {
      if (existing.tickets[date]) continue;
      saveTicket(date, {
        section, row, seats, quantity, costPerTicket,
        status: 'KEEP',
      });
      added++;
    }

    if (added > 0) {
      showMessage('settings-package-message', `Added ${added} game${added !== 1 ? 's' : ''} from ${pkg.label}. ${pkg.games.length - added} already existed.`, 'success');
    } else {
      showMessage('settings-package-message', `All ${pkg.games.length} games from ${pkg.label} already have ticket entries.`, 'success');
    }

    setTimeout(() => renderSettings(rootContainer), 1200);
  });
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvEscape(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCSV(basename, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${basename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Display a transient feedback message inside a container element.
 * @param {string} elementId - The id of the message container element.
 * @param {string} text - The message text.
 * @param {'success'|'error'} type - Visual style.
 */
function showMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const color = type === 'success' ? 'var(--status-keep)' : 'var(--color-red)';
  const bg = type === 'success' ? 'rgba(26,138,63,0.08)' : 'rgba(232,41,28,0.08)';

  el.innerHTML = `
    <p style="padding:10px 14px;border-radius:var(--radius);font-size:14px;color:${color};background:${bg};">
      ${text}
    </p>
  `;
}

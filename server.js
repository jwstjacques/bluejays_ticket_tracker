const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

const PERSONAL_DIR = path.join(__dirname, 'config', 'personal');
const TICKETS_PATH = path.join(PERSONAL_DIR, 'my_tickets.json');
const PRICES_PATH = path.join(PERSONAL_DIR, 'market_prices.json');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// Ensure personal directory exists
if (!fs.existsSync(PERSONAL_DIR)) {
  fs.mkdirSync(PERSONAL_DIR, { recursive: true });
}

function readJSON(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return fallback;
}

// --- Tickets ---
app.get('/api/tickets', (_req, res) => {
  res.json(readJSON(TICKETS_PATH, { version: 2, tickets: {} }));
});

app.post('/api/tickets', (req, res) => {
  try {
    fs.writeFileSync(TICKETS_PATH, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Market Prices ---
app.get('/api/prices', (_req, res) => {
  res.json(readJSON(PRICES_PATH, {}));
});

app.post('/api/prices', (req, res) => {
  try {
    fs.writeFileSync(PRICES_PATH, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`BJTT running at http://localhost:${PORT}`);
});

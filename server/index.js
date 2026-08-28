// Force Playwright to look for Chromium inside node_modules
// (matches PLAYWRIGHT_BROWSERS_PATH=0 used at postinstall time)
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

const express = require('express');
const path = require('path');
const { scrapeMuntania, scrapeMuntaniaFromCatalogUrl } = require('./scrapers/muntania');
const { scrapeBaobab, scrapeBaobabFromCatalogUrl } = require('./scrapers/baobab');
const { scrapeKannak } = require('./scrapers/kannak');
const { generateExcel } = require('./excel');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT));

app.get('/api/scan', async (req, res) => {
  try {
    const results = await Promise.allSettled([
      scrapeMuntania(),
      scrapeBaobab(),
      scrapeKannak(),
    ]);
    const trips = results.flatMap((r, i) => {
      const empresa = ['Muntania', 'Baobabnature', 'Kannak'][i];
      if (r.status === 'fulfilled') return r.value;
      console.error(`Error en scraper ${empresa}:`, r.reason);
      return [];
    });
    res.json(trips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// In-memory scan state — sobrevive a desconexiones del cliente
let currentScan = null; // { id, status, progressBySource, trips, error, startedAt }

function startBackgroundScan() {
  const id = String(Date.now());
  const scan = {
    id,
    status: 'running',
    progressBySource: {},
    trips: null,
    error: null,
    startedAt: new Date().toISOString(),
  };
  currentScan = scan;

  const onProgress = (p) => {
    if (p.source && p.source !== 'Sistema') {
      scan.progressBySource[p.source] = p;
    }
  };

  (async () => {
    const trips = [];
    const runScraper = async (empresa, fn) => {
      try {
        const result = await fn(onProgress);
        trips.push(...result);
      } catch (err) {
        console.error(`Error en scraper ${empresa}:`, err);
        scan.progressBySource[empresa] = {
          source: empresa,
          status: 'error',
          error: err?.message || String(err),
        };
      }
    };

    try {
      // Fase 1: Muntania + Baobab en paralelo (HTTP ligero, sin Chromium)
      await Promise.all([
        runScraper('Muntania', scrapeMuntania),
        runScraper('Baobabnature', scrapeBaobab),
      ]);
      // Fase 2: Kannak solo (usa Chromium, pesado en memoria)
      await runScraper('Kannak', scrapeKannak);

      scan.trips = trips;
      scan.status = 'done';
    } catch (err) {
      console.error('Scan crashed:', err);
      scan.error = err.message;
      scan.status = 'error';
    }
  })();

  return scan;
}

app.post('/api/scan/start', (req, res) => {
  if (currentScan && currentScan.status === 'running') {
    return res.json({ id: currentScan.id, alreadyRunning: true });
  }
  const scan = startBackgroundScan();
  res.json({ id: scan.id });
});

function startUrlScan(urls) {
  const id = String(Date.now());
  const scan = {
    id,
    mode: 'urls',
    status: 'running',
    progressBySource: {},
    trips: null,
    error: null,
    startedAt: new Date().toISOString(),
    skipped: [],
  };
  currentScan = scan;

  const onProgress = (p) => {
    if (p.source && p.source !== 'Sistema') {
      scan.progressBySource[p.source] = p;
    }
  };

  const groups = { Baobabnature: [], Muntania: [] };
  for (const url of urls) {
    if (/baobabnature\.com/i.test(url)) groups.Baobabnature.push(url);
    else if (/muntania\.com/i.test(url)) groups.Muntania.push(url);
    else scan.skipped.push(url);
  }

  (async () => {
    const trips = [];
    const runGroup = async (empresa, list, scraper) => {
      if (!list.length) return;
      for (const url of list) {
        try {
          const result = await scraper(url, onProgress);
          trips.push(...result);
        } catch (err) {
          console.error(`[${empresa} URL] ${url}:`, err.message);
          scan.progressBySource[empresa] = {
            source: empresa,
            status: 'error',
            error: err.message,
          };
        }
      }
    };

    try {
      await Promise.all([
        runGroup('Baobabnature', groups.Baobabnature, scrapeBaobabFromCatalogUrl),
        runGroup('Muntania', groups.Muntania, scrapeMuntaniaFromCatalogUrl),
      ]);
      scan.trips = trips;
      scan.status = 'done';
    } catch (err) {
      console.error('URL scan crashed:', err);
      scan.error = err.message;
      scan.status = 'error';
    }
  })();

  return scan;
}

app.post('/api/scan/urls', (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls.map(s => String(s).trim()).filter(Boolean) : [];
  if (urls.length === 0) {
    return res.status(400).json({ error: 'Lista de URLs vacía' });
  }
  if (currentScan && currentScan.status === 'running') {
    return res.status(409).json({ error: 'Ya hay un escaneo en curso' });
  }
  const scan = startUrlScan(urls);
  res.json({ id: scan.id, skipped: scan.skipped });
});

app.get('/api/scan/status', (req, res) => {
  if (!currentScan) return res.json({ status: 'idle' });
  const { id, status, progressBySource, error, startedAt, mode, skipped } = currentScan;
  const payload = { id, status, progressBySource, error, startedAt, mode: mode || 'full' };
  if (skipped?.length) payload.skipped = skipped;
  if (status === 'done') payload.trips = currentScan.trips;
  res.json(payload);
});

app.post('/api/export', (req, res) => {
  try {
    const trips = req.body;
    if (!Array.isArray(trips) || trips.length === 0) {
      return res.status(400).json({ error: 'Lista vacía' });
    }
    const buffer = generateExcel(trips);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=planeta40-viajes.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Planeta 40 corriendo en http://localhost:${PORT}`);
});

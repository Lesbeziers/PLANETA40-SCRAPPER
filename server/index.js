const express = require('express');
const path = require('path');
const { scrapeMuntania } = require('./scrapers/muntania');
const { scrapeBaobab } = require('./scrapers/baobab');
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

app.get('/api/scan-stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const keepAlive = setInterval(() => res.write(':keepalive\n\n'), 15000);

  const onProgress = (p) => send('progress', p);

  try {
    send('progress', { source: 'Sistema', status: 'starting' });
    const results = await Promise.allSettled([
      scrapeMuntania(onProgress),
      scrapeBaobab(onProgress),
      scrapeKannak(onProgress),
    ]);
    const trips = results.flatMap((r, i) => {
      const empresa = ['Muntania', 'Baobabnature', 'Kannak'][i];
      if (r.status === 'fulfilled') return r.value;
      console.error(`Error en scraper ${empresa}:`, r.reason);
      send('progress', { source: empresa, status: 'error', error: r.reason?.message || String(r.reason) });
      return [];
    });
    send('done', trips);
  } catch (err) {
    console.error(err);
    send('error', { message: err.message });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
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

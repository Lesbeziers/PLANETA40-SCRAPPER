const { chromium } = require('playwright');

const BASE = 'https://www.kannak.es';
const CATALOG_URL = `${BASE}/es-es/search-result`;

const MAX_TRIPS = parseInt(process.env.KANNAK_MAX_TRIPS || '20', 10);
const CONCURRENCY = parseInt(process.env.KANNAK_CONCURRENCY || '2', 10);
const PAGE_TIMEOUT = 60000;

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

async function getTripUrls(browser, progress) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  // Block only images/media/fonts — Angular often needs CSS to render
  await ctx.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font'].includes(type)) return route.abort();
    return route.continue();
  });
  const page = await ctx.newPage();
  try {
    progress({ source: 'Kannak', status: 'discovering' });
    await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    // Wait until at least a handful of trip links exist
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/travel/"]').length >= 5,
      { timeout: PAGE_TIMEOUT }
    ).catch(() => {});
    await page.waitForTimeout(2500);
    const hrefs = await page.$$eval('a[href*="/travel/"]', els =>
      els.map(a => a.getAttribute('href')).filter(h => h && h.includes('/travel/'))
    );
    const unique = [...new Set(hrefs.map(h => h.split('?')[0]).filter(h => !/\/travel\/?$/.test(h)))];
    console.log(`[Kannak] Catalogo: ${unique.length} URLs encontradas`);
    return unique.map(h => h.startsWith('http') ? h : BASE + h);
  } finally {
    await ctx.close();
  }
}

async function scrapeTripPage(browser, url) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });
  await ctx.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font'].includes(type)) return route.abort();
    return route.continue();
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await page.waitForSelector('h1', { timeout: PAGE_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const text = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
      };
      const allText = document.body.innerText || '';
      const titulo = text('h1') || text('h2') || document.title.split('-')[0].trim();
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                     document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

      const precioMatch = allText.match(/desde\s*([\d.,]+)\s*€/i) || allText.match(/([\d.,]+)\s*€/);
      const precioDesde = precioMatch ? precioMatch[1].replace(/\./g, '').replace(/,/g, '.') : '';

      const duracionMatch = allText.match(/(\d+)\s*d[ií]as?\s*\/\s*(\d+)\s*noches?/i) || allText.match(/(\d+)\s*d[ií]as?/i);
      const duracion = duracionMatch ? duracionMatch[1] : '';

      const allHeaders = [...document.querySelectorAll('h2, h3, h4')].map(h => h.textContent.trim()).filter(Boolean);
      const itinerario = allHeaders.filter(h => /^d[ií]a\s*\d+/i.test(h)).join(' | ').slice(0, 2500);

      return { titulo, ogImage, ogDesc, precioDesde, duracion, itinerario, allText: allText.slice(0, 5000) };
    });

    const destinoMatch = data.titulo.match(/(?:de\s+|a\s+|en\s+|por\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/);
    let destino = '';
    const paises = ['Japón', 'China', 'Corea', 'Tailandia', 'Vietnam', 'Camboya', 'Laos', 'Singapur', 'India', 'Filipinas', 'Indonesia', 'Bali', 'Marruecos', 'Egipto', 'Jordania', 'Turquía', 'Uzbekistán', 'Italia', 'Francia', 'Alemania', 'Austria', 'Suiza', 'Bélgica', 'Holanda', 'Países Bajos', 'Luxemburgo', 'Reino Unido', 'Inglaterra', 'Escocia', 'Irlanda', 'Dinamarca', 'Noruega', 'Suecia', 'Finlandia', 'Islandia', 'Polonia', 'República Checa', 'Hungría', 'Rumania', 'Bulgaria', 'Grecia', 'Croacia', 'Eslovenia', 'Bosnia', 'Albania', 'Macedonia', 'Portugal', 'Azores', 'España', 'EEUU', 'Canadá', 'México', 'Perú', 'Chile', 'Argentina', 'Brasil', 'Cuba'];
    const tituloLower = data.titulo.toLowerCase();
    for (const p of paises) {
      if (tituloLower.includes(p.toLowerCase())) { destino = p; break; }
    }

    return {
      empresa: 'Kannak',
      titulo: data.titulo,
      url,
      destino,
      precioDesde: data.precioDesde,
      precioHasta: '',
      duracion: data.duracion,
      salidas: 'Consultar calendario (fechas variables)',
      tipoViaje: 'Circuito',
      dificultad: '',
      tamanoGrupo: '',
      descripcion: data.ogDesc,
      itinerario: data.itinerario,
      incluye: '',
      noIncluye: '',
      alojamiento: '',
      transporte: '',
      guia: '',
      idioma: 'Español',
      categorias: '',
      imagen: data.ogImage,
      estado: '',
    };
  } finally {
    await ctx.close();
  }
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        console.warn(`[Kannak] Error en ${items[idx]}:`, err.message);
        results[idx] = null;
      }
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

async function scrapeKannak(onProgress) {
  const progress = onProgress || (() => {});
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const allUrls = await getTripUrls(browser, progress);
    const urls = allUrls.slice(0, MAX_TRIPS);
    progress({ source: 'Kannak', status: 'scraping', total: urls.length, done: 0 });

    let done = 0;
    const trips = await runWithConcurrency(urls, async (url) => {
      const trip = await scrapeTripPage(browser, url);
      done++;
      progress({ source: 'Kannak', status: 'scraping', total: urls.length, done });
      return trip;
    }, CONCURRENCY);

    progress({ source: 'Kannak', status: 'done', total: trips.length });
    return trips;
  } catch (err) {
    console.error('[Kannak] Error:', err.message);
    progress({ source: 'Kannak', status: 'error', error: err.message });
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { scrapeKannak };

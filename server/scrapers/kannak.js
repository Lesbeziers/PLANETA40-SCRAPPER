const { chromium } = require('playwright');

const BASE = 'https://www.kannak.es';
const CATALOG_URL = `${BASE}/es-es/search-result`;
const PAGE_TIMEOUT = 60000;

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

async function acceptCookies(page) {
  const selectors = [
    'button:has-text("Aceptar todo")',
    'button:has-text("Aceptar todas")',
    'button:has-text("Aceptar")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("Estoy de acuerdo")',
    'button:has-text("De acuerdo")',
    '#didomi-notice-agree-button',
    '[data-testid="uc-accept-all-button"]',
    '#onetrust-accept-btn-handler',
    '[aria-label*="ceptar" i]',
  ];
  for (const sel of selectors) {
    try {
      const btn = await page.waitForSelector(sel, { timeout: 2500, state: 'visible' });
      if (btn) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        console.log(`[Kannak] Cookies aceptadas: ${sel}`);
        await page.waitForTimeout(1500);
        return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

async function scrapeKannak(onProgress) {
  const progress = onProgress || (() => {});
  let browser;
  try {
    progress({ source: 'Kannak', status: 'discovering' });
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
      ],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'es-ES',
    });
    await ctx.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font'].includes(type)) return route.abort();
      return route.continue();
    });
    const page = await ctx.newPage();
    await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await acceptCookies(page);

    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/travel/"]').length >= 5,
      { timeout: PAGE_TIMEOUT }
    ).catch(() => {});

    // Scroll para forzar lazy-load
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise(r => setTimeout(r, 300));
      }
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 500));
    });
    await page.waitForTimeout(1500);

    // Extraer datos de las tarjetas del catálogo
    const trips = await page.evaluate((BASE) => {
      const cards = document.querySelectorAll('a[href*="/travel/"]');
      const seen = new Set();
      const results = [];
      cards.forEach(a => {
        const href = a.getAttribute('href');
        if (!href || !href.includes('/travel/')) return;
        const cleanHref = href.split('?')[0];
        if (/\/travel\/?$/.test(cleanHref)) return;
        if (seen.has(cleanHref)) return;
        seen.add(cleanHref);

        // Buscar la tarjeta padre para extraer más info
        let container = a;
        for (let i = 0; i < 5; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          if (container.tagName === 'ARTICLE' || container.className?.includes?.('card') || container.className?.includes?.('travel')) break;
        }

        const text = (sel) => {
          const el = container.querySelector(sel);
          return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
        };

        const titulo = text('h1, h2, h3, h4, [class*="title"], [class*="Title"]') || (a.textContent || '').replace(/\s+/g, ' ').trim();
        const containerText = container.textContent || '';
        const precioMatch = containerText.match(/desde\s*([\d.]+)\s*€/i) || containerText.match(/([\d.]+)\s*€/);
        const precioDesde = precioMatch ? precioMatch[1].replace(/\./g, '') : '';
        const duracionMatch = containerText.match(/(\d+)\s*d[ií]as?\s*\/\s*(\d+)\s*noches?/i) || containerText.match(/(\d+)\s*d[ií]as?/i);
        const duracion = duracionMatch ? duracionMatch[1] : '';
        const img = container.querySelector('img');
        const imagen = img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '';

        results.push({
          empresa: 'Kannak',
          titulo,
          url: cleanHref.startsWith('http') ? cleanHref : (BASE + cleanHref),
          precioDesde,
          duracion,
          imagen,
        });
      });
      return results;
    }, BASE);

    console.log(`[Kannak] Catalogo: ${trips.length} viajes extraidos`);

    // Enriquecer con destino (detectado del título)
    const paises = ['Japón', 'China', 'Corea', 'Tailandia', 'Vietnam', 'Camboya', 'Laos', 'Singapur', 'India', 'Filipinas', 'Indonesia', 'Bali', 'Marruecos', 'Egipto', 'Jordania', 'Turquía', 'Uzbekistán', 'Italia', 'Francia', 'Alemania', 'Austria', 'Suiza', 'Bélgica', 'Holanda', 'Países Bajos', 'Luxemburgo', 'Reino Unido', 'Inglaterra', 'Escocia', 'Irlanda', 'Dinamarca', 'Noruega', 'Suecia', 'Finlandia', 'Islandia', 'Polonia', 'República Checa', 'Hungría', 'Rumania', 'Bulgaria', 'Grecia', 'Croacia', 'Eslovenia', 'Bosnia', 'Albania', 'Macedonia', 'Portugal', 'Azores', 'España', 'EEUU', 'Canadá', 'México', 'Perú', 'Chile', 'Argentina', 'Brasil', 'Cuba'];

    const enriched = trips.map(t => {
      const tituloLower = (t.titulo || '').toLowerCase();
      let destino = '';
      for (const p of paises) {
        if (tituloLower.includes(p.toLowerCase())) { destino = p; break; }
      }
      return {
        empresa: 'Kannak',
        titulo: t.titulo,
        url: t.url,
        destino,
        precioDesde: t.precioDesde,
        precioHasta: '',
        duracion: t.duracion,
        salidas: 'Consultar calendario (fechas variables)',
        tipoViaje: 'Circuito',
        dificultad: '',
        tamanoGrupo: '',
        descripcion: '',
        itinerario: '',
        incluye: '',
        noIncluye: '',
        alojamiento: '',
        transporte: '',
        guia: '',
        idioma: 'Español',
        categorias: '',
        imagen: t.imagen,
        estado: '',
      };
    });

    progress({ source: 'Kannak', status: 'done', total: enriched.length });
    return enriched;
  } catch (err) {
    console.error('[Kannak] Error:', err.message);
    progress({ source: 'Kannak', status: 'error', error: err.message });
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { scrapeKannak };

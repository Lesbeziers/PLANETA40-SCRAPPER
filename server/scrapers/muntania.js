const cheerio = require('cheerio');

const BASE = 'https://muntania.com';
const CATALOG_URL = `${BASE}/viaje/?estado=all`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const MAX_PAGES = parseInt(process.env.MUNTANIA_MAX_PAGES || '10', 10);
const CONCURRENCY = parseInt(process.env.MUNTANIA_CONCURRENCY || '6', 10);

async function fetchHTML(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.text();
}

async function getTripUrls() {
  const urls = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? CATALOG_URL : `${BASE}/viaje/page/${page}/?estado=all`;
    try {
      const html = await fetchHTML(url);
      const matches = html.match(/href="(https:\/\/muntania\.com)?\/viaje\/[^"#?\/]+\/"/g) || [];
      for (const m of matches) {
        const path = m.match(/\/viaje\/[^"#?\/]+\//)[0];
        if (path === '/viaje/') continue;
        urls.add(BASE + path);
      }
    } catch (err) {
      console.warn(`[Muntania] Error en página ${page}:`, err.message);
      break;
    }
  }
  return [...urls];
}

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

function parseTrip(html, url) {
  const $ = cheerio.load(html);

  const titulo = cleanText($('h1.h1-ficha-viaje').first().text()) || cleanText($('title').text().split(' - ')[0]);

  const precioRaw = cleanText($('.price-detailed').first().text());
  const precioMatch = precioRaw.match(/([\d.,]+)\s*€/);
  const precioDesde = precioMatch ? precioMatch[1].replace(/\./g, '').replace(/,/g, '.') : '';

  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const descripcion = cleanText(
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') || ''
  );

  const meta = {};
  $('.item-service-line').each((_, el) => {
    const label = cleanText($(el).find('h2').text()).toLowerCase();
    const value = cleanText($(el).find('p').text().replace(/⤤\s*Ver tabla/i, ''));
    if (label && value) meta[label] = value;
  });

  const lugarRaw = meta['lugar'] || '';
  const destino = cleanText(lugarRaw.split(',').map(s => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '));

  const duracionRaw = meta['duración'] || '';
  const duracionMatch = duracionRaw.match(/(\d+)/);
  const duracion = duracionMatch ? duracionMatch[1] : '';

  const nivelRaw = meta['nivel'] || '';
  const dificultad = nivelRaw ? `Nivel ${nivelRaw.replace(/[^A-D]/g, '')}` : '';

  const epoca = meta['época del año'] || '';

  const salidasArr = [];
  $('#select-salidas option').each((_, el) => {
    const t = cleanText($(el).text());
    if (t && !/selecciona/i.test(t)) salidasArr.push(t);
  });
  if (salidasArr.length === 0) {
    $('ul.ficha-listado-salidas li').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && !/más información/i.test(t) && !/propón/i.test(t) && !/^salidas/i.test(t)) {
        salidasArr.push(t);
      }
    });
  }
  const salidas = salidasArr.join(' | ');

  const categorias = [];
  $('.cat-item a').each((_, el) => {
    const t = cleanText($(el).text());
    if (t) categorias.push(t);
  });

  const findSection = (titleRegex, maxChars = 1200) => {
    let out = '';
    $('strong, b, h2, h3, h4').each((_, el) => {
      const t = cleanText($(el).text());
      if (titleRegex.test(t)) {
        const collected = [];
        let node = $(el).parent();
        for (let i = 0; i < 8; i++) {
          node = node.next();
          if (!node.length) break;
          const txt = cleanText(node.text());
          if (!txt) continue;
          if (/^(alojamiento|alimentaci|visado|tarjeta|telef|seguro|servicio de rescate|otras|transporte|incluye|no incluye|itinerario|programa)/i.test(txt) && txt.length < 60) break;
          collected.push(txt);
          if (collected.join(' ').length > maxChars) break;
        }
        out = collected.join(' ').slice(0, maxChars);
        return false;
      }
    });
    return out;
  };

  const incluye = findSection(/^\s*incluye\s*$/i) || findSection(/qué\s*incluye/i);
  const noIncluye = findSection(/no\s*incluye/i);
  const itinerario = cleanText($('#tab-faq, .tab-faq, [id*="programa"]').first().text()).slice(0, 2500);
  const alojamiento = findSection(/^\s*alojamiento\s*$/i);
  const transporte = findSection(/^\s*transporte\s*$/i);

  const estadoEl = $('.info-travel-status, .estado-viaje').first().text();
  const estado = cleanText(estadoEl);

  return {
    empresa: 'Muntania',
    titulo,
    url,
    destino,
    precioDesde,
    precioHasta: '',
    duracion,
    salidas,
    tipoViaje: categorias[0] || '',
    dificultad,
    tamanoGrupo: '',
    descripcion,
    itinerario,
    incluye,
    noIncluye,
    alojamiento,
    transporte,
    guia: '',
    idioma: '',
    categorias: [epoca, ...categorias].filter(Boolean).join(', '),
    imagen: ogImage,
    estado,
  };
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await worker(items[idx]);
      } catch (err) {
        console.warn(`[Muntania] Error en ${items[idx]}:`, err.message);
        results[idx] = null;
      }
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

async function scrapeMuntania() {
  console.log('[Muntania] Obteniendo lista de viajes...');
  const urls = await getTripUrls();
  console.log(`[Muntania] ${urls.length} viajes encontrados, scrapeando...`);
  const trips = await runWithConcurrency(urls, async (url) => {
    const html = await fetchHTML(url);
    return parseTrip(html, url);
  }, CONCURRENCY);
  console.log(`[Muntania] ${trips.length} viajes extraídos.`);
  return trips;
}

module.exports = { scrapeMuntania };

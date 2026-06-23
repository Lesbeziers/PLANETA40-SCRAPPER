const cheerio = require('cheerio');

const BASE = 'https://muntania.com';
const CATALOG_URL = `${BASE}/viaje/?estado=all`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const MAX_PAGES = parseInt(process.env.MUNTANIA_MAX_PAGES || '2', 10);
const CONCURRENCY = 4;

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
  const precioDesde = precioMatch ? precioMatch[1].replace(/\./g, '').replace(',', '.') : '';

  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const descripcion = cleanText($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '');

  const bodyText = $('body').text();
  const duracionMatch = bodyText.match(/(\d+)\s*d[ií]as/i);
  const duracion = duracionMatch ? duracionMatch[1] : '';

  const nivelMatch = bodyText.match(/Nivel\s+([A-D])/);
  const dificultad = nivelMatch ? `Nivel ${nivelMatch[1]}` : '';

  const salidasArr = [];
  $('#select-salidas option').each((_, el) => {
    const t = cleanText($(el).text());
    if (t && !/selecciona/i.test(t)) salidasArr.push(t);
  });
  $('ul.ficha-listado-salidas li').each((_, el) => {
    const t = cleanText($(el).text());
    if (t && !/más información/i.test(t) && !/propón/i.test(t)) salidasArr.push(t);
  });
  const salidas = [...new Set(salidasArr)].join(' | ');

  const categorias = [];
  $('.cat-item a').each((_, el) => {
    const t = cleanText($(el).text());
    if (t) categorias.push(t);
  });

  const sectionText = (titleRegex) => {
    let out = '';
    $('h2, h3, h4, strong').each((_, el) => {
      const t = cleanText($(el).text());
      if (titleRegex.test(t)) {
        let n = $(el).parent();
        let collected = '';
        let next = n.next();
        let safety = 0;
        while (next.length && safety < 5) {
          collected += ' ' + cleanText(next.text());
          if (/^h[1-4]$/i.test(next[0].tagName)) break;
          next = next.next();
          safety++;
        }
        out = collected;
        return false;
      }
    });
    return cleanText(out).slice(0, 1500);
  };

  const incluye = sectionText(/incluye/i);
  const noIncluye = sectionText(/no\s*incluye/i);
  const itinerario = sectionText(/programa|itinerario/i);
  const alojamiento = sectionText(/alojamiento/i);
  const transporte = sectionText(/transporte/i);

  const tituloLower = titulo.toLowerCase();
  const paises = ['Kirguistán', 'Tanzania', 'Nepal', 'Marruecos', 'Noruega', 'Italia', 'Francia', 'España', 'Eslovenia', 'Bosnia', 'Portugal', 'Suiza', 'Canadá', 'EEUU', 'Estados Unidos'];
  let destino = '';
  for (const p of paises) {
    if (tituloLower.includes(p.toLowerCase())) { destino = p; break; }
  }

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
    categorias: categorias.join(', '),
    imagen: ogImage,
    estado: '',
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

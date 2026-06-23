const cheerio = require('cheerio');

const BASE = 'https://baobabnature.com';
const CATALOG_URL = `${BASE}/categoria-viaje/viajes-en-grupo/ver-todos/`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const MAX_PAGES = parseInt(process.env.BAOBAB_MAX_PAGES || '10', 10);
const CONCURRENCY = parseInt(process.env.BAOBAB_CONCURRENCY || '5', 10);

const CAT_TO_LABEL = {
  africa: 'África',
  asia: 'Asia',
  europa: 'Europa',
  america: 'América',
  'oriente-medio': 'Oriente Medio',
  'verano-2026': 'Verano 2026',
  'navidad-2026': 'Navidad 2026',
  'semana-santa-2025': 'Semana Santa',
  'festivos-y-puentes-2026': 'Festivos y puentes',
  'viajes-solidarios': 'Solidario',
  'viajes-en-grupo': 'Viaje en grupo',
};

const CONTINENT_TO_COUNTRY_HINT = {
  africa: 'África',
  asia: 'Asia',
  europa: 'Europa',
  america: 'América',
};

async function fetchHTML(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.text();
}

function cleanText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

async function getTripUrls() {
  const urls = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? CATALOG_URL : `${CATALOG_URL}page/${page}/`;
    try {
      const html = await fetchHTML(url);
      const matches = html.match(/href="(https:\/\/baobabnature\.com)?\/viaje-a\/[^"#?\/]+\/"/g) || [];
      const before = urls.size;
      for (const m of matches) {
        const path = m.match(/\/viaje-a\/[^"#?\/]+\//)[0];
        urls.add(BASE + path);
      }
      if (urls.size === before) break;
    } catch (err) {
      console.warn(`[Baobab] Error en página ${page}:`, err.message);
      break;
    }
  }
  return [...urls];
}

function extractCountry(title, categorias) {
  const tituloLower = title.toLowerCase();
  const paises = [
    'Tanzania', 'Kenia', 'Marruecos', 'Egipto', 'Senegal', 'Madagascar', 'Sudáfrica',
    'Nepal', 'Bali', 'Indonesia', 'Vietnam', 'Tailandia', 'Camboya', 'Laos', 'India', 'Sri Lanka', 'Japón', 'China', 'Filipinas', 'Mongolia',
    'Grecia', 'Italia', 'Portugal', 'Turquía', 'Croacia', 'Albania', 'Eslovenia', 'Islandia', 'Noruega', 'Estambul', 'Creta',
    'México', 'Perú', 'Colombia', 'Costa Rica', 'Ecuador', 'Cuba', 'Argentina', 'Chile', 'Brasil',
    'Jordania', 'Israel', 'Emiratos',
  ];
  for (const p of paises) {
    if (tituloLower.includes(p.toLowerCase())) return p;
  }
  const continentCat = categorias.find(c => CONTINENT_TO_COUNTRY_HINT[c]);
  return continentCat ? CONTINENT_TO_COUNTRY_HINT[continentCat] : '';
}

function parseTrip(html, url) {
  const $ = cheerio.load(html);

  const titulo = cleanText($('h1').first().text());
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const descripcionMeta = cleanText(
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') || ''
  );

  let descripcion = descripcionMeta;
  if (!descripcion) {
    $('.et_pb_text_inner p').each((_, el) => {
      const t = cleanText($(el).text());
      if (!descripcion && t.length > 80 && !/precio/i.test(t)) descripcion = t;
    });
  }

  const productEl = $('.product.type-product').first();
  const classList = (productEl.attr('class') || '').split(/\s+/);
  const categoriasRaw = classList
    .filter(c => c.startsWith('product_cat-'))
    .map(c => c.replace('product_cat-', ''))
    .filter(c => c !== 'ver-todos');
  const categoriasLabels = categoriasRaw.map(c => CAT_TO_LABEL[c] || c);
  const categorias = categoriasLabels.join(', ');

  let precioDesde = '';
  const bodyText = $('body').text();
  const precioMatch = bodyText.match(/(?:PRECIO[^:]*:|desde)\s*([\d.,]+)\s*€/i) || bodyText.match(/([\d.,]+)\s*€/);
  if (precioMatch) precioDesde = precioMatch[1].replace(/\./g, '').replace(/,/g, '.');

  let salidas = '';
  let duracion = '';
  let estadoModule = '';
  $('.et_pb_module_header span, .et_pb_module_header').each((_, el) => {
    const t = cleanText($(el).text());
    if (!t || t.length > 120) return;
    if (/d[ií]as?\s*(en\s*destino|en\s*total|de\s*viaje|y\s*\d+\s*noches?)?/i.test(t) && /\d/.test(t)) {
      const m = t.match(/(\d+)\s*d[ií]as?/i);
      if (m && !duracion) duracion = m[1];
    } else if (/^del\s+\d|del\s+\d+\s+de\s+\w+\s+al\s+\d+\s+de\s+\w+|\d+\s+de\s+\w+\s+al?\s+\d+\s+de\s+\w+/i.test(t)) {
      if (!salidas) salidas = t;
    } else if (!estadoModule && /^(disponible|agotad|últimas plazas|grupo confirmado|reserva)/i.test(t)) {
      estadoModule = t;
    }
  });
  if (!duracion) {
    const dMatch = bodyText.match(/(\d+)\s*d[ií]as\s*(?:en\s*destino|en\s*total|de\s*viaje)?/i);
    if (dMatch) duracion = dMatch[1];
  }

  const findToggleSection = (h2Regex, maxChars = 1500) => {
    let out = '';
    $('h2').each((_, el) => {
      const headerText = cleanText($(el).text());
      if (h2Regex.test(headerText)) {
        const section = $(el).closest('.et_pb_section, .et_pb_row, body');
        const toggles = section.find('.et_pb_toggle');
        const parts = [];
        toggles.each((__, toggle) => {
          const title = cleanText($(toggle).find('.et_pb_toggle_title').text());
          const content = cleanText($(toggle).find('.et_pb_toggle_content').text());
          if (title || content) parts.push(`${title}: ${content}`.slice(0, 250));
        });
        out = parts.join(' | ').slice(0, maxChars);
        return false;
      }
    });
    return out;
  };

  const incluye = findToggleSection(/precio\s+incluye/i);
  const noIncluye = findToggleSection(/precio\s+no\s+incluye/i);

  let itinerario = '';
  $('p').each((_, el) => {
    const t = cleanText($(el).text());
    if (/^d[ií]a\s+\d+/i.test(t)) itinerario += t + ' | ';
  });
  itinerario = itinerario.slice(0, 3000);

  let alojamiento = '';
  let transporte = '';
  $('.et_pb_toggle').each((_, el) => {
    const title = cleanText($(el).find('.et_pb_toggle_title').text()).toLowerCase();
    const content = cleanText($(el).find('.et_pb_toggle_content').text());
    if (!alojamiento && /alojamiento|hotel|hospedaje/i.test(title)) alojamiento = content.slice(0, 800);
    if (!transporte && /transporte|traslado|vuelo|chófer/i.test(title)) transporte = content.slice(0, 800);
  });

  const grupoMatch = bodyText.match(/(\d+\s*-\s*\d+\s*personas|grupos?\s+de\s+\d+|hasta\s+\d+\s+personas)/i);
  const tamanoGrupo = grupoMatch ? cleanText(grupoMatch[0]) : '';

  const idiomaMatch = bodyText.match(/(hispanohablante|en\s+español|gu[ií]a\s+local\s+\w+)/i);
  const idioma = idiomaMatch ? (/hispanohablante|español/i.test(idiomaMatch[0]) ? 'Español' : cleanText(idiomaMatch[0])) : '';

  const guiaMatch = bodyText.match(/gu[ií]a[s]?\s+local[^.]{0,80}/i);
  const guia = guiaMatch ? cleanText(guiaMatch[0]) : '';

  const estadoMatch = bodyText.match(/(plazas?\s+agotadas|grupo\s+confirmado|salida\s+confirmada|últimas\s+plazas)/i);
  const estado = estadoModule || (estadoMatch ? cleanText(estadoMatch[0]) : '');

  const destino = extractCountry(titulo, categoriasRaw);

  return {
    empresa: 'Baobabnature',
    titulo,
    url,
    destino,
    precioDesde,
    precioHasta: '',
    duracion,
    salidas,
    tipoViaje: categoriasLabels.find(l => /viaje\s+en\s+grupo|solidario/i.test(l)) || 'Viaje en grupo',
    dificultad: '',
    tamanoGrupo,
    descripcion,
    itinerario,
    incluye,
    noIncluye,
    alojamiento,
    transporte,
    guia,
    idioma,
    categorias,
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
        console.warn(`[Baobab] Error en ${items[idx]}:`, err.message);
        results[idx] = null;
      }
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

async function scrapeBaobab() {
  console.log('[Baobab] Obteniendo lista de viajes...');
  const urls = await getTripUrls();
  console.log(`[Baobab] ${urls.length} viajes encontrados, scrapeando...`);
  const trips = await runWithConcurrency(urls, async (url) => {
    const html = await fetchHTML(url);
    return parseTrip(html, url);
  }, CONCURRENCY);
  console.log(`[Baobab] ${trips.length} viajes extraídos.`);
  return trips;
}

module.exports = { scrapeBaobab };

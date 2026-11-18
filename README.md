# Planeta 40 — Buscador de viajes

Herramienta web para scrapear catálogos de **Muntania**, **Baobabnature** y **Kannak**, mostrar los viajes en una tabla con filtros, y exportar una selección a Excel.

Proyecto personal (no comercial) para automatizar una tarea de consulta recurrente.

## Enlaces

- **Repo**: https://github.com/Lesbeziers/PLANETA40-SCRAPPER
- **Web en producción**: https://planeta40-scrapper.onrender.com
- **Panel de Render**: https://dashboard.render.com (buscar servicio `PLANETA40-SCRAPPER`)

> ⚠️ El plan Free de Render duerme el servicio tras 15 min sin tráfico. Primer acceso tarda ~50s en despertar.

## Estructura

```
PROYECTO V0.1/
├── index.html              # Landing con tabla, botones y modal de URLs
├── assets/
│   ├── css/style.css       # Estilos (fuente Aperçu, azul #007dbf)
│   ├── js/app.js           # Lógica del front (polling, render, modal, export)
│   ├── fonts/              # Aperçu + Movistar (self-hosted)
│   └── img/
├── server/
│   ├── index.js            # Express: endpoints + estado de escaneo en memoria
│   ├── excel.js            # Generador del .xlsx a partir del array de viajes
│   └── scrapers/
│       ├── muntania.js     # HTML + Cheerio, paginación
│       ├── baobab.js       # HTML + Cheerio, paginación
│       └── kannak.js       # Playwright + Chromium (SPA, requiere JS)
└── package.json
```

## Arrancar en local

Requiere **Node.js 20+**.

```bash
npm install     # Instala deps + descarga Chromium para Playwright (~150 MB, solo la 1ª vez)
npm start
```

Abre http://localhost:3000.

### Si no tienes Node.js (y no tienes permisos de admin)

Descarga la versión portable en `~/.local/`:

```bash
curl -fsSL https://nodejs.org/dist/v20.18.1/node-v20.18.1-darwin-x64.tar.gz -o /tmp/node.tar.gz
mkdir -p ~/.local
tar -xzf /tmp/node.tar.gz -C ~/.local
echo 'export PATH="$HOME/.local/node-v20.18.1-darwin-x64/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

(En Apple Silicon usa `node-v20.18.1-darwin-arm64.tar.gz`).

## Flujo de uso

1. **Escanear catálogos** (botón azul izquierdo): escanea las tres empresas completas en background. Tarda unos minutos. Los resultados sobreviven a recargas.
2. **Escanear desde URL** (botón azul central): abre un modal para pegar URLs de listado/categoría (Baobab o Muntania). Los viajes encontrados se **añaden** a la tabla actual (dedup por URL). Estos resultados NO sobreviven a recarga.
3. Marca los viajes que te interesen con los checkboxes.
4. **Exportar selección a Excel**: descarga `.xlsx` con 22 columnas normalizadas.

## Despliegue

Render Web Service con auto-deploy desde `main`:

- Build command: `npm install`
- Start command: `npm start`
- Environment: Node
- Service ID: `srv-d8t66r6gvqtc73c4al2g`

Cada push a `main` dispara un redeploy automático (~2 min: install + descarga Chromium + start).

## Fuentes

El repo incluye los `.woff` de **Aperçu** y `.otf` de **Movistar Sans** en `assets/fonts/`. Son fuentes propietarias usadas por preferencia estética del autor. Repo público asumiendo riesgo bajo (proyecto personal, no comercial, uso derivado de contexto profesional).

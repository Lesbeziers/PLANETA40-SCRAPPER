# CLAUDE.md — Contexto para agentes Claude

Este fichero es específico para sesiones de Claude Code / Claude Agent SDK trabajando en este repo.

## Resumen rápido

**Qué es**: scraper + landing web que lee catálogos de tres agencias de viajes de aventura (Muntania, Baobabnature, Kannak), muestra resultados en tabla y exporta a Excel.

**Para quién**: proyecto personal del usuario. Un amigo suyo ("Edu") es el usuario final principal. No es comercial. No es crítico. No hay tests.

**Stack**:
- Backend: Node 20 + Express 4
- Scraping ligero: `cheerio` + `fetch` nativo (Muntania, Baobabnature)
- Scraping SPA: `playwright` + Chromium headless (Kannak)
- Front: vanilla JS, sin bundler ni framework
- Excel: `xlsx` (SheetJS)

## Arquitectura del escaneo

El servidor mantiene un objeto global `currentScan` en memoria con el estado del último escaneo (`running`, `done`, `error`) y los resultados. El front hace polling a `/api/scan/status` cada 2s.

Dos modos:

### Modo `full` — escaneo completo (`POST /api/scan/start`)
- Fase 1: Muntania + Baobab en paralelo (HTTP ligero).
- Fase 2: Kannak solo (Chromium es pesado en memoria — en Render free tier con 512 MB apenas cabe, por eso NO va en paralelo con los otros).
- Los resultados se guardan en `currentScan.trips` y el front los renderiza al detectar `status === 'done'`.
- Al recargar la página, el front re-hidrata estos resultados (el escaneo tarda ~5 min, no queremos perderlo).

### Modo `urls` — por URL concreta (`POST /api/scan/urls`)
- Body: `{ urls: ["https://baobabnature.com/categoria-viaje/...", ...] }`.
- Agrupa URLs por dominio, llama a `scrapeBaobabFromCatalogUrl` / `scrapeMuntaniaFromCatalogUrl` por grupo.
- Kannak NO está soportado por URL (es una SPA de catálogo único, no tiene sentido).
- Resultados se marcan con `mode: 'urls'` en `currentScan`.
- El front, al ver `mode === 'urls'`, hace MERGE con los `trips[]` que ya tiene en memoria (dedup por URL). No reemplaza.
- Estos resultados NO se re-hidratan al recargar (son efímeros por diseño).

## Peculiaridades por scraper

### Muntania (`server/scrapers/muntania.js`)
- URL de catálogo: `https://muntania.com/viaje/?estado=all`.
- Fichas en `/viaje/<slug>/`.
- Pagination: `/viaje/page/N/?estado=all`.
- Datos clave en `.item-service-line` (lugar, duración, nivel, época).
- Secciones de texto (incluye, no incluye, alojamiento, transporte) con `findSection()` que busca por heading cercano.

### Baobabnature (`server/scrapers/baobab.js`)
- URL de catálogo: `https://baobabnature.com/categoria-viaje/viajes-en-grupo/ver-todos/`.
- Fichas en `/viaje-a/<slug>/`.
- La ficha está construida con bloques Divi (`.et_pb_toggle`) que son desplegables. Cada toggle tiene `.et_pb_toggle_title` y `.et_pb_toggle_content`. Casi toda la info rica está ahí dentro.
- `guia` e `idioma`: extraídos del toggle "Guía local..." — IMPORTANTE: antes se usaba regex global y truncaba mal. Siempre buscar por toggle.
- `destino`: se extrae del título cruzando con una lista hardcodeada de países (`paises` array). Si aparece un destino nuevo, hay que añadirlo.
- `idioma`: por defecto "Español" si no hay otra indicación (Baobab es empresa española).

### Kannak (`server/scrapers/kannak.js`)
- Web de Kannak es una SPA (Angular). `fetch` no vale, hay que usar Playwright.
- Un único catálogo: `https://www.kannak.es/es-es/search-result`.
- Acepta banner de cookies con múltiples selectores de fallback.
- Scroll forzado para lazy-load.
- Solo extrae datos de las tarjetas del catálogo (título, URL, precio, duración, imagen). NO entra en cada ficha individual — los campos ricos (itinerario, incluye, etc.) van vacíos.
- Playwright config: bloquea imágenes/fonts/media para ahorrar RAM.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Sirve `index.html` (estático) |
| POST | `/api/scan/start` | Arranca escaneo completo en background |
| POST | `/api/scan/urls` | Arranca escaneo por URLs en background |
| GET | `/api/scan/status` | Estado + progreso + resultados (si `done`) |
| POST | `/api/export` | Genera Excel de un array de viajes (del body) |
| GET | `/api/scan` | **DEPRECATED** — endpoint síncrono antiguo, nadie lo usa, se puede borrar |

## Diseño visual

- Color de marca: `#007dbf` (azul Planeta 40).
- Fuente: **Aperçu** (Regular 400 + Black 900), self-hosted en `assets/fonts/`.
- Cabecera: título grande a la izquierda (Aperçu Black 33pt), logo a la derecha.
- Botones: Aperçu Black, mayúsculas, más finos que el default.
- Precios en la tabla: formato español `"1.390 €"` (en Excel sin formato para permitir cálculos).

## Flujo de deploy

GitHub → Render auto-deploy desde `main`:
1. Usuario hace commit + push a `main`.
2. Render detecta el commit, arranca build.
3. `npm install` descarga deps + Chromium.
4. `npm start` levanta Express en el puerto que indica `process.env.PORT`.
5. Render redirige la URL `planeta40-scrapper.onrender.com` al servicio.

Attribution esperada en commits (per Claude Code):
```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

## Cosas que podrían venir después (propuestas, no comprometidas)

- Enriquecer Kannak: visitar cada ficha individual para sacar itinerario/incluye/etc.
- Detección de destino más robusta en Baobab/Kannak (hoy lista hardcodeada).
- Paginación en escaneos por URL (hoy solo lee la primera página de la categoría).
- Soporte multi-usuario en el backend (hoy `currentScan` es global; solo un escaneo a la vez para toda la app).
- Borrar `/api/scan` deprecado.

## Gotchas / cosas a NO hacer

- **No arrancar la web con Live Server** (puerto 5500). Solo sirve estáticos y los `/api/*` dan 404/405. Siempre `npm start` y abrir `localhost:3000`.
- **No añadir `node_modules` ni fuentes extra al commit sin pensar**. Fuentes ya están ahí (asumido).
- **No romper el `postinstall`**: Playwright descarga Chromium en `postinstall`. Si cambias el flag `PLAYWRIGHT_BROWSERS_PATH=0`, el deploy en Render no encontrará el browser.
- **Al editar `server/scrapers/*.js`, probar con un scraping real** — no hay tests. Mínimo: `curl -X POST localhost:3000/api/scan/urls -d '{"urls":[...]}'` y revisar el output.

# Planeta 40 — Buscador de viajes

App web que escanea los catálogos de **Muntania**, **Baobabnature** y **Kannak**, muestra los viajes en una tabla, permite seleccionar los que interesen y descarga un Excel con los datos.

## Estructura

```
PROYECTO V0.1/
├── index.html              # Página principal
├── assets/
│   ├── css/style.css
│   ├── js/app.js
│   └── img/
├── server/
│   ├── index.js            # Servidor Express
│   ├── scrapers/           # Un scraper por empresa
│   └── excel.js            # Generador de Excel
└── package.json
```

## Arrancar en local

```bash
npm install
npm start
```

Abre http://localhost:3000

## Despliegue

Pensado para Render (free tier). Conectar el repo de GitHub y crear un Web Service con:

- Build command: `npm install`
- Start command: `npm start`

const XLSX = require('xlsx');

const COLUMNS = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'titulo', label: 'Título' },
  { key: 'url', label: 'URL' },
  { key: 'destino', label: 'Destino / País' },
  { key: 'precioDesde', label: 'Precio desde (€)' },
  { key: 'precioHasta', label: 'Precio hasta (€)' },
  { key: 'duracion', label: 'Duración (días)' },
  { key: 'salidas', label: 'Salidas' },
  { key: 'tipoViaje', label: 'Tipo de viaje' },
  { key: 'dificultad', label: 'Dificultad / Nivel' },
  { key: 'tamanoGrupo', label: 'Tamaño de grupo' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'itinerario', label: 'Itinerario' },
  { key: 'incluye', label: 'Qué incluye' },
  { key: 'noIncluye', label: 'Qué NO incluye' },
  { key: 'alojamiento', label: 'Alojamiento' },
  { key: 'transporte', label: 'Transporte' },
  { key: 'guia', label: 'Guía' },
  { key: 'idioma', label: 'Idioma' },
  { key: 'categorias', label: 'Categorías / Etiquetas' },
  { key: 'imagen', label: 'Imagen principal' },
  { key: 'estado', label: 'Estado / Plazas' },
];

function generateExcel(trips) {
  const rows = trips.map(t => {
    const row = {};
    for (const col of COLUMNS) row[col.label] = t[col.key] ?? '';
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS.map(c => c.label) });
  ws['!cols'] = COLUMNS.map(c => ({ wch: Math.max(c.label.length + 2, 18) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Viajes');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateExcel, COLUMNS };

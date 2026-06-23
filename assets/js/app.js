const btnScan = document.getElementById('btn-scan');
const btnExport = document.getElementById('btn-export');
const statusEl = document.getElementById('status');
const tbody = document.getElementById('trips-body');
const selectAll = document.getElementById('select-all');

let trips = [];

const SOURCES = ['Muntania', 'Baobabnature', 'Kannak'];

btnScan.addEventListener('click', () => {
  btnScan.disabled = true;
  tbody.innerHTML = '<tr class="empty"><td colspan="7">Buscando viajes...</td></tr>';

  const progressBySource = {};
  SOURCES.forEach(s => progressBySource[s] = { source: s, status: 'pending' });

  const renderProgress = () => {
    const rows = SOURCES.map((source) => {
      const p = progressBySource[source];
      let label = '';
      let pct = 0;
      let cls = 'pending';
      if (p.status === 'pending') { label = 'En espera'; cls = 'pending'; }
      else if (p.status === 'discovering') { label = 'Buscando lista…'; cls = 'active'; pct = 5; }
      else if (p.status === 'scraping') {
        label = `${p.done}/${p.total}`;
        pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        cls = 'active';
      } else if (p.status === 'done') { label = `${p.total} ✓`; pct = 100; cls = 'done'; }
      else if (p.status === 'error') { label = 'Error'; cls = 'error'; }
      else { label = p.status; cls = 'active'; }
      return `
        <div class="progress-row">
          <span class="progress-label">${source}</span>
          <span class="progress-bar"><span class="progress-fill ${cls}" style="width:${pct}%"></span></span>
          <span class="progress-value">${label}</span>
        </div>`;
    }).join('');
    statusEl.innerHTML = rows;
  };

  renderProgress();

  const es = new EventSource('/api/scan-stream');

  es.addEventListener('progress', (e) => {
    const p = JSON.parse(e.data);
    if (p.source && p.source !== 'Sistema') {
      progressBySource[p.source] = p;
      renderProgress();
    }
  });

  es.addEventListener('done', (e) => {
    trips = JSON.parse(e.data);
    renderTrips();
    statusEl.innerHTML = `<div class="scan-summary">${trips.length} viajes encontrados.</div>`;
    btnScan.disabled = false;
    es.close();
  });

  es.addEventListener('error', () => {
    statusEl.innerHTML = '<div class="scan-summary error">Error de conexión. Reintenta.</div>';
    btnScan.disabled = false;
    es.close();
  });
});

btnExport.addEventListener('click', async () => {
  const selected = trips.filter((_, i) => document.getElementById(`row-${i}`).checked);
  if (selected.length === 0) {
    statusEl.textContent = 'Selecciona al menos un viaje.';
    return;
  }
  btnExport.disabled = true;
  statusEl.textContent = 'Generando Excel...';

  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selected),
    });
    if (!res.ok) throw new Error('Error al generar Excel');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planeta40-viajes-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = `Excel descargado con ${selected.length} viajes.`;
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  } finally {
    btnExport.disabled = false;
  }
});

selectAll.addEventListener('change', () => {
  document.querySelectorAll('#trips-body input[type="checkbox"]').forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateExportButton();
});

function renderTrips() {
  if (trips.length === 0) {
    tbody.innerHTML = '<tr class="empty"><td colspan="7">No se encontraron viajes.</td></tr>';
    return;
  }
  tbody.innerHTML = trips.map((t, i) => `
    <tr>
      <td><input type="checkbox" id="row-${i}"></td>
      <td>${escape(t.empresa)}</td>
      <td><a href="${escape(t.url)}" target="_blank" rel="noopener">${escape(t.titulo)}</a></td>
      <td>${escape(t.destino)}</td>
      <td>${escape(t.precioDesde)}${t.precioHasta ? ' – ' + escape(t.precioHasta) : ''}</td>
      <td>${escape(t.duracion)}</td>
      <td>${escape(t.salidas)}</td>
    </tr>
  `).join('');

  document.querySelectorAll('#trips-body input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateExportButton);
  });
  updateExportButton();
}

function updateExportButton() {
  const anyChecked = !!document.querySelector('#trips-body input[type="checkbox"]:checked');
  btnExport.disabled = !anyChecked;
}

function escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

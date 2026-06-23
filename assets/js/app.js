const btnScan = document.getElementById('btn-scan');
const btnExport = document.getElementById('btn-export');
const statusEl = document.getElementById('status');
const tbody = document.getElementById('trips-body');
const selectAll = document.getElementById('select-all');

let trips = [];

btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  statusEl.textContent = 'Escaneando catálogos... esto puede tardar varios minutos.';
  tbody.innerHTML = '<tr class="empty"><td colspan="7">Cargando...</td></tr>';

  try {
    const res = await fetch('/api/scan');
    if (!res.ok) throw new Error('Error en el servidor: ' + res.status);
    trips = await res.json();
    renderTrips();
    statusEl.textContent = `${trips.length} viajes encontrados.`;
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    tbody.innerHTML = '<tr class="empty"><td colspan="7">No se pudo cargar.</td></tr>';
  } finally {
    btnScan.disabled = false;
  }
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

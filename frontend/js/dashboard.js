// ============================================================
// dashboard.js - Dashboard operativo MyG Express
// ============================================================

const DASHBOARD_REFRESH_MS = 45000;
const dashboardCharts = {
  donut: null,
  bar: null,
  line: null
};

document.addEventListener('DOMContentLoaded', async () => {
  API.Auth.requireAuth();
  API.ensureSuperadminSidebar();

  const user = API.getUser();
  hydrateUser(user);

  const poller = LiveUpdates.createVisibilityAwarePoller({
    intervalMs: DASHBOARD_REFRESH_MS,
    runImmediately: false,
    onTick: async () => {
      await cargarDashboard(true);
    }
  });

  await cargarDashboard(false);
  poller.start();

  document.querySelector('.btn-export')?.addEventListener('click', () => {
    exportarCSV('rutas_recientes.csv');
  });
});

function exportarCSV(filename) {
  const table = document.querySelector('table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tr'));
  const csv = rows
    .filter((row) => !row.querySelector('.empty-row'))
    .map((row) => {
      const cols = Array.from(row.querySelectorAll('td, th')).slice(0, -1);
      return cols.map((col) => `"${col.innerText.replace(/(\r\n|\n|\r)/gm, '').trim()}"`).join(',');
    });

  if (csv.length <= 1) return;

  const csvFile = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const downloadLink = document.createElement('a');
  downloadLink.download = filename;
  downloadLink.href = window.URL.createObjectURL(csvFile);
  downloadLink.hidden = true;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

function hydrateUser(user) {
  const nombre = user?.nombre || 'Usuario';
  const sede = user?.sede_nombre || '-';
  const rol = user?.rol || '-';
  const inicial = (nombre || 'U').charAt(0).toUpperCase();

  SharedUI.setText('user-nombre', nombre);
  SharedUI.setText('user-sede', sede);
  SharedUI.setText('user-rol', rol);
  SharedUI.setText('user-avatar', inicial);
  SharedUI.setText('dashboard-date-range', obtenerRangoSemana());

  document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
}

async function cargarDashboard(silencioso) {
  const tbody = document.getElementById('tabla-lotes-body');

  if (!silencioso && tbody) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Cargando...</td></tr>';
  }

  try {
    const data = await API.Lotes.listar();
    const lotes = data.data || [];

    renderStats(lotes);
    updateCharts(lotes);
    renderUltimosLotes(lotes);
  } catch (error) {
    console.error('Error al cargar dashboard:', error);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row error-row">Error al cargar rutas</td></tr>';
    }
  }
}

function getDashboardChartData(lotes) {
  let completados = 0;
  let pendientes = 0;
  let procesando = 0;
  let cancelados = 0;

  lotes.forEach((lote) => {
    const estado = String(lote.estado || '').toLowerCase();
    if (estado === 'completado') completados += 1;
    else if (estado === 'pendiente') pendientes += 1;
    else if (estado === 'procesando') procesando += 1;
    else if (estado === 'cancelado') cancelados += 1;
  });

  const activityMap = {};
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().slice(0, 10);
    activityMap[dateKey] = 0;
  }

  lotes.forEach((lote) => {
    const dateKey = lote.fecha?.slice(0, 10);
    if (dateKey && activityMap[dateKey] !== undefined) {
      activityMap[dateKey] += 1;
    }
  });

  return {
    summary: { completados, pendientes, procesando, cancelados },
    lineLabels: Object.keys(activityMap).map((date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`),
    lineData: Object.values(activityMap)
  };
}

function applyChartDefaults() {
  if (typeof Chart === 'undefined') return false;
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.color = '#9aada3';
  return true;
}

function updateCharts(lotes) {
  if (!applyChartDefaults()) return;

  const chartData = getDashboardChartData(lotes);
  ensureDonutChart(chartData.summary);
  ensureBarChart(chartData.summary);
  ensureLineChart(chartData.lineLabels, chartData.lineData);
}

function ensureDonutChart(summary) {
  const data = [summary.completados, summary.pendientes, summary.procesando];
  const canvas = document.getElementById('chartDonut');
  if (!canvas) return;

  if (!dashboardCharts.donut) {
    dashboardCharts.donut = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Completados', 'Pendientes', 'Procesando'],
        datasets: [{
          data,
          backgroundColor: ['#22c55e', '#eab308', '#3b82f6'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 20 }
          }
        }
      }
    });
    return;
  }

  dashboardCharts.donut.data.datasets[0].data = data;
  dashboardCharts.donut.update('none');
}

function ensureBarChart(summary) {
  const data = [summary.completados, summary.pendientes, summary.procesando, summary.cancelados];
  const canvas = document.getElementById('chartBar');
  if (!canvas) return;

  if (!dashboardCharts.bar) {
    dashboardCharts.bar = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Completado', 'Pendiente', 'Procesando', 'Cancelado'],
        datasets: [{
          data,
          backgroundColor: ['#22c55e', '#eab308', '#3b82f6', '#ef4444'],
          borderRadius: 6,
          barThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f3f4f6' }, border: { display: false } },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
    return;
  }

  dashboardCharts.bar.data.datasets[0].data = data;
  dashboardCharts.bar.update('none');
}

function ensureLineChart(labels, data) {
  const canvas = document.getElementById('chartLine');
  if (!canvas) return;

  if (!dashboardCharts.line) {
    dashboardCharts.line = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#16a34a',
          pointBorderWidth: 2,
          pointRadius: 4,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f3f4f6' }, border: { display: false }, ticks: { stepSize: 1 } },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
    return;
  }

  dashboardCharts.line.data.labels = labels;
  dashboardCharts.line.data.datasets[0].data = data;
  dashboardCharts.line.update('none');
}

function renderStats(lotes) {
  const hoy = new Date().toISOString().slice(0, 10);
  const totalLotes = lotes.length;
  const lotesHoy = lotes.filter((lote) => lote.fecha?.slice(0, 10) === hoy).length;
  const totalPaquetes = lotes.reduce((acc, lote) => acc + (lote.total_registros || 0), 0);
  const activos = lotes.filter((lote) => ['pendiente', 'procesando'].includes(String(lote.estado || '').toLowerCase())).length;

  SharedUI.setText('stat-total-lotes', totalLotes);
  SharedUI.setText('stat-lotes-hoy', lotesHoy);
  SharedUI.setText('stat-total-paquetes', totalPaquetes);
  SharedUI.setText('stat-activos', activos);
}

function renderUltimosLotes(lotes) {
  const tbody = document.getElementById('tabla-lotes-body');
  if (!tbody) return;

  const recientes = lotes.slice(0, 8);
  if (!recientes.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No hay rutas registradas aun</td></tr>';
    return;
  }

  tbody.innerHTML = recientes.map((lote, index) => {
    const visualId = index + 1;
    const estado = String(lote.estado || '').toLowerCase();
    const estadoClase = ['completado', 'procesando', 'pendiente', 'cancelado'].includes(estado) ? estado : 'pendiente';
    const progreso = estado === 'completado'
      ? 100
      : estado === 'procesando'
        ? 50
        : estado === 'cancelado'
          ? 100
          : 0;

    return `
      <tr>
        <td><span class="lote-id">${visualId}</span></td>
        <td class="lote-name">${SharedUI.escapeHtml(lote.nombre_lote || '-')}</td>
        <td><span class="badge-origen">${SharedUI.escapeHtml(lote.origen || '-')}</span></td>
        <td>${formatFecha(lote.fecha)}</td>
        <td><span class="paquetes-count">${lote.total_registros || 0}</span></td>
        <td><span class="estado-badge estado-${estadoClase}">${SharedUI.escapeHtml(lote.estado || '-')}</span></td>
        <td>
          <div class="progreso-wrap">
            <div class="progreso-text">${progreso}%</div>
            <div class="progreso-bar">
              <div class="progreso-fill progreso-${progreso} progreso-${estadoClase}"></div>
            </div>
          </div>
        </td>
        <td>
          <a href="${API.Routes.loteDetalle(lote.id, lote.nombre_lote || lote.origen || `lote-${lote.id}`)}" class="btn-ver" title="Ver detalle">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function formatFecha(fecha) {
  if (!fecha) return '-';
  const date = new Date(fecha);
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function obtenerRangoSemana() {
  const hoy = new Date();
  const dia = hoy.getDay();
  const ajusteInicio = dia === 0 ? -6 : 1 - dia;
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() + ajusteInicio);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);

  const fmt = (date) => date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(inicio)} - ${fmt(fin)}`;
}

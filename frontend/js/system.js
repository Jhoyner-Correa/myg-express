document.addEventListener('DOMContentLoaded', async () => {
  API.Auth.requireSuperadmin();
  API.ensureSuperadminSidebar();

  bindBaseUi();
  hydrateUser();

  await cargarSistema();
});

function bindBaseUi() {
  document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
  document.getElementById('btn-refresh-system')?.addEventListener('click', cargarSistema);
}

function hydrateUser() {
  const user = API.getUser();
  document.getElementById('user-nombre').textContent = user?.nombre || 'Superadmin';
  document.getElementById('user-sede').textContent = 'Monitoreo tecnico';
  document.getElementById('user-avatar').textContent = (user?.nombre || 'S').charAt(0).toUpperCase();
}

async function cargarSistema() {
  setLoadingState();

  try {
    const response = await API.System.whatsappHealth();
    renderSystem(response);
  } catch (error) {
    renderError(error);
  }
}

function setLoadingState() {
  setText('hero-timestamp', 'Cargando...');
  setText('hero-last-cleanup', 'Cargando...');
  setText('hero-cleanup-status', 'Cargando...');
  setText('cleanup-status', 'Cargando...');
  setText('cleanup-status-copy', 'Consultando al worker...');
  setText('cleanup-error-box', '');
}

function renderSystem(response) {
  const queue = response?.queue || {};
  const cleanup = response?.cleanup || {};
  const retention = cleanup.retentionDays || {};

  const statusLabel = formatCleanupStatus(cleanup.lastStatus);
  const warning = queue.warning || 'Ninguno';

  setText('hero-timestamp', formatDateTime(response.timestamp));
  setText('hero-last-cleanup', formatDateTime(cleanup.lastRunAt));
  setText('hero-cleanup-status', statusLabel);

  setText('retention-jobs', formatDays(retention.jobs));
  setText('retention-logs', formatDays(retention.logs));
  setText('retention-sessions', formatDays(retention.sessions));

  setText('queue-pending', queue.pending ?? 0);
  setText('queue-processing', queue.processing ?? 0);
  setText('cleanup-jobs-removed', cleanup.jobsRemoved ?? 0);
  setText('cleanup-logs-removed', cleanup.logsRemoved ?? 0);
  setText('cleanup-sessions-removed', cleanup.sessionsRemoved ?? 0);

  setText('cleanup-status', statusLabel);
  setText('cleanup-status-copy', buildCleanupCopy(cleanup));
  setText('cleanup-last-run', formatDateTime(cleanup.lastRunAt));
  setText('cleanup-interval', formatInterval(cleanup.intervalMs));
  setText('worker-busy', yesNo(queue.busy));
  setText('queue-warning', warning);
  setText('worker-uptime', formatUptime(response.uptime));
  setText('cleanup-enabled', yesNo(cleanup.enabled));

  setChip('worker-status-chip', response.status === 'ok' ? 'OK' : String(response.status || 'Desconocido'), response.status === 'ok' ? 'status-ok' : 'status-error');
  setChip('queue-processing-chip', queue.processing > 0 ? 'Procesando' : 'Libre', queue.processing > 0 ? 'status-running' : 'status-idle');
  setText('cleanup-error-box', cleanup.lastError ? `Ultimo error: ${cleanup.lastError}` : 'Sin errores reportados en la ultima limpieza.');
}

function renderError(error) {
  const message = error?.serviceUnavailable
    ? 'El worker de WhatsApp no esta disponible. La API principal sigue operativa.'
    : (error?.message || 'No se pudo consultar el panel tecnico.');

  setText('hero-timestamp', 'Sin conexion');
  setText('hero-last-cleanup', '-');
  setText('hero-cleanup-status', 'Error');
  setText('cleanup-status', 'Error');
  setText('cleanup-status-copy', 'El worker no devolvio informacion valida.');
  setText('cleanup-error-box', message);
  setChip('worker-status-chip', 'Error', 'status-error');
  setChip('queue-processing-chip', '-', 'status-idle');
}

function buildCleanupCopy(cleanup) {
  if (cleanup.lastStatus === 'running') return 'La limpieza esta corriendo en este momento.';
  if (cleanup.lastStatus === 'error') return 'La ultima limpieza fallo. Revisa el detalle tecnico abajo.';
  if (cleanup.lastStatus === 'ok') return 'La ultima limpieza termino correctamente.';
  return 'Todavia no hay una corrida registrada.';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null || value === '' ? '-' : String(value);
}

function setChip(id, label, className) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = label;
  el.className = `status-chip ${className}`;
}

function formatCleanupStatus(status) {
  switch (status) {
    case 'ok': return 'Correcta';
    case 'running': return 'Ejecutando';
    case 'error': return 'Con error';
    case 'idle': return 'En espera';
    default: return 'Desconocido';
  }
}

function formatDateTime(value) {
  if (!value) return 'Nunca';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalida';

  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDays(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value)} dias`;
}

function formatInterval(ms) {
  const value = Number(ms);
  if (!value || Number.isNaN(value)) return '-';

  const hours = value / 3600000;
  if (hours >= 1 && Number.isInteger(hours)) return `${hours} hora${hours === 1 ? '' : 's'}`;

  const minutes = value / 60000;
  if (minutes >= 1 && Number.isInteger(minutes)) return `${minutes} min`;

  return `${Math.round(value / 1000)} seg`;
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function yesNo(value) {
  return value ? 'Si' : 'No';
}

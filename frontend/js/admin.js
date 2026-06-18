const state = {
  sedes: [],
  usuarios: [],
  urbanoCredenciales: []
};

const ROLES = {
  SYSADMIN: 'SysAdmin',
  ADMIN_EMPRESA: 'AdminEmpresa',
  ENCARGADO_OFICINA: 'EncargadoOficina'
};

const ROLE_LABELS = {
  [ROLES.SYSADMIN]: 'Administrador del Sistema',
  [ROLES.ADMIN_EMPRESA]: 'Administrador General',
  [ROLES.ENCARGADO_OFICINA]: 'Encargado de Oficina'
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!API.Auth.requireSuperadmin()) return;
  API.ensureSuperadminSidebar();

  bindBaseUi();
  hydrateUser();
  bindModalActions();
  bindForms();

  await cargarTodo();
});

function bindBaseUi() {
  document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
  document.getElementById('btn-refresh-sedes')?.addEventListener('click', cargarSedes);
  document.getElementById('btn-refresh-users')?.addEventListener('click', cargarUsuarios);
  document.getElementById('btn-refresh-urbano')?.addEventListener('click', cargarCredencialesUrbano);
  document.getElementById('btn-open-sede-modal')?.addEventListener('click', () => openSedeModal());
  document.getElementById('btn-open-user-modal')?.addEventListener('click', () => openUserModal());
  document.getElementById('btn-open-urbano-modal')?.addEventListener('click', () => openUrbanoModal());
  document.getElementById('btn-open-profile-modal')?.addEventListener('click', openProfileModal);
}

function bindModalActions() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal(overlay.id);
    });
  });
}

function bindForms() {
  document.getElementById('sede-form')?.addEventListener('submit', guardarSede);
  document.getElementById('user-form')?.addEventListener('submit', guardarUsuario);
  document.getElementById('urbano-form')?.addEventListener('submit', guardarCredencialUrbano);
  document.getElementById('profile-form')?.addEventListener('submit', guardarPerfil);
  document.getElementById('user-form-rol')?.addEventListener('change', syncUserRoleFields);
}

function hydrateUser() {
  const user = API.getUser();
  const name = user?.nombre || 'Administrador';
  const nombreEl = document.getElementById('user-nombre');
  const sedeEl = document.getElementById('user-sede');
  const avatarEl = document.getElementById('user-avatar');
  if (nombreEl) nombreEl.textContent = name;
  if (sedeEl) sedeEl.textContent = 'Administracion central';
  if (avatarEl) avatarEl.setAttribute('title', name);
  const tAvatar = document.getElementById('topbar-avatar');
  const tName = document.getElementById('topbar-name');
  if (tAvatar) tAvatar.setAttribute('title', name);
  if (tName) tName.textContent = name;
}

async function cargarTodo() {
  await Promise.all([cargarResumen(), cargarSedes(), cargarUsuarios(), cargarCredencialesUrbano()]);
}

async function cargarResumen() {
  try {
    const response = await API.Admin.overview();
    const resumen = response.data?.resumen || {};

    setText('stat-total-sedes', resumen.total_sedes || 0);
    setText('stat-total-usuarios', resumen.total_usuarios || 0);
    setText('stat-total-lotes', resumen.total_lotes || 0);
    setText('stat-lotes-activos', resumen.lotes_activos || 0);
    setText('stat-sedes-activas-chip', `${resumen.sedes_activas || 0} activas`);

    updateSystemMetrics(resumen);

  } catch (error) {
  }
}

async function cargarSedes() {
  const tbody = document.getElementById('sedes-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Actualizando sedes...</td></tr>';

  try {
    const response = await API.Admin.listarSedes();
    state.sedes = response.data || [];
    renderSedes();
    syncSedeSelect();
    syncUrbanoSedeSelect();
  } catch (error) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">No se pudieron cargar las sedes</td></tr>';
  }
}

async function cargarUsuarios() {
  const tbody = document.getElementById('users-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Actualizando usuarios...</td></tr>';

  try {
    const response = await API.Admin.listarUsuarios();
    state.usuarios = response.data || [];
    renderUsuarios();
  } catch (error) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">No se pudieron cargar los usuarios</td></tr>';
  }
}

async function cargarCredencialesUrbano() {
  const tbody = document.getElementById('urbano-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty">Actualizando accesos Urbano...</td></tr>';

  try {
    const response = await API.Admin.listarCredencialesUrbano();
    state.urbanoCredenciales = response.data || [];
    renderCredencialesUrbano();
    syncUrbanoSedeSelect();
  } catch (error) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty">No se pudieron cargar los accesos Urbano</td></tr>';
  }
}

function renderSedes() {
  const tbody = document.getElementById('sedes-body');
  if (!tbody) return;

  if (!state.sedes.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay sedes registradas</td></tr>';
    return;
  }

  tbody.innerHTML = state.sedes.map((sede) => `
    <tr>
      <td>
        <strong>${escapeHtml(sede.nombre)}</strong><br>
        <span class="td-muted">${escapeHtml(sede.direccion || 'Sin dirección')}</span>
      </td>
      <td>${renderEstadoChip(sede.estado)}</td>
      <td>${sede.total_usuarios || 0}</td>
      <td>${sede.total_sesiones || 0}</td>
      <td>${sede.total_lotes || 0}</td>
      <td>${sede.destinatarios || 0}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon edit" data-edit-sede="${sede.id}" title="Editar">
            <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="btn-icon delete" data-delete-sede="${sede.id}" title="Eliminar">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-sede]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sede = state.sedes.find((item) => String(item.id) === btn.getAttribute('data-edit-sede'));
      openSedeModal(sede);
    });
  });

  tbody.querySelectorAll('[data-delete-sede]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sede = state.sedes.find((item) => String(item.id) === btn.getAttribute('data-delete-sede'));
      if (!sede) return;
      const ok = await showConfirm({
        title: 'Eliminar sede',
        message: `Se eliminará la sede «${sede.nombre}» si no tiene usuarios, rutas ni sesiones. ¿Deseas continuar?`,
        confirmText: 'Eliminar sede'
      });
      if (!ok) return;
      try {
        await API.Admin.eliminarSede(sede.id);
        await cargarTodo();
      } catch (error) {
        await showAlert(error.message || 'No se pudo eliminar la sede');
      }
    });
  });
}

function renderUsuarios() {
  const tbody = document.getElementById('users-body');
  if (!tbody) return;

  if (!state.usuarios.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay usuarios operativos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = state.usuarios.map((user) => `
    <tr>
      <td><strong>${escapeHtml(user.nombre)}</strong></td>
      <td>${escapeHtml(user.usuario)}</td>
      <td>${escapeHtml(user.sede_nombre)}</td>
      <td>${renderRoleBadge(user)}</td>
      <td>${renderEstadoChip(user.estado)}</td>
      <td>${formatDate(user.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon edit" data-edit-user="${user.id}" title="Editar">
            <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="btn-icon delete" data-delete-user="${user.id}" title="Eliminar">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = state.usuarios.find((item) => String(item.id) === btn.getAttribute('data-edit-user'));
      openUserModal(user);
    });
  });

  tbody.querySelectorAll('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const user = state.usuarios.find((item) => String(item.id) === btn.getAttribute('data-delete-user'));
      if (!user) return;
      if (normalizeRole(user) === ROLES.SYSADMIN) {
        return;
      }
      const ok = await showConfirm({
        title: 'Eliminar usuario',
        message: `Se eliminará el usuario «${user.usuario}». ¿Deseas continuar?`,
        confirmText: 'Eliminar usuario'
      });
      if (!ok) return;
      try {
        await API.Admin.eliminarUsuario(user.id);
        await cargarTodo();
      } catch (error) {
        await showAlert(error.message || 'No se pudo eliminar el usuario');
      }
    });
  });
}

function renderCredencialesUrbano() {
  const tbody = document.getElementById('urbano-body');
  if (!tbody) return;

  if (!state.urbanoCredenciales.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          Aun no hay credenciales Urbano configuradas. Usa "Configurar acceso" para habilitar consultas por sede.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.urbanoCredenciales.map((credential) => `
    <tr>
      <td><strong>${escapeHtml(credential.sede_nombre)}</strong></td>
      <td>
        <span class="secure-cell">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${escapeHtml(credential.username)}
        </span>
      </td>
      <td>${renderEstadoChip(credential.estado)}</td>
      <td>${formatDateTime(credential.last_login_at)}</td>
      <td>${formatDateTime(credential.updated_at)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-icon edit" data-edit-urbano="${credential.sede_id}" title="Editar acceso Urbano">
            <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="btn-icon delete" data-delete-urbano="${credential.sede_id}" title="Eliminar acceso Urbano">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-urbano]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const credential = findUrbanoCredentialBySedeId(btn.getAttribute('data-edit-urbano'));
      openUrbanoModal(credential);
    });
  });

  tbody.querySelectorAll('[data-delete-urbano]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const credential = findUrbanoCredentialBySedeId(btn.getAttribute('data-delete-urbano'));
      if (!credential) return;

      const ok = await showConfirm({
        title: 'Eliminar acceso Urbano',
        message: `Se eliminara la configuracion de Urbano para la sede "${credential.sede_nombre}". La sede dejara de consultar rutas hasta configurar un nuevo acceso.`,
        confirmText: 'Eliminar acceso'
      });
      if (!ok) return;

      try {
        await API.Admin.eliminarCredencialUrbano(credential.sede_id);
        await cargarCredencialesUrbano();
      } catch (error) {
        await showAlert(error.message || 'No se pudo eliminar el acceso Urbano');
      }
    });
  });
}

function syncSedeSelect() {
  const select = document.getElementById('user-form-sede');
  if (!select) return;

  select.innerHTML = state.sedes.map((sede) => `
    <option value="${sede.id}">${escapeHtml(sede.nombre)}</option>
  `).join('');
  syncUserRoleFields();
}

function syncUrbanoSedeSelect() {
  const select = document.getElementById('urbano-form-sede');
  if (!select) return;

  if (!state.sedes.length) {
    select.innerHTML = '<option value="">Primero crea una sede</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = state.sedes.map((sede) => `
    <option value="${sede.id}">${escapeHtml(sede.nombre)}</option>
  `).join('');
}

function openSedeModal(sede = null) {
  resetFeedback('sede-feedback');
  document.getElementById('sede-form').reset();
  document.getElementById('sede-id').value = sede?.id || '';
  document.getElementById('sede-nombre').value = sede?.nombre || '';
  document.getElementById('sede-direccion').value = sede?.direccion || '';
  document.getElementById('sede-telefono').value = sede?.telefono || '';
  document.getElementById('sede-estado').value = sede?.estado || 'activo';
  document.getElementById('sede-modal-title').textContent = sede ? 'Editar sede' : 'Nueva sede';
  openModal('sede-modal');
}

function openUserModal(user = null) {
  resetFeedback('user-feedback');
  document.getElementById('user-form').reset();
  document.getElementById('user-form-id').value = user?.id || '';
  document.getElementById('user-form-nombre').value = user?.nombre || '';
  document.getElementById('user-form-usuario').value = user?.usuario || '';
  document.getElementById('user-form-rol').value = normalizeRole(user);
  document.getElementById('user-form-sede').value = user?.sede_id || state.sedes[0]?.id || '';
  document.getElementById('user-form-estado').value = user?.estado || 'activo';
  document.getElementById('user-form-password').value = '';
  document.getElementById('user-modal-title').textContent = user ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('user-form-password').placeholder = user ? 'Solo llena si deseas cambiarla' : 'Obligatoria al crear';
  syncUserRoleFields();
  openModal('user-modal');
}

function openUrbanoModal(credential = null) {
  resetFeedback('urbano-feedback');
  document.getElementById('urbano-form')?.reset();
  syncUrbanoSedeSelect();

  const sedeSelect = document.getElementById('urbano-form-sede');
  const usernameInput = document.getElementById('urbano-form-username');
  const passwordInput = document.getElementById('urbano-form-password');
  const estadoSelect = document.getElementById('urbano-form-estado');
  const title = document.getElementById('urbano-modal-title');

  if (sedeSelect) {
    sedeSelect.value = credential?.sede_id || state.sedes[0]?.id || '';
  }
  if (usernameInput) usernameInput.value = credential?.username || '';
  if (passwordInput) {
    passwordInput.value = '';
    passwordInput.placeholder = credential
      ? 'Dejar vacia para conservar la actual'
      : 'Obligatoria al crear';
  }
  if (estadoSelect) estadoSelect.value = credential?.estado || 'activo';
  if (title) title.textContent = credential ? 'Editar acceso Urbano' : 'Configurar acceso Urbano';

  openModal('urbano-modal');
}

function openProfileModal() {
  const user = API.getUser() || {};
  resetFeedback('profile-feedback');
  document.getElementById('profile-form')?.reset();
  document.getElementById('profile-nombre').value = user.nombre || '';
  document.getElementById('profile-usuario').value = user.usuario || '';
  document.getElementById('profile-password-actual').value = '';
  document.getElementById('profile-password-nueva').value = '';
  openModal('profile-modal');
}

async function guardarSede(event) {
  event.preventDefault();

  const id = document.getElementById('sede-id').value;
  const payload = {
    nombre: document.getElementById('sede-nombre').value.trim(),
    direccion: document.getElementById('sede-direccion').value.trim(),
    telefono: document.getElementById('sede-telefono').value.trim(),
    estado: document.getElementById('sede-estado').value
  };

  try {
    if (id) {
      await API.Admin.actualizarSede(id, payload);
      showFeedback('sede-feedback', 'success', 'Sede actualizada correctamente.');
    } else {
      await API.Admin.crearSede(payload);
      showFeedback('sede-feedback', 'success', 'Sede creada correctamente.');
    }

    await cargarTodo();
    setTimeout(() => closeModal('sede-modal'), 500);
  } catch (error) {
    showFeedback('sede-feedback', 'error', error.message || 'No se pudo guardar la sede');
  }
}

async function guardarUsuario(event) {
  event.preventDefault();

  const id = document.getElementById('user-form-id').value;
  const payload = {
    sede_id: Number(document.getElementById('user-form-sede').value),
    nombre: document.getElementById('user-form-nombre').value.trim(),
    usuario: document.getElementById('user-form-usuario').value.trim(),
    rol: document.getElementById('user-form-rol').value,
    estado: document.getElementById('user-form-estado').value,
    password: document.getElementById('user-form-password').value.trim()
  };

  if (!id && !payload.password) {
    showFeedback('user-feedback', 'error', 'La contraseña es obligatoria al crear un usuario.');
    return;
  }

  try {
    if (id) {
      await API.Admin.actualizarUsuario(id, payload);
      showFeedback('user-feedback', 'success', 'Usuario actualizado correctamente.');
    } else {
      await API.Admin.crearUsuario(payload);
      showFeedback('user-feedback', 'success', 'Usuario creado correctamente.');
    }

    await cargarTodo();
    setTimeout(() => closeModal('user-modal'), 500);
  } catch (error) {
    showFeedback('user-feedback', 'error', error.message || 'No se pudo guardar el usuario');
  }
}

async function guardarCredencialUrbano(event) {
  event.preventDefault();

  const sedeId = document.getElementById('urbano-form-sede')?.value;
  const payload = {
    username: document.getElementById('urbano-form-username')?.value.trim() || '',
    password: document.getElementById('urbano-form-password')?.value || '',
    estado: document.getElementById('urbano-form-estado')?.value || 'activo'
  };

  const existing = findUrbanoCredentialBySedeId(sedeId);
  if (!sedeId) {
    showFeedback('urbano-feedback', 'error', 'Selecciona una sede para configurar Urbano.');
    return;
  }
  if (!payload.username) {
    showFeedback('urbano-feedback', 'error', 'El usuario de Urbano es obligatorio.');
    return;
  }
  if (!existing && !payload.password) {
    showFeedback('urbano-feedback', 'error', 'La contrasena de Urbano es obligatoria al crear el acceso.');
    return;
  }

  try {
    await API.Admin.guardarCredencialUrbano(sedeId, payload);
    showFeedback('urbano-feedback', 'success', 'Acceso Urbano guardado correctamente.');
    await cargarCredencialesUrbano();
    setTimeout(() => closeModal('urbano-modal'), 550);
  } catch (error) {
    showFeedback('urbano-feedback', 'error', error.message || 'No se pudo guardar el acceso Urbano');
  }
}

async function guardarPerfil(event) {
  event.preventDefault();

  const payload = {
    nombre: document.getElementById('profile-nombre').value.trim(),
    usuario: document.getElementById('profile-usuario').value.trim(),
    password_actual: document.getElementById('profile-password-actual').value,
    nuevo_password: document.getElementById('profile-password-nueva').value
  };

  try {
    const response = await API.Auth.actualizarPerfil(payload);
    if (response.user) {
      localStorage.setItem('user', JSON.stringify(response.user));
      hydrateUser();
      const sidebarRole = document.getElementById('sidebar-role-label');
      if (sidebarRole) {
        sidebarRole.textContent = response.user.es_superadmin
          ? 'SysAdmin'
          : response.user.rol === ROLES.ADMIN_EMPRESA
            ? 'Administrador General'
            : 'Operador del Sistema';
      }
    }

    showFeedback('profile-feedback', 'success', 'Perfil actualizado correctamente.');
    setTimeout(() => closeModal('profile-modal'), 650);
  } catch (error) {
    showFeedback('profile-feedback', 'error', error.message || 'No se pudo actualizar el perfil');
  }
}

function renderEstadoChip(estado) {
  if (estado === 'activo') return '<span class="chip ok">Activo</span>';
  if (estado === 'inactivo') return '<span class="chip off">Inactivo</span>';
  return `<span class="chip warn">${escapeHtml(estado)}</span>`;
}

function normalizeRole(userOrRole) {
  if (!userOrRole) return ROLES.ENCARGADO_OFICINA;
  if (typeof userOrRole === 'object' && userOrRole.es_superadmin) return ROLES.SYSADMIN;

  const raw = typeof userOrRole === 'object'
    ? String(userOrRole.rol || '')
    : String(userOrRole || '');

  const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (compact === 'sysadmin' || compact.includes('sysadmin')) return ROLES.SYSADMIN;
  if (compact === 'adminempresa' || compact === 'admingeneral' || compact === 'administradorgeneral') {
    return ROLES.ADMIN_EMPRESA;
  }
  return ROLES.ENCARGADO_OFICINA;
}

function renderRoleBadge(user) {
  const role = normalizeRole(user);
  const label = user.rol_label || ROLE_LABELS[role] || 'Encargado de Oficina';
  const cls = role === ROLES.SYSADMIN
    ? 'sysadmin'
    : role === ROLES.ADMIN_EMPRESA
      ? 'manager'
      : 'operator';
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function syncUserRoleFields() {
  const roleSelect = document.getElementById('user-form-rol');
  const sedeSelect = document.getElementById('user-form-sede');
  const sedeHint = document.getElementById('user-form-sede-hint');
  if (!roleSelect || !sedeSelect) return;

  const role = roleSelect.value;
  const requiresSede = role === ROLES.ENCARGADO_OFICINA;

  roleSelect.disabled = false;
  sedeSelect.disabled = !requiresSede;
  sedeSelect.required = requiresSede;

  if (!requiresSede) {
    sedeSelect.value = '';
  } else if (!sedeSelect.value && state.sedes[0]) {
    sedeSelect.value = state.sedes[0].id;
  }

  if (sedeHint) {
    sedeHint.textContent = requiresSede
      ? 'Obligatoria para Encargado de Oficina.'
      : 'Este rol tiene alcance central y no pertenece a una sede.';
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function showFeedback(id, type, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `feedback show ${type}`;
  el.textContent = message;
}

function resetFeedback(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'feedback';
  el.textContent = '';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function findUrbanoCredentialBySedeId(sedeId) {
  return state.urbanoCredenciales.find((item) => String(item.sede_id) === String(sedeId));
}

function updateSystemMetrics(resumen) {
  const sesiones = resumen.total_sesiones || 0;
  const online = resumen.usuarios_conectados || resumen.total_usuarios || 0;
  setText('metric-sesiones', sesiones);
  setText('metric-online-users', online);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── CONFIRM / ALERT DIALOGS ── */
function showConfirm({ title, message, confirmText }) {
  return SharedUI.confirm({ title, message, confirmText, type: 'danger' });
}

function showAlert(message) {
  return SharedUI.alert({ title: 'Aviso', message, type: 'error' });
}

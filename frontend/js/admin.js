const state = {
  sedes: [],
  usuarios: []
};

document.addEventListener('DOMContentLoaded', async () => {
  API.Auth.requireSuperadmin();
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
  document.getElementById('btn-open-sede-modal')?.addEventListener('click', () => openSedeModal());
  document.getElementById('btn-open-user-modal')?.addEventListener('click', () => openUserModal());
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
}

function hydrateUser() {
  const user = API.getUser();
  document.getElementById('user-nombre').textContent = user?.nombre || 'Administrador';
  document.getElementById('user-sede').textContent = 'Administracion central';
  document.getElementById('user-avatar').textContent = (user?.nombre || 'A').charAt(0).toUpperCase();
}

async function cargarTodo() {
  await Promise.all([cargarResumen(), cargarSedes(), cargarUsuarios()]);
}

async function cargarResumen() {
  try {
    const response = await API.Admin.overview();
    const resumen = response.data?.resumen || {};
    const sedes = response.data?.sedes || [];

    setText('hero-sedes-activas', resumen.sedes_activas || 0);
    setText('hero-usuarios', resumen.total_usuarios || 0);
    setText('hero-destinatarios', resumen.total_destinatarios || 0);
    setText('stat-total-sedes', resumen.total_sedes || 0);
    setText('stat-total-usuarios', resumen.total_usuarios || 0);
    setText('stat-total-lotes', resumen.total_lotes || 0);
    setText('stat-lotes-activos', resumen.lotes_activos || 0);
    setText('stat-sedes-activas-chip', `${resumen.sedes_activas || 0} activas`);

    renderMiniSedes(sedes);
  } catch (error) {
    renderMiniSedes([]);
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

function renderMiniSedes(sedes) {
  const grid = document.getElementById('mini-sedes-grid');
  if (!grid) return;

  if (!sedes.length) {
    grid.innerHTML = '<div class="mini-card"><strong>Sin datos</strong><span>No hay sedes disponibles para mostrar el resumen.</span></div>';
    return;
  }

  grid.innerHTML = sedes.slice(0, 3).map((sede) => `
    <div class="mini-card">
      <strong>${escapeHtml(sede.nombre)}</strong>
      <span>${sede.total_usuarios || 0} usuarios · ${sede.total_lotes || 0} lotes · ${sede.destinatarios || 0} destinatarios</span>
    </div>
  `).join('');
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
        <span style="color:#8fa89e;font-size:.78rem">${escapeHtml(sede.direccion || 'Sin direccion')}</span>
      </td>
      <td>${renderEstadoChip(sede.estado)}</td>
      <td>${sede.total_usuarios || 0}</td>
      <td>${sede.total_sesiones || 0}</td>
      <td>${sede.total_lotes || 0}</td>
      <td>${sede.destinatarios || 0}</td>
      <td>
        <div class="row-actions">
          <button class="action-link" data-edit-sede="${sede.id}">Editar</button>
          <button class="action-link danger" data-delete-sede="${sede.id}">Eliminar</button>
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
      const ok = window.confirm(`Se eliminara la sede "${sede.nombre}" si no tiene usuarios, lotes ni sesiones. Deseas continuar?`);
      if (!ok) return;
      try {
        await API.Admin.eliminarSede(sede.id);
        await cargarTodo();
      } catch (error) {
        alert(error.message || 'No se pudo eliminar la sede');
      }
    });
  });
}

function renderUsuarios() {
  const tbody = document.getElementById('users-body');
  if (!tbody) return;

  if (!state.usuarios.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay usuarios registrados</td></tr>';
    return;
  }

  tbody.innerHTML = state.usuarios.map((user) => `
    <tr>
      <td><strong>${escapeHtml(user.nombre)}</strong></td>
      <td>${escapeHtml(user.usuario)}</td>
      <td>${escapeHtml(user.sede_nombre)}</td>
      <td>${user.es_superadmin ? '<span style="font-weight:700;color:var(--green-700);">Administrador de Sistemas (SysAdmin)</span>' : 'Encargado de Oficina'}</td>
      <td>${renderEstadoChip(user.estado)}</td>
      <td>${formatDate(user.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="action-link" data-edit-user="${user.id}">Editar</button>
          <button class="action-link danger" data-delete-user="${user.id}">Eliminar</button>
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
      const ok = window.confirm(`Se eliminara el usuario "${user.usuario}". Deseas continuar?`);
      if (!ok) return;
      try {
        await API.Admin.eliminarUsuario(user.id);
        await cargarTodo();
      } catch (error) {
        alert(error.message || 'No se pudo eliminar el usuario');
      }
    });
  });
}

function syncSedeSelect() {
  const select = document.getElementById('user-sede');
  if (!select) return;

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
  document.getElementById('user-id').value = user?.id || '';
  document.getElementById('user-nombre').value = user?.nombre || '';
  document.getElementById('user-usuario').value = user?.usuario || '';
  document.getElementById('user-sede').value = user?.sede_id || state.sedes[0]?.id || '';
  document.getElementById('user-estado').value = user?.estado || 'activo';
  document.getElementById('user-superadmin').checked = Boolean(user?.es_superadmin);
  document.getElementById('user-password').value = '';
  document.getElementById('user-modal-title').textContent = user ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('user-password').placeholder = user ? 'Solo llena si deseas cambiarla' : 'Obligatoria al crear';
  openModal('user-modal');
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

  const id = document.getElementById('user-id').value;
  const payload = {
    sede_id: Number(document.getElementById('user-sede').value),
    nombre: document.getElementById('user-nombre').value.trim(),
    usuario: document.getElementById('user-usuario').value.trim(),
    rol: 'admin',
    estado: document.getElementById('user-estado').value,
    es_superadmin: document.getElementById('user-superadmin').checked ? 1 : 0,
    password: document.getElementById('user-password').value.trim()
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

function renderEstadoChip(estado) {
  if (estado === 'activo') return '<span class="chip ok">Activo</span>';
  if (estado === 'inactivo') return '<span class="chip off">Inactivo</span>';
  return `<span class="chip warn">${escapeHtml(estado)}</span>`;
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

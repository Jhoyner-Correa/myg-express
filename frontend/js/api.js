// ============================================================
// api.js - Capa de comunicacion con el backend MyG Express
// Todos los fetch pasan por aqui. No cambiar endpoints.
// ============================================================

const API_BASE = window.__APP_CONFIG__?.apiBase || window.__API_BASE__ || '/api';
const WHATSAPP_API_BASE = window.__APP_CONFIG__?.whatsappApiBase || window.__WHATSAPP_API_BASE__ || API_BASE;
const DEBUG_HTTP = Boolean(window.__APP_CONFIG__?.debugApi);

const ROLE_PERMISSIONS = {
  SysAdmin: ['dashboard.ver', 'admin.panel.ver', 'sedes.gestionar', 'usuarios.gestionar', 'colas.ver'],
  AdminEmpresa: ['dashboard.ver'],
  EncargadoOficina: [
    'dashboard.ver',
    'rutas.ver',
    'rutas.gestionar',
    'avisos.ver',
    'avisos.gestionar',
    'entregas.ver',
    'entregas.gestionar',
    'plantillas.ver',
    'plantillas.gestionar',
    'whatsapp.ver',
    'whatsapp.gestionar',
    'urbano.rutas.ver',
    'urbano.rutas.gestionar'
  ]
};

const Routes = {
  login: '/login',
  dashboard: '/panel-de-control',
  admin: '/admin',
  rutas: '/rutas',
  lotes: '/rutas',
  gestionEntregas: '/gestion-entregas',
  whatsapp: '/whatsapp',
  consultaRutas: '/consulta-rutas',
  produccion: '/consulta-rutas',
  slugify(value, fallback = 'lote') {
    const normalized = String(value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || fallback;
  },
  loteDetalle(id, nombre) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return this.rutas;
    }

    const slug = this.slugify(nombre, `ruta-${numericId}`);
    return `/rutas/${numericId}-${slug}`;
  },
  extractLoteIdFromLocation(location = window.location) {
    const pathSegments = String(location.pathname || '')
      .split('/')
      .filter(Boolean);

    if ((pathSegments[0] === 'rutas' || pathSegments[0] === 'lotes') && pathSegments[1]) {
      const match = decodeURIComponent(pathSegments[1]).match(/^(\d+)/);
      if (match?.[1]) {
        return match[1];
      }
    }

    const params = new URLSearchParams(location.search || '');
    return params.get('id');
  }
};

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const raw = localStorage.getItem('user');
  try {
    const user = raw ? JSON.parse(raw) : null;
    if (user) {
      if (user.es_superadmin) {
        user.rol = 'SysAdmin';
        user.rol_label = 'Administrador del Sistema';
        user.sede_nombre = 'Administración Central';
      } else if (user.rol === 'AdminEmpresa') {
        user.rol_label = 'Administrador General';
        user.sede_nombre = user.sede_nombre || 'Administracion Central';
      } else {
        user.rol = 'EncargadoOficina';
        user.rol_label = 'Encargado de Oficina';
      }

      user.permisos = Array.isArray(user.permisos) && user.permisos.length
        ? user.permisos
        : getFallbackPermissions(user.rol);
    }
    return user;
  } catch {
    return null;
  }
}

function getFallbackPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.EncargadoOficina;
}

function getPermissions() {
  const user = getUser();
  const fallback = getFallbackPermissions(user?.rol);
  const stored = Array.isArray(user?.permisos) ? user.permisos : [];
  return Array.from(new Set([...fallback, ...stored]));
}

function hasPermission(permission) {
  return getPermissions().includes(permission);
}

function hasAnyPermission(permissions = []) {
  return permissions.some((permission) => hasPermission(permission));
}

function ensureSuperadminSidebar() {
  // No-op. The sidebar is now dynamically rendered by components/sidebar.js
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

function normalizeFetchError(error, serviceLabel = 'servicio') {
  const rawMessage = String(error?.message || error || '');
  const lowered = rawMessage.toLowerCase();
  const unavailable = lowered.includes('failed to fetch')
    || lowered.includes('load failed')
    || lowered.includes('networkerror')
    || lowered.includes('network request failed')
    || lowered.includes('err_connection_refused')
    || lowered.includes('fetch');

  if (unavailable) {
    return {
      status: 503,
      serviceUnavailable: true,
      message: `El ${serviceLabel} no esta disponible en este momento.`,
      raw: rawMessage
    };
  }

  return {
    status: error?.status || 500,
    serviceUnavailable: Boolean(error?.serviceUnavailable),
    message: error?.message || `Error inesperado en ${serviceLabel}.`,
    raw: rawMessage,
    data: error?.data
  };
}

async function fetchJson(url, options, serviceLabel) {
  try {
    const res = await fetch(url, options);
    return await handleResponse(res);
  } catch (error) {
    throw normalizeFetchError(error, serviceLabel);
  }
}

async function handleResponse(res) {
  const text = await res.text();

  if (DEBUG_HTTP) {
    console.log('[DEBUG HTTP] RESPUESTA CRUDA:', text);
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch (e) {
    throw {
      status: res.status,
      message: 'El servidor no devolvio JSON valido.',
      raw: text
    };
  }

  if (!res.ok) {
    // Auto-logout si el token expiró o es inválido (y no estamos intentando loguearnos)
    if (res.status === 401 && !res.url.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = Routes.login;
      return; // Detenemos la ejecución
    }

    throw {
      status: res.status,
      message: data.message || data.mensaje || 'Error desconocido',
      data
    };
  }

  return data;
}

// ------------------------------------------------------------
// AUTH
// POST /auth/login
// GET  /auth/perfil
// ------------------------------------------------------------

const Auth = {
  async login(usuario, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });
    return handleResponse(res);
  },

  async perfil() {
    const res = await fetch(`${API_BASE}/auth/perfil`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async actualizarPerfil(payload) {
    const res = await fetch(`${API_BASE}/auth/perfil`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res);
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = Routes.login;
  },

  isSuperadmin() {
    return !!getUser()?.es_superadmin;
  },

  isLoggedIn() {
    return !!getToken();
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = Routes.login;
      return false;
    }
    return true;
  },

  requireSuperadmin() {
    if (!this.requireAuth()) return false;
    if (!hasPermission('admin.panel.ver')) {
      window.location.href = Routes.dashboard;
      return false;
    }
    return true;
  },

  requirePermission(permission, redirectTo = Routes.dashboard) {
    if (!this.requireAuth()) return false;
    if (!hasPermission(permission)) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }
};

// ------------------------------------------------------------
// LOTES
// POST /lotes
// GET  /lotes
// GET  /lotes/:id
// ------------------------------------------------------------

const Lotes = {
  async crear(data) {
    const res = await fetch(`${API_BASE}/lotes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async listar() {
    const res = await fetch(`${API_BASE}/lotes`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async obtener(id) {
    const res = await fetch(`${API_BASE}/lotes/${id}`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async actualizar(id, nombre_lote) {
    const res = await fetch(`${API_BASE}/lotes/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ nombre_lote })
    });
    return handleResponse(res);
  },

  async habilitarEntregas(id) {
    const res = await fetch(`${API_BASE}/lotes/${id}/entregas`, {
      method: 'POST',
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async eliminar(id) {
    const res = await fetch(`${API_BASE}/lotes/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

// ------------------------------------------------------------
// AVISOS
// POST   /avisos
// GET    /avisos/lote/:loteId
// PATCH  /avisos/:id/estado
// DELETE /avisos/:id
// ------------------------------------------------------------

const Avisos = {
  async crear(data) {
    const res = await fetch(`${API_BASE}/avisos`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async listarPorLote(loteId) {
    const res = await fetch(`${API_BASE}/avisos/lote/${loteId}`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async eliminarPorLote(loteId) {
    const res = await fetch(`${API_BASE}/avisos/lote/${loteId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async importar(data) {
    const res = await fetch(`${API_BASE}/avisos/importar`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async actualizarEstado(id, estado_aviso) {
    const res = await fetch(`${API_BASE}/avisos/${id}/estado`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ estado_aviso })
    });
    return handleResponse(res);
  },

  async eliminar(id) {
    const res = await fetch(`${API_BASE}/avisos/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

// ------------------------------------------------------------
// ENTREGAS
// GET   /entregas
// PATCH /entregas/:id/recoger
// PATCH /entregas/:id/pendiente
// ------------------------------------------------------------

const Entregas = {
  async resumen() {
    const res = await fetch(`${API_BASE}/entregas/resumen`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async buscarClientes(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        query.set(key, String(value).trim());
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE}/entregas/clientes${suffix}`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async paquetesCliente(clientKey) {
    const res = await fetch(`${API_BASE}/entregas/clientes/${encodeURIComponent(clientKey)}/paquetes`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async buscar(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        query.set(key, String(value).trim());
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE}/entregas${suffix}`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async marcarRecogido(id, observacion) {
    const res = await fetch(`${API_BASE}/entregas/${id}/recoger`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ observacion })
    });
    return handleResponse(res);
  },

  async marcarPendiente(id) {
    const res = await fetch(`${API_BASE}/entregas/${id}/pendiente`, {
      method: 'PATCH',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

// ------------------------------------------------------------
// PLANTILLAS
// GET /plantillas
// ------------------------------------------------------------

const Plantillas = {
  async listar() {
    const res = await fetch(`${API_BASE}/plantillas`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async crear(data) {
    const res = await fetch(`${API_BASE}/plantillas`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async actualizar(id, data) {
    const res = await fetch(`${API_BASE}/plantillas/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async establecerDefault(plantilla_id) {
    const res = await fetch(`${API_BASE}/plantillas/default`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ plantilla_id })
    });
    return handleResponse(res);
  },

  async eliminar(id) {
    const res = await fetch(`${API_BASE}/plantillas/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

// ------------------------------------------------------------
// WHATSAPP SESIONES
// GET  /whatsapp-sesiones
// GET  /whatsapp-sesiones/auditoria/evolution
// GET  /whatsapp-sesiones/:id/status
// GET  /whatsapp-sesiones/:id/qr
// POST /whatsapp-sesiones/:id/init
// POST /whatsapp-sesiones/:id/reconnect
// POST /whatsapp-sesiones/:id/logout
// ------------------------------------------------------------

const WhatsAppSesiones = {
  async listar() {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones`, {
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async auditarEvolution() {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/auditoria/evolution`, {
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async crear(data) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    }, 'worker de WhatsApp');
  },

  async obtenerStatus(id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/${id}/status`, {
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async obtenerQr(id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/${id}/qr`, {
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async iniciar(id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/${id}/init`, {
      method: 'POST',
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async reconectar(id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/${id}/reconnect`, {
      method: 'POST',
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async cerrar(id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/${id}/logout`, {
      method: 'POST',
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async eliminar(id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp-sesiones/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    }, 'worker de WhatsApp');
  }
};

// ------------------------------------------------------------
// ENVIO DE LOTE
// POST /whatsapp/enviar-lote
// ------------------------------------------------------------

const WhatsAppEnvio = {
  async enviarLote(lote_id, whatsapp_sesion_id, plantilla_id, mensaje_personalizado) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp/enviar-lote`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        lote_id,
        whatsapp_sesion_id,
        plantilla_id,
        mensaje_personalizado
      })
    }, 'worker de WhatsApp');
  },

  async reanudarLote(loteId, whatsapp_sesion_id) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp/lotes/${loteId}/resume`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ whatsapp_sesion_id })
    }, 'worker de WhatsApp');
  },

  async pausarLote(loteId) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp/lotes/${loteId}/pause`, {
      method: 'POST',
      headers: authHeaders()
    }, 'worker de WhatsApp');
  },

  async marcarManual(loteId, payload = {}) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp/lotes/${loteId}/mark-manual`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    }, 'worker de WhatsApp');
  },

  async cancelarPendientes(loteId) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp/lotes/${loteId}/cancel-pending`, {
      method: 'POST',
      headers: authHeaders()
    }, 'worker de WhatsApp');
  }
};

const Produccion = {
  async status() {
    const res = await fetch(`${API_BASE}/produccion/status`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async consultarRuta(routeId) {
    const res = await fetch(`${API_BASE}/produccion/rutas/${encodeURIComponent(routeId)}`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async obtenerUltimaConsulta() {
    const res = await fetch(`${API_BASE}/produccion/cache/ultima`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async limpiarConsulta() {
    const res = await fetch(`${API_BASE}/produccion/cache`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

const Admin = {
  async overview() {
    const res = await fetch(`${API_BASE}/admin/overview`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async listarSedes() {
    const res = await fetch(`${API_BASE}/admin/sedes`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async crearSede(data) {
    const res = await fetch(`${API_BASE}/admin/sedes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async actualizarSede(id, data) {
    const res = await fetch(`${API_BASE}/admin/sedes/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async eliminarSede(id) {
    const res = await fetch(`${API_BASE}/admin/sedes/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async listarCredencialesUrbano() {
    const res = await fetch(`${API_BASE}/admin/urbano-credenciales`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async guardarCredencialUrbano(sedeId, data) {
    const res = await fetch(`${API_BASE}/admin/urbano-credenciales/${sedeId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async eliminarCredencialUrbano(sedeId) {
    const res = await fetch(`${API_BASE}/admin/urbano-credenciales/${sedeId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async listarUsuarios() {
    const res = await fetch(`${API_BASE}/admin/usuarios`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async crearUsuario(data) {
    const res = await fetch(`${API_BASE}/admin/usuarios`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async actualizarUsuario(id, data) {
    const res = await fetch(`${API_BASE}/admin/usuarios/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async eliminarUsuario(id) {
    const res = await fetch(`${API_BASE}/admin/usuarios/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

const Zonas = {
  async listar() {
    const res = await fetch(`${API_BASE}/zonas`, {
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async crear(nombre) {
    const res = await fetch(`${API_BASE}/zonas`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ nombre })
    });
    return handleResponse(res);
  },

  async eliminar(id) {
    const res = await fetch(`${API_BASE}/zonas/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return handleResponse(res);
  }
};

const Rutas = Lotes;
const ConsultaRutas = Produccion;

// ------------------------------------------------------------
// Exportar globalmente
// ------------------------------------------------------------
window.API = { Auth, Lotes, Rutas, Avisos, Entregas, Plantillas, WhatsAppSesiones, WhatsAppEnvio, Zonas, Produccion, ConsultaRutas, Admin, Routes, getUser, getPermissions, hasPermission, hasAnyPermission, ensureSuperadminSidebar };

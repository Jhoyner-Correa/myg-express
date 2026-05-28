// ============================================================
// api.js - Capa de comunicacion con el backend MyG Express
// Todos los fetch pasan por aqui. No cambiar endpoints.
// ============================================================

const API_BASE = window.__APP_CONFIG__?.apiBase || window.__API_BASE__ || '/api';
const WHATSAPP_API_BASE = window.__APP_CONFIG__?.whatsappApiBase || window.__WHATSAPP_API_BASE__ || API_BASE;
const DEBUG_HTTP = Boolean(window.__APP_CONFIG__?.debugApi) || localStorage.getItem('__debug_api__') === '1';

const Routes = {
  login: '/login',
  dashboard: '/panel-de-control',
  admin: '/admin',
  rutas: '/rutas',
  lotes: '/rutas',
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
        user.rol = 'Administrador de Sistemas (SysAdmin)';
        user.sede_nombre = 'Administración Central';
      } else {
        user.rol = 'Encargado de Oficina';
      }
    }
    return user;
  } catch {
    return null;
  }
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
    }
  },

  requireSuperadmin() {
    this.requireAuth();
    if (!this.isSuperadmin()) {
      window.location.href = Routes.dashboard;
    }
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

  async marcarManual(loteId) {
    return fetchJson(`${WHATSAPP_API_BASE}/whatsapp/lotes/${loteId}/mark-manual`, {
      method: 'POST',
      headers: authHeaders()
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

  async login(username, password) {
    const res = await fetch(`${API_BASE}/produccion/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...(username ? { username } : {}),
        ...(password ? { password } : {})
      })
    });
    return handleResponse(res);
  },

  async logout() {
    const res = await fetch(`${API_BASE}/produccion/logout`, {
      method: 'POST',
      headers: authHeaders()
    });
    return handleResponse(res);
  },

  async consultarRuta(routeId) {
    const res = await fetch(`${API_BASE}/produccion/rutas/${encodeURIComponent(routeId)}`, {
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

const Rutas = Lotes;
const ConsultaRutas = Produccion;

// ------------------------------------------------------------
// Exportar globalmente
// ------------------------------------------------------------
window.API = { Auth, Lotes, Rutas, Avisos, Plantillas, WhatsAppSesiones, WhatsAppEnvio, Produccion, ConsultaRutas, Admin, Routes, getUser, ensureSuperadminSidebar };

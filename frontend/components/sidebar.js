/**
 * sidebar.js — Componente compartido del sidebar.
 * Se inyecta automáticamente en cualquier página que tenga <div id="sidebar"></div>
 * El enlace activo se detecta por window.location.pathname.
 */
(function () {
  'use strict';

  const OP_ITEMS = [
    {
      href: '/panel-de-control',
      label: 'Dashboard',
      icon: `<rect x="3" y="3" width="7" height="7" rx="1"/>
             <rect x="14" y="3" width="7" height="7" rx="1"/>
             <rect x="3" y="14" width="7" height="7" rx="1"/>
             <rect x="14" y="14" width="7" height="7" rx="1"/>`
    },
    {
      href: '/rutas',
      label: 'Rutas',
      icon: `<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
             <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
             <line x1="12" y1="22.08" x2="12" y2="12"/>`
    },
    {
      href: '/whatsapp',
      label: 'WhatsApp',
      icon: `<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>`
    },
    {
      href: '/consulta-rutas',
      label: 'Consulta de rutas',
      icon: `<path d="M3 7h13v10H3z"/>
             <path d="M16 10h2l3 3v4h-5z"/>
             <circle cx="7.5" cy="18.5" r="1.5"/>
             <circle cx="17.5" cy="18.5" r="1.5"/>`
    }
  ];

  const SYS_ITEMS = [
    {
      href: '/admin',
      label: 'Panel central',
      icon: `<rect x="3" y="3" width="7" height="7" rx="1"/>
             <rect x="14" y="3" width="7" height="7" rx="1"/>
             <rect x="3" y="14" width="7" height="7" rx="1"/>
             <rect x="14" y="14" width="7" height="7" rx="1"/>`
    },
    {
      href: '/system',
      label: 'Sistema',
      icon: `<circle cx="12" cy="12" r="3"/>
             <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`
    }
  ];

  function getRawUser() {
    const raw = localStorage.getItem('user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function buildNavItems(user) {
    const path = window.location.pathname.replace(/\/$/, '');
    const items = user?.es_superadmin ? SYS_ITEMS : OP_ITEMS;
    return items.map(({ href, label, icon }) => {
      const isActive = path === href || path.startsWith(href + '/');
      return `
        <a href="${href}" class="nav-item${isActive ? ' active' : ''}">
          <svg viewBox="0 0 24 24">${icon}</svg>
          ${label}
        </a>`;
    }).join('');
  }

  function buildSidebar(user) {
    const sectionLabel = user?.es_superadmin ? 'Administración' : 'Principal';
    return `
      <aside class="sidebar" id="app-sidebar">
        <div class="sidebar-brand">
          <div class="brand-icon">
            <svg viewBox="0 0 24 24">
              <path d="M20 8H4a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2v-8a2 2 0 00-2-2zm-9 8H7v-2h4v2zm6-4H7v-2h10v2zM20 4H4L2 8h20l-2-4z"/>
            </svg>
          </div>
          <div class="brand-text">MyG <span>Express</span></div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-label">${sectionLabel}</div>
          ${buildNavItems(user)}
        </div>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-user">
          <div class="user-avatar" id="user-avatar">U</div>
          <div class="user-info">
            <div class="u-name" id="user-nombre">—</div>
            <div class="u-sede" id="user-sede">—</div>
          </div>
          <button id="btn-logout" title="Cerrar sesión">
            <svg viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>`;
  }

  function hydrateSidebar() {
    const tryHydrate = () => {
      if (typeof API === 'undefined' || typeof API.getUser !== 'function') return;

      const user = API.getUser();
      if (!user) return;

      const avatarEl   = document.getElementById('user-avatar');
      const nombreEl  = document.getElementById('user-nombre');
      const sedeEl    = document.getElementById('user-sede');
      const logoutBtn = document.getElementById('btn-logout');

      if (avatarEl)  avatarEl.textContent  = (user.nombre || 'U').charAt(0).toUpperCase();
      if (nombreEl)  nombreEl.textContent  = user.nombre || '—';
      if (sedeEl)    sedeEl.textContent    = user.es_superadmin ? 'Administración Central' : (user.sede_nombre || '—');
      if (logoutBtn) logoutBtn.addEventListener('click', () => API.Auth.logout());
    };

    tryHydrate();
    setTimeout(tryHydrate, 300);
  }

  function mount() {
    const container = document.getElementById('sidebar');
    if (!container) return;

    const user = getRawUser();
    container.outerHTML = buildSidebar(user);
    hydrateSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

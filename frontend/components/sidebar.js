/**
 * sidebar.js — Enterprise Modular Sidebar Component.
 * Fetches centralized sidebar.html and dynamically customizes it on the client side.
 */
(function () {
  'use strict';

  function getRawUser() {
    const raw = localStorage.getItem('user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function highlightActiveLink(container) {
    const currentPath = window.location.pathname.replace(/\/$/, '').toLowerCase();
    const links = container.querySelectorAll('.nav-item');

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;

      const normHref = href.replace(/\/$/, '').toLowerCase();
      
      // Matches exact path, starts with subpaths, .html extension, or dashboard alias
      const isActive = currentPath === normHref || 
                       currentPath.startsWith(normHref + '/') || 
                       currentPath === normHref + '.html' ||
                       (normHref === '/panel-de-control' && (currentPath === '/dashboard' || currentPath === '/dashboard.html'));

      if (isActive) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function filterSectionsByRole(container, user) {
    const sections = container.querySelectorAll('.sidebar-section');
    const isSysAdmin = user && (Boolean(user.es_superadmin) || user.rol === 'SysAdmin');

    sections.forEach(section => {
      const group = section.getAttribute('data-group');
      if (group === 'operations') {
        section.style.display = isSysAdmin ? 'none' : 'block';
      } else if (group === 'administration' || group === 'infrastructure') {
        section.style.display = isSysAdmin ? 'block' : 'none';
      }
    });
  }

  function hydrateUserProfile(container, user) {
    const avatarEl  = container.querySelector('#user-avatar');
    const nombreEl  = container.querySelector('#user-nombre');
    const sedeEl    = container.querySelector('#user-sede');
    const logoutBtn = container.querySelector('#btn-logout');

    if (!user) return;

    if (avatarEl) {
      avatarEl.textContent = (user.nombre || 'U').charAt(0).toUpperCase();
    }
    if (nombreEl) {
      nombreEl.textContent = user.nombre || '—';
    }
    if (sedeEl) {
      const isSysAdmin = Boolean(user.es_superadmin) || user.rol === 'SysAdmin';
      sedeEl.textContent = isSysAdmin ? 'Administración Central' : (user.sede_nombre || '—');
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof API !== 'undefined' && API.Auth && typeof API.Auth.logout === 'function') {
          API.Auth.logout();
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      });
    }
  }

  async function mount() {
    // Looks for container id="sidebar-container" (modern) or id="sidebar" (legacy)
    const container = document.getElementById('sidebar-container') || document.getElementById('sidebar');
    if (!container) return;

    try {
      // Fetch the centralized sidebar.html shell from root
      const response = await fetch('/components/sidebar.html');
      if (!response.ok) throw new Error('Error al cargar sidebar.html');
      
      const htmlText = await response.text();
      container.innerHTML = htmlText;

      const user = getRawUser();
      
      // Initialize dynamic behaviors
      filterSectionsByRole(container, user);
      highlightActiveLink(container);
      hydrateUserProfile(container, user);

      // Trigger safety retry just in case token-based API updates user late
      setTimeout(() => {
        const freshUser = getRawUser();
        hydrateUserProfile(container, freshUser);
      }, 300);

    } catch (error) {
      console.error('[SidebarComponent] Fail:', error);
      container.innerHTML = `<div style="padding: 20px; color: red;">Error cargando panel lateral.</div>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

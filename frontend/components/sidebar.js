(function () {
  'use strict';

  var COLLAPSE_STORAGE_KEY = 'myg_sidebar_collapsed';
  var ACCORDION_STORAGE_PREFIX = 'myg_sidebar_section_';
  var SIDEBAR_TEMPLATE_STORAGE_KEY = 'myg_sidebar_template_v4';
  var MOBILE_BREAKPOINT = 768;
  var ROLE_PERMISSIONS = {
    SysAdmin: ['admin.panel.ver', 'sedes.gestionar', 'usuarios.gestionar', 'colas.ver'],
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

  function getRawUser() {
    var raw = localStorage.getItem('user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getRoleLabel(user) {
    if (!user) return 'Perfil';

    var rawRole = String(user.rol || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (Boolean(user.es_superadmin) || rawRole === 'sysadmin' || rawRole.indexOf('sysadmin') >= 0) {
      return 'SysAdmin';
    }

    if (rawRole === 'adminempresa' || rawRole === 'admingeneral' || rawRole === 'administradorgeneral') {
      return 'Administrador General';
    }

    return 'Operador del Sistema';
  }

  function normalizeRole(user) {
    if (!user) return 'EncargadoOficina';

    var rawRole = String(user.rol || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (Boolean(user.es_superadmin) || rawRole === 'sysadmin' || rawRole.indexOf('sysadmin') >= 0) {
      return 'SysAdmin';
    }

    if (rawRole === 'adminempresa' || rawRole === 'admingeneral' || rawRole === 'administradorgeneral') {
      return 'AdminEmpresa';
    }

    return 'EncargadoOficina';
  }

  function getPermissions(user) {
    var basePermissions = ROLE_PERMISSIONS[normalizeRole(user)] || [];
    var storedPermissions = user && Array.isArray(user.permisos) ? user.permisos : [];
    return Array.from(new Set(basePermissions.concat(storedPermissions)));
  }

  function hasPermission(user, permission) {
    return getPermissions(user).indexOf(permission) >= 0;
  }

  function hasAnyPermission(user, permissions) {
    return permissions.some(function (permission) {
      return hasPermission(user, permission);
    });
  }

  function highlightActiveLink(container) {
    var currentPath = window.location.pathname.replace(/\/$/, '').toLowerCase();
    var links = container.querySelectorAll('.nav-item');

    container.querySelectorAll('.sidebar__section-header').forEach(function (header) {
      header.classList.remove('active');
    });

    links.forEach(function (link) {
      if (link.getAttribute('data-no-active') === 'true') {
        link.classList.remove('active');
        return;
      }

      var href = link.getAttribute('href');
      if (!href || href === '#') return;

      var normHref = href.replace(/\/$/, '').toLowerCase();
      var isActive =
        currentPath === normHref ||
        currentPath.startsWith(normHref + '/') ||
        currentPath === normHref + '.html' ||
        (normHref === '/panel-de-control' && (currentPath === '/dashboard' || currentPath === '/dashboard.html'));

      link.classList.toggle('active', isActive);

      if (isActive) {
        var parentBody = link.closest('.sidebar__section-body');
        if (parentBody) {
          parentBody.classList.remove('collapsed');
          var section = parentBody.closest('.sidebar__section');
          if (section) {
            var header = section.querySelector('.sidebar__section-header');
            if (header) {
              header.setAttribute('aria-expanded', 'true');
            }
          }
        }
      }
    });
  }

  function filterSectionsByRole(container, user) {
    var sections = container.querySelectorAll('.sidebar-section');

    sections.forEach(function (section) {
      var requiredAny = String(section.getAttribute('data-permission-any') || '')
        .split(',')
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
      var canShowSection = requiredAny.length ? hasAnyPermission(user, requiredAny) : true;

      section.querySelectorAll('[data-permission]').forEach(function (item) {
        var permission = item.getAttribute('data-permission');
        item.style.display = permission && hasPermission(user, permission) ? '' : 'none';
      });

      section.style.display = canShowSection ? 'flex' : 'none';
    });

    var sidebar = container.querySelector('.sidebar') || (container.classList.contains('sidebar') ? container : null);
    if (sidebar) {
      sidebar.setAttribute('data-sidebar-ready', 'true');
    }
  }

  function hydrateUserProfile(container, user) {
    var avatarEl = container.querySelector('#user-avatar');
    var nombreEl = container.querySelector('#user-nombre');
    var sedeEl = container.querySelector('#user-sede');
    var roleLabelEl = container.querySelector('#sidebar-role-label');
    var logoutBtn = container.querySelector('#btn-logout');

    if (roleLabelEl) {
      roleLabelEl.textContent = getRoleLabel(user);
      roleLabelEl.setAttribute('title', getRoleLabel(user));
    }

    if (user) {
      if (avatarEl) {
        avatarEl.setAttribute('title', user.nombre || 'Usuario');
        // Avatar institucional consistente: evita letras sueltas o iconos genéricos.
        avatarEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.25"/><circle cx="12" cy="9.55" r="2.35"/><path d="M7.8 16.65c.78-2.1 2.32-3.15 4.2-3.15s3.42 1.05 4.2 3.15"/></svg>';
      }
      if (nombreEl) nombreEl.textContent = user.nombre || 'LA MERCED';
      if (sedeEl) {
        var isSysAdmin = Boolean(user.es_superadmin) || user.rol === 'SysAdmin';
        sedeEl.textContent = isSysAdmin ? 'Administracion Central' : (user.sede_nombre || 'merced');
      }

      // Hydrate topbar user card elements if they exist
      var topbarNameEl = document.getElementById('topbar-name') || document.getElementById('topbar-user-name');
      var topbarAvatarEl = document.getElementById('topbar-avatar');
      var topbarRoleEl = document.getElementById('user-rol') || document.getElementById('topbar-user-rol');
      if (topbarNameEl) {
        topbarNameEl.textContent = user.nombre || 'Usuario';
      }
      if (topbarAvatarEl) {
        topbarAvatarEl.setAttribute('title', user.nombre || 'Usuario');
      }
      if (topbarRoleEl) {
        var currentText = topbarRoleEl.textContent || '';
        if (!currentText || currentText === '-' || currentText === '—' || currentText === 'Cargando...') {
          topbarRoleEl.textContent = user.rol || getRoleLabel(user);
        }
      }
    }

    if (logoutBtn && logoutBtn.dataset.sidebarBound !== 'true') {
      logoutBtn.dataset.sidebarBound = 'true';
      logoutBtn.addEventListener('click', function (e) {
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

  function setupCollapseToggle(sidebar) {
    var toggle = sidebar.querySelector('#sidebar-toggle');
    if (!toggle || toggle.dataset.sidebarBound === 'true') return;

    function applyCollapse(collapsed) {
      sidebar.classList.toggle('collapsed', collapsed);
      sidebar.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      document.documentElement.classList.toggle('sidebar-collapsed-preload', collapsed);
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? 'true' : 'false');

      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Colapsar menu');
      toggle.setAttribute('title', collapsed ? 'Expandir menu' : 'Colapsar menu');
    }

    toggle.dataset.sidebarBound = 'true';

    if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true') {
      applyCollapse(true);
    } else {
      applyCollapse(false);
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      applyCollapse(!sidebar.classList.contains('collapsed'));
    });
  }

  function setupMobileDrawer(sidebar) {
    if (sidebar.dataset.mobileDrawerBound === 'true') return;
    sidebar.dataset.mobileDrawerBound = 'true';

    var overlay = document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.id = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    function getMenuButton() {
      return document.querySelector('.mobile-menu-button');
    }

    function isMobile() {
      return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function isOpen() {
      return sidebar.classList.contains('mobile-open');
    }

    function setMenuExpanded(expanded) {
      var btn = getMenuButton();
      if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function openMobile() {
      if (!isMobile() || isOpen()) return;
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      setMenuExpanded(true);
    }

    function closeMobile() {
      if (!isOpen()) return;
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      setMenuExpanded(false);
    }

    function addHamburger() {
      var topbar = document.querySelector('.topbar');
      if (!topbar || topbar.querySelector('.mobile-menu-button')) return;

      var target = topbar.firstElementChild || topbar;
      var btn = document.createElement('button');
      btn.className = 'mobile-menu-button';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Abrir menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('title', 'Abrir menu');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';

      target.insertBefore(btn, target.firstChild);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openMobile();
      });
    }

    addHamburger();
    overlay.addEventListener('click', closeMobile);

    sidebar.querySelectorAll('.nav-item, a.sidebar__link, .sidebar__sub-link').forEach(function (link) {
      link.addEventListener('click', function () {
        if (isMobile()) closeMobile();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobile();
    });

    window.addEventListener('resize', function () {
      if (!isMobile()) closeMobile();
    });
  }

  function setupAccordion(container) {
    var headers = container.querySelectorAll('.sidebar__section-header');
    headers.forEach(function (header) {
      if (header.dataset.accordionBound === 'true') return;
      header.dataset.accordionBound = 'true';

      var body = header.nextElementSibling;
      if (!body || !body.classList.contains('sidebar__section-body')) return;

      var section = header.closest('.sidebar__section');

      // Única regla: abrir solo si la página actual es un sub-item activo.
      // Sin localStorage — así no queda "pegado" abierto en otras páginas.
      var hasActiveChild = Boolean(
        section && section.querySelector('.sidebar__sub-link.active, .nav-item.active:not([data-no-active="true"])')
      );

      // Aplicar estado SIN animación al iniciar (evita flash visual)
      body.style.transition = 'none';
      header.setAttribute('aria-expanded', hasActiveChild ? 'true' : 'false');
      body.classList.toggle('collapsed', !hasActiveChild);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          body.style.transition = '';
        });
      });

      // Click en el botón del acordeón: solo toggling local en esta página
      header.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var expanded     = header.getAttribute('aria-expanded') === 'true';
        var nextExpanded = !expanded;
        header.setAttribute('aria-expanded', String(nextExpanded));
        body.classList.toggle('collapsed', !nextExpanded);
      });
    });
  }

  function initializeSidebar(container) {
    document.body.classList.add('sidebar-hydrating');

    // Limpiar claves viejas del acordeón que pudieran quedar de versiones anteriores
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf(ACCORDION_STORAGE_PREFIX) === 0) {
        localStorage.removeItem(key);
      }
    });

    var user = getRawUser();
    filterSectionsByRole(container, user);
    highlightActiveLink(container);
    hydrateUserProfile(container, user);
    setupAccordion(container);

    var sidebar = container.querySelector('.sidebar') || (container.classList.contains('sidebar') ? container : null);
    if (sidebar) {
      setupCollapseToggle(sidebar);
      setupMobileDrawer(sidebar);
    }

    setTimeout(function () {
      hydrateUserProfile(container, getRawUser());
      document.body.classList.remove('sidebar-hydrating');
    }, 300);
  }

  async function mount() {
    var container = document.getElementById('sidebar-container') || document.getElementById('sidebar') || document.getElementById('app-sidebar');
    if (!container) return;

    var alreadyRendered = container.querySelector('.sidebar') || container.classList.contains('sidebar');
    if (alreadyRendered) {
      initializeSidebar(container);
      return;
    }

    var cachedTemplate = '';
    try {
      cachedTemplate = sessionStorage.getItem(SIDEBAR_TEMPLATE_STORAGE_KEY) || '';
    } catch (e) {
      cachedTemplate = '';
    }

    if (cachedTemplate) {
      container.innerHTML = cachedTemplate;
      initializeSidebar(container);
      return;
    }

    try {
      var response = await fetch('/components/sidebar.html', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Error al cargar sidebar.html');

      var template = await response.text();
      try {
        sessionStorage.setItem(SIDEBAR_TEMPLATE_STORAGE_KEY, template);
      } catch (e) {
        // Si el navegador bloquea sessionStorage, el sidebar igual funciona normal.
      }

      container.innerHTML = template;
      initializeSidebar(container);
    } catch (error) {
      console.error('[SidebarComponent] Fallback Fail:', error);
      container.innerHTML = '<div style="padding:20px;color:red;">Error cargando panel lateral.</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();

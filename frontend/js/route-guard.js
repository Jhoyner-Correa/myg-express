(function(){
  var path = window.location.pathname.replace(/\/$/, '') || '/';
  var required = null;
  var fallback = '/panel-de-control';

  if (path === '/admin') {
    required = 'admin.panel.ver';
    fallback = '/panel-de-control';
  } else if (path === '/panel-de-control' || path === '/dashboard') {
    required = 'dashboard.ver';
    fallback = '/admin';
  } else if (path === '/rutas' || path.indexOf('/rutas/') === 0) {
    required = 'rutas.ver';
    fallback = '/panel-de-control';
  } else if (path === '/gestion-entregas') {
    required = 'entregas.ver';
    fallback = '/panel-de-control';
  } else if (path === '/whatsapp') {
    required = 'whatsapp.ver';
    fallback = '/panel-de-control';
  } else if (path === '/consulta-rutas') {
    required = 'urbano.rutas.ver';
    fallback = '/panel-de-control';
  }

  if (!required) return;

  document.documentElement.classList.add('route-guard-pending');
  var style = document.createElement('style');
  style.textContent = '.route-guard-pending body{opacity:0!important}';
  document.head.appendChild(style);

  var rolePermissions = {
    SysAdmin: ['admin.panel.ver','sedes.gestionar','usuarios.gestionar','colas.ver'],
    AdminEmpresa: ['dashboard.ver'],
    EncargadoOficina: ['dashboard.ver','rutas.ver','rutas.gestionar','avisos.ver','avisos.gestionar','entregas.ver','entregas.gestionar','plantillas.ver','plantillas.gestionar','whatsapp.ver','whatsapp.gestionar','urbano.rutas.ver','urbano.rutas.gestionar']
  };

  function normalizeRole(user) {
    if (!user) return 'EncargadoOficina';
    var raw = String(user.rol || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (user.es_superadmin || raw === 'sysadmin' || raw.indexOf('sysadmin') >= 0) return 'SysAdmin';
    if (raw === 'adminempresa' || raw === 'admingeneral' || raw === 'administradorgeneral') return 'AdminEmpresa';
    return 'EncargadoOficina';
  }

  function getUser() {
    try {
      var raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  var token = localStorage.getItem('token');
  var user = getUser();

  if (!token || !user) {
    window.location.replace('/login');
    return;
  }

  var role = normalizeRole(user);
  var storedPermisos = Array.isArray(user.permisos) ? user.permisos : [];
  var permisos = storedPermisos.length ? storedPermisos : (rolePermissions[role] || []);

  if (permisos.indexOf(required) === -1) {
    if (fallback !== path) {
      window.location.replace(fallback);
      return;
    }
  }

  document.documentElement.classList.remove('route-guard-pending');
})();

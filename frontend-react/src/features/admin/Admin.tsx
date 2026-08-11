import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../core/api/apiClient';
import { useAuth } from '../../core/auth/authState';
import { showToast, showConfirm } from '../../core/utils/toast';

// ── Tipos exactos del backend ──
type SedeItem = {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  estado: 'activo' | 'inactivo';
  latitud: number | null;
  longitud: number | null;
  radio_permitido_metros: number | null;
  total_usuarios: number;
  total_sesiones: number;
  total_lotes: number;
  destinatarios: number;
};

type UserItem = {
  id: number;
  sede_id: number | null;
  nombre: string;
  usuario: string;
  rol: string;
  es_superadmin: boolean | number;
  estado: 'activo' | 'inactivo';
  sede_nombre: string;
  rol_label: string;
  permisos?: string[];
  created_at: string;
};

type UrbanoCredential = {
  id: number;
  sede_id: number;
  sede_nombre: string;
  username: string;
  estado: 'activo' | 'inactivo';
  last_login_at: string | null;
  updated_at: string;
};

type OverviewResumen = {
  total_sedes: number;
  sedes_activas: number;
  total_usuarios: number;
  total_lotes: number;
  lotes_activos: number;
  total_destinatarios: number;
};

// ── Helpers exactos del admin.js legacy ──
const fmtDate = (v: string | null | undefined) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return 'Sin registro';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'Sin registro';
    return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return 'Sin registro'; }
};

const EstadoChip: React.FC<{ estado: string }> = ({ estado }) => {
  if (estado === 'activo') return <span className="chip ok">Activo</span>;
  if (estado === 'inactivo') return <span className="chip off">Inactivo</span>;
  return <span className="chip warn">{estado}</span>;
};

const ROLES_MAP: Record<string, string> = {
  SysAdmin: 'Administrador del Sistema',
  AdminEmpresa: 'Administrador General',
  EncargadoOficina: 'Encargado de Oficina'
};

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  SysAdmin: [
    'admin.panel.ver'
  ],
  AdminEmpresa: [
    'rrhh.ver',
    'gps.ver',
    'rutas.ver',
    'whatsapp.ver',
    'urbano.rutas.ver',
    'entregas.ver',
    'etiquetas.ver',
    'savarscan.ver'
  ],
  EncargadoOficina: [
    'gps.ver',
    'rutas.ver',
    'whatsapp.ver',
    'urbano.rutas.ver',
    'entregas.ver',
    'etiquetas.ver',
    'savarscan.ver'
  ]
};

const roleBadgeClass = (rol: string, es_superadmin?: boolean | number) => {
  const r = es_superadmin ? 'SysAdmin' : rol;
  if (r === 'SysAdmin') return 'badge sysadmin';
  if (r === 'AdminEmpresa') return 'badge manager';
  return 'badge operator';
};

// ── Componente ──
export const Admin: React.FC = () => {
  const { user } = useAuth();

  // Data
  const [resumen, setResumen] = useState<OverviewResumen>({ total_sedes: 0, sedes_activas: 0, total_usuarios: 0, total_lotes: 0, lotes_activos: 0, total_destinatarios: 0 });
  const [sedes, setSedes] = useState<SedeItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [urbanoCreds, setUrbanoCreds] = useState<UrbanoCredential[]>([]);

  // Modals
  const [showSedeModal, setShowSedeModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showUrbanoModal, setShowUrbanoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Editing state
  const [editingSede, setEditingSede] = useState<SedeItem | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editingUrbano, setEditingUrbano] = useState<UrbanoCredential | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<UserItem | null>(null);
  const [permissionsForm, setPermissionsForm] = useState<string[]>([]);

  // Forms
  const [sedeForm, setSf] = useState({ nombre: '', direccion: '', telefono: '', estado: 'activo' });
  const [userForm, setUf] = useState<{
    nombre: string;
    usuario: string;
    password: string;
    rol: string;
    sedeId: string;
    estado: string;
    permisos: string[];
  }>({
    nombre: '',
    usuario: '',
    password: '',
    rol: 'EncargadoOficina',
    sedeId: '',
    estado: 'activo',
    permisos: []
  });
  const [urbanoForm, setUrf] = useState({ sedeId: '', username: '', password: '', estado: 'activo' });
  const [profileForm, setPf] = useState({ nombre: '', usuario: '', password_actual: '', nuevo_password: '' });

  // ── Loaders ──
  const loadResumen = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/overview');
      if (r.data?.ok) setResumen(r.data.data?.resumen || { total_sedes: 0, sedes_activas: 0, total_usuarios: 0, total_lotes: 0, lotes_activos: 0, total_destinatarios: 0 });
    } catch { /* ignore */ }
  }, []);

  const loadSedes = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/sedes');
      if (r.data?.ok) setSedes(r.data.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/usuarios');
      if (r.data?.ok) setUsers(r.data.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadUrbano = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/urbano-credenciales');
      if (r.data?.ok) setUrbanoCreds(r.data.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadResumen(), loadSedes(), loadUsers(), loadUrbano()]);
  }, [loadResumen, loadSedes, loadUsers, loadUrbano]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Sede CRUD ──
  const resetSf = () => { setSf({ nombre: '', direccion: '', telefono: '', estado: 'activo' }); setEditingSede(null); };
  const openNewSede = () => { resetSf(); setShowSedeModal(true); };
  const openEditSede = (s: SedeItem) => {
    setEditingSede(s);
    setSf({ nombre: s.nombre, direccion: s.direccion || '', telefono: s.telefono || '', estado: s.estado || 'activo' });
    setShowSedeModal(true);
  };
  const handleSaveSede = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sedeForm.nombre.trim()) return;
    try {
      const payload = { nombre: sedeForm.nombre.trim(), direccion: sedeForm.direccion.trim() || null, telefono: sedeForm.telefono.trim() || null, estado: sedeForm.estado };
      if (editingSede) {
        await apiClient.put(`/admin/sedes/${editingSede.id}`, payload);
        showToast('Sede actualizada correctamente.', 'success');
      } else {
        await apiClient.post('/admin/sedes', payload);
        showToast('Sede creada correctamente.', 'success');
      }
      setShowSedeModal(false); resetSf(); await loadAll();
    } catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo guardar la sede', 'error'); }
  };
  const handleDeleteSede = async (id: number, nombre: string) => {
    const ok = await showConfirm({ title: 'Eliminar sede', message: `Se eliminará la sede «${nombre}» si no tiene usuarios, rutas ni sesiones. ¿Deseas continuar?`, confirmText: 'Eliminar sede', type: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/admin/sedes/${id}`); showToast('Sede eliminada', 'success'); await loadAll(); }
    catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo eliminar la sede', 'error'); }
  };

  // ── User CRUD ──
  const resetUf = () => { setUf({ nombre: '', usuario: '', password: '', rol: 'EncargadoOficina', sedeId: '', estado: 'activo', permisos: [...ROLE_DEFAULT_PERMISSIONS['EncargadoOficina']] }); setEditingUser(null); };
  const openNewUser = () => { resetUf(); setShowUserModal(true); };
  const openEditUser = (u: UserItem) => {
    if (u.es_superadmin || u.rol === 'SysAdmin') {
      showToast('No se puede editar al Super Administrador.', 'warning');
      return;
    }
    setEditingUser(u);
    const userRole = u.rol;
    setUf({ 
      nombre: u.nombre, 
      usuario: u.usuario, 
      password: '', 
      rol: userRole, 
      sedeId: u.sede_id != null ? String(u.sede_id) : '', 
      estado: u.estado, 
      permisos: u.permisos && u.permisos.length > 0 ? u.permisos : [...(ROLE_DEFAULT_PERMISSIONS[userRole] || [])] 
    });
    setShowUserModal(true);
  };
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.nombre.trim() || !userForm.usuario.trim()) return;
    if (!editingUser && !userForm.password.trim()) { showToast('La contraseña es obligatoria al crear un usuario.', 'warning'); return; }
    try {
      const payload: any = { nombre: userForm.nombre.trim(), usuario: userForm.usuario.trim(), rol: userForm.rol, sede_id: userForm.rol === 'EncargadoOficina' && userForm.sedeId ? Number(userForm.sedeId) : null, estado: userForm.estado, permisos: userForm.permisos };
      if (userForm.password.trim()) payload.password = userForm.password.trim();
      if (editingUser) {
        await apiClient.put(`/admin/usuarios/${editingUser.id}`, payload);
        showToast('Usuario actualizado correctamente.', 'success');
      } else {
        await apiClient.post('/admin/usuarios', payload);
        showToast('Usuario creado correctamente.', 'success');
      }
      setShowUserModal(false); resetUf(); await loadAll();
    } catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo guardar el usuario', 'error'); }
  };
  const handleDeleteUser = async (u: UserItem) => {
    if (u.rol === 'SysAdmin' || u.es_superadmin) { showToast('No se puede eliminar este usuario', 'warning'); return; }
    const ok = await showConfirm({ title: 'Eliminar usuario', message: `Se eliminará el usuario «${u.usuario}». ¿Deseas continuar?`, confirmText: 'Eliminar usuario', type: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/admin/usuarios/${u.id}`); showToast('Usuario eliminado', 'success'); await loadAll(); }
    catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo eliminar el usuario', 'error'); }
  };

  const openUserPermissions = (u: UserItem) => {
    if (u.es_superadmin || u.rol === 'SysAdmin') {
      showToast('No se pueden modificar los accesos del Super Administrador.', 'warning');
      return;
    }
    setPermissionsUser(u);
    const userRole = u.rol;
    setPermissionsForm(u.permisos && u.permisos.length > 0 ? u.permisos : [...(ROLE_DEFAULT_PERMISSIONS[userRole] || [])]);
  };

  const handleSaveUserPermisos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionsUser) return;
    try {
      const payload: any = {
        nombre: permissionsUser.nombre,
        usuario: permissionsUser.usuario,
        rol: permissionsUser.rol,
        sede_id: permissionsUser.sede_id,
        estado: permissionsUser.estado,
        permisos: permissionsForm
      };
      await apiClient.put(`/admin/usuarios/${permissionsUser.id}`, payload);
      showToast('Permisos de usuario actualizados correctamente.', 'success');
      setPermissionsUser(null);
      await loadAll();
    } catch (err: any) {
      showToast(err.response?.data?.mensaje || 'No se pudieron guardar los permisos', 'error');
    }
  };

  // ── Urbano CRUD ──
  const resetUrf = () => { setUrf({ sedeId: '', username: '', password: '', estado: 'activo' }); setEditingUrbano(null); };
  const openNewUrbano = () => { resetUrf(); setShowUrbanoModal(true); };
  const openEditUrbano = (c: UrbanoCredential) => {
    setEditingUrbano(c);
    setUrf({ sedeId: String(c.sede_id), username: c.username, password: '', estado: c.estado });
    setShowUrbanoModal(true);
  };
  const handleSaveUrbano = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urbanoForm.sedeId || !urbanoForm.username.trim()) { showToast('Completa todos los campos obligatorios', 'warning'); return; }
    if (!editingUrbano && !urbanoForm.password.trim()) { showToast('La contraseña Urbano es obligatoria al crear el acceso.', 'warning'); return; }
    try {
      const payload: any = { username: urbanoForm.username.trim(), estado: urbanoForm.estado };
      if (urbanoForm.password.trim()) payload.password = urbanoForm.password.trim();
      await apiClient.put(`/admin/urbano-credenciales/${urbanoForm.sedeId}`, payload);
      showToast('Acceso Urbano guardado correctamente.', 'success');
      setShowUrbanoModal(false); resetUrf(); await loadUrbano();
    } catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo guardar el acceso Urbano', 'error'); }
  };
  const handleDeleteUrbano = async (c: UrbanoCredential) => {
    const ok = await showConfirm({ title: 'Eliminar acceso Urbano', message: `Se eliminará la configuración de Urbano para la sede "${c.sede_nombre}". La sede dejará de consultar rutas hasta configurar un nuevo acceso.`, confirmText: 'Eliminar acceso', type: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/admin/urbano-credenciales/${c.sede_id}`); showToast('Credencial Urbano eliminada', 'success'); await loadUrbano(); }
    catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo eliminar la credencial', 'error'); }
  };



  const renderPermissionSwitchPage = (permKey: string, label: string) => {
    return (
      <label className="checkbox-switch">
        <input 
          type="checkbox" 
          checked={permissionsForm.includes(permKey)} 
          onChange={(e) => {
            const checked = e.target.checked;
            setPermissionsForm(prev => checked 
              ? [...prev, permKey] 
              : prev.filter(p => p !== permKey)
            );
          }}
        />
        <span className="switch-slider"></span>
        <span className="switch-label">{label}</span>
      </label>
    );
  };

  // ── Profile ──
  const openProfile = () => {
    setPf({ nombre: user?.nombre || '', usuario: user?.usuario || '', password_actual: '', nuevo_password: '' });
    setShowProfileModal(true);
  };
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { nombre: profileForm.nombre.trim(), usuario: profileForm.usuario.trim() };
      if (profileForm.password_actual && profileForm.nuevo_password) {
        payload.password_actual = profileForm.password_actual;
        payload.nuevo_password = profileForm.nuevo_password;
      }
      const r = await apiClient.put('/auth/perfil', payload);
      if (r.data?.user) {
        localStorage.setItem('user', JSON.stringify(r.data.user));
        window.dispatchEvent(new Event('user-updated'));
      }
      showToast('Perfil actualizado correctamente.', 'success');
      setShowProfileModal(false);
    } catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo actualizar el perfil', 'error'); }
  };

  // ── Render ──
  if (permissionsUser) {
    return (
      <div className="main admin-page">
        {/* TOPBAR — estilo unificado con las demás páginas */}
        <header className="topbar">
          <div className="header-title-container">
            <button className="btn-back" onClick={() => setPermissionsUser(null)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Volver
            </button>
            <div>
              <div className="topbar-title">Configurar accesos de usuario</div>
              <div className="topbar-sub">Administra los permisos individuales de {permissionsUser.nombre}</div>
            </div>
          </div>
          <div className="topbar-right">
            <div className="user-role-badge">
              <span className="status-dot"></span>
              <span>{permissionsUser.rol_label || ROLES_MAP[permissionsUser.rol]}</span>
            </div>
          </div>
        </header>

        <main className="permissions-editor-container">
          {/* COLUMNA IZQUIERDA: PERFIL CARD */}
          <aside className="profile-sidebar-card">
            <div className="profile-avatar-large">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="profile-info-block">
              <div className="profile-name">{permissionsUser.nombre}</div>
              <div className="profile-username">@{permissionsUser.usuario}</div>
            </div>
            
            <div className="profile-details-list">
              <div className="profile-detail-item">
                <span className="profile-detail-label">Rol</span>
                <span className="profile-detail-value">{permissionsUser.rol_label || ROLES_MAP[permissionsUser.rol]}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Sede</span>
                <span className="profile-detail-value">{permissionsUser.sede_nombre}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">Estado</span>
                <span className="profile-detail-value" style={{ textTransform: 'capitalize' }}>{permissionsUser.estado}</span>
              </div>
            </div>
          </aside>

          {/* COLUMNA DERECHA: MATRIZ DE PERMISOS */}
          <form onSubmit={handleSaveUserPermisos} className="permissions-matrix-panel">
            <div className="permissions-matrix-section">
              <div className="matrix-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 className="matrix-title" style={{ margin: 0 }}>Accesos y Menús del Usuario</h4>
                <div className="matrix-badge-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(() => {
                    const defaults = ROLE_DEFAULT_PERMISSIONS[permissionsUser.rol] || [];
                    const isCustom = defaults.length !== permissionsForm.length || !defaults.every(p => permissionsForm.includes(p));
                    return isCustom ? (
                      <>
                        <span className="badge-custom-perm-table" style={{ fontSize: '0.64rem', padding: '2px 8px', background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6', borderRadius: '4px', fontWeight: 600 }}>
                          Personalizados
                        </span>
                        <button 
                          type="button" 
                          style={{ border: 'none', background: 'transparent', color: '#16a34a', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          onClick={() => setPermissionsForm([...(ROLE_DEFAULT_PERMISSIONS[permissionsUser.rol] || [])])}
                        >
                          Restablecer al Rol
                        </button>
                      </>
                    ) : (
                      <span className="badge-default-perm-table" style={{ fontSize: '0.64rem', padding: '2px 8px', background: 'rgba(16, 185, 129, 0.08)', color: '#16a34a', borderRadius: '4px', fontWeight: 600 }}>
                        Por Defecto del Rol
                      </span>
                    );
                  })()}
                </div>
              </div>
              <p className="matrix-subtitle">Marca los módulos del menú lateral que este usuario podrá visualizar y operar.</p>
              
              <div className="matrix-groups">
                {/* Grupo 1: WhatsApp Masivo */}
                <div className="matrix-group-card">
                  <div className="matrix-group-header">
                    <span className="group-dot operations-dot"></span>
                    <h5>WhatsApp Masivo (Operaciones)</h5>
                  </div>
                  <div className="matrix-group-body">
                    {renderPermissionSwitchPage('rutas.ver', 'Ver Menú: Rutas')}
                    {renderPermissionSwitchPage('whatsapp.ver', 'Ver Menú: WhatsApp Sessions')}
                    {renderPermissionSwitchPage('urbano.rutas.ver', 'Ver Menú: Consulta de rutas')}
                  </div>
                </div>

                {/* Grupo 2: Logística y Herramientas */}
                <div className="matrix-group-card">
                  <div className="matrix-group-header">
                    <span className="group-dot tools-dot"></span>
                    <h5>Logística y Herramientas</h5>
                  </div>
                  <div className="matrix-group-body">
                    {renderPermissionSwitchPage('entregas.ver', 'Ver Menú: Gestión de entregas')}
                    {renderPermissionSwitchPage('etiquetas.ver', 'Ver Menú: Generar etiquetas')}
                    {renderPermissionSwitchPage('savarscan.ver', 'Ver Menú: SAVAR SCAN')}
                    {renderPermissionSwitchPage('gps.ver', 'Ver Menú: Rastreo GPS')}
                  </div>
                </div>

                {/* Grupo 3: Administración */}
                <div className="matrix-group-card">
                  <div className="matrix-group-header">
                    <span className="group-dot admin-dot" style={{ backgroundColor: '#fb923c', boxShadow: '0 0 5px rgba(251, 146, 60, 0.4)' }}></span>
                    <h5>Administración</h5>
                  </div>
                  <div className="matrix-group-body">
                    {renderPermissionSwitchPage('rrhh.ver', 'Ver Menú: Recursos Humanos')}
                    {renderPermissionSwitchPage('admin.panel.ver', 'Ver Menú: Panel central')}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="matrix-panel-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setPermissionsUser(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar Cambios</button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="main admin-page">
      {/* TOPBAR — exacto del admin.html original */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand">A</div>
          <div className="topbar-title-group">
            <div>
              <div className="topbar-title">Administración central</div>
              <div className="topbar-sub">Control de sedes y usuarios</div>
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <button className="profile-button" id="btn-open-profile-modal" type="button" title="Abrir perfil" onClick={openProfile}>
            <span className="profile-avatar" id="topbar-avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <span className="profile-copy">
              <strong id="topbar-name">{user?.nombre || 'Administrador'}</strong>
              <small>Perfil</small>
            </span>
          </button>
        </div>
      </header>

      <main className="content">
        {/* STATS GRID — exacto del admin original */}
        <section className="stats-grid">
          <div className="stat-card green">
            <div className="stat-top">
              <div className="stat-icon-wrap green">
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total sedes</div>
                <div className="stat-chip">{resumen.sedes_activas || 0} activas</div>
              </div>
            </div>
            <div className="stat-value">{resumen.total_sedes}</div>
            <div className="stat-sub">Sucursales registradas en el sistema</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-top">
              <div className="stat-icon-wrap blue">
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total usuarios</div>
                <div className="stat-chip">Accesos</div>
              </div>
            </div>
            <div className="stat-value">{resumen.total_usuarios}</div>
            <div className="stat-sub">Usuarios creados para trabajo por sede</div>
          </div>
          <div className="stat-card violet">
            <div className="stat-top">
              <div className="stat-icon-wrap violet">
                <svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Rutas cargadas</div>
                <div className="stat-chip">Histórico</div>
              </div>
            </div>
            <div className="stat-value">{resumen.total_lotes}</div>
            <div className="stat-sub">Registros de trabajo acumulados</div>
          </div>
          <div className="stat-card orange">
            <div className="stat-top">
              <div className="stat-icon-wrap orange">
                <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Rutas activas</div>
                <div className="stat-chip">Hoy</div>
              </div>
            </div>
            <div className="stat-value">{resumen.lotes_activos}</div>
            <div className="stat-sub">Rutas pendientes o en proceso</div>
          </div>
        </section>

        {/* PANEL SEDES */}
        <section className="panel" id="sedes-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Sedes registradas</div>
              <div className="panel-sub">Alta, edición y estado operativo de cada sede.</div>
            </div>
            <div className="actions">
              <button className="btn btn-soft btn-sm" onClick={loadSedes}>Actualizar</button>
              <button className="btn btn-primary" onClick={openNewSede}>Nueva sede</button>
            </div>
          </div>
          <div className="panel-body">
            <table>
              <thead>
                <tr>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Usuarios</th>
                  <th>Sesiones</th>
                  <th>Rutas</th>
                  <th>Destinatarios</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sedes.length === 0 && <tr><td colSpan={7} className="empty">No hay sedes registradas</td></tr>}
                {sedes.map(s => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.nombre}</strong><br />
                      <span className="td-muted">{s.direccion || 'Sin dirección'}</span>
                    </td>
                    <td><EstadoChip estado={s.estado} /></td>
                    <td>{s.total_usuarios}</td>
                    <td>{s.total_sesiones}</td>
                    <td>{s.total_lotes}</td>
                    <td>{s.destinatarios}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-icon edit" title="Editar" onClick={() => openEditSede(s)}>
                          <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button className="btn-icon delete" title="Eliminar" onClick={() => handleDeleteSede(s.id, s.nombre)}>
                          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* PANEL URBANO */}
        <section className="panel" id="urbano-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Accesos Urbano por sede</div>
              <div className="panel-sub">Configura las credenciales que usará cada sede para consultar rutas en Urbano.</div>
            </div>
            <div className="actions">
              <button className="btn btn-soft btn-sm" onClick={loadUrbano}>Actualizar</button>
              <button className="btn btn-primary" onClick={openNewUrbano}>Configurar acceso</button>
            </div>
          </div>
          <div className="panel-body">
            <table>
              <thead>
                <tr>
                  <th>Sede</th>
                  <th>Usuario Urbano</th>
                  <th>Estado</th>
                  <th>U. inicio</th>
                  <th>Actualizado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {urbanoCreds.length === 0 && <tr><td colSpan={6} className="empty">Aún no hay credenciales Urbano configuradas. Usa "Configurar acceso" para habilitar consultas por sede.</td></tr>}
                {urbanoCreds.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.sede_nombre}</strong></td>
                    <td>
                      <span className="secure-cell">
                        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        {c.username}
                      </span>
                    </td>
                    <td><EstadoChip estado={c.estado} /></td>
                    <td className="td-muted">{fmtDateTime(c.last_login_at)}</td>
                    <td className="td-muted">{fmtDateTime(c.updated_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-icon edit" title="Editar acceso Urbano" onClick={() => openEditUrbano(c)}>
                          <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button className="btn-icon delete" title="Eliminar acceso Urbano" onClick={() => handleDeleteUrbano(c)}>
                          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* PANEL USUARIOS */}
        <section className="panel" id="usuarios-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Usuarios por sede</div>
              <div className="panel-sub">Controla accesos operativos y asigna cada usuario a su sede.</div>
            </div>
            <div className="actions">
              <button className="btn btn-soft btn-sm" onClick={loadUsers}>Actualizar</button>
              <button className="btn btn-primary" onClick={openNewUser}>Nuevo usuario</button>
            </div>
          </div>
          <div className="panel-body">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Sede</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && <tr><td colSpan={7} className="empty">No hay usuarios operativos registrados</td></tr>}
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.nombre}</strong></td>
                    <td>{u.usuario}</td>
                    <td>{u.sede_nombre}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={roleBadgeClass(u.rol, u.es_superadmin)}>{u.rol_label || ROLES_MAP[u.rol] || u.rol}</span>
                        {(() => {
                          const defaults = ROLE_DEFAULT_PERMISSIONS[u.rol] || [];
                          const hasCustom = u.permisos && (defaults.length !== u.permisos.length || !defaults.every(p => u.permisos?.includes(p)));
                          return hasCustom ? (
                            <span className="badge-custom-perm-table" style={{ fontSize: '0.64rem', padding: '1px 6px', background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6', borderRadius: '4px', alignSelf: 'flex-start', fontWeight: 600 }}>
                              Personalizado
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td><EstadoChip estado={u.estado} /></td>
                    <td className="td-muted">{fmtDate(u.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-icon edit" title="Editar datos básicos" onClick={() => openEditUser(u)}>
                          <svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button className="btn-icon edit" title="Gestionar accesos" onClick={() => openUserPermissions(u)} style={{ color: '#3b82f6' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        </button>
                        <button className="btn-icon delete" title="Eliminar" onClick={() => handleDeleteUser(u)}>
                          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* ── MODAL SEDE ── */}
      {showSedeModal && (
        <div className="modal-overlay open" onClick={() => { setShowSedeModal(false); resetSf(); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-accent" />
            <div className="modal-head">
              <div className="modal-head-content">
                <div className="modal-head-icon">
                  <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                </div>
                <div>
                  <h3>{editingSede ? 'Editar sede' : 'Nueva sede'}</h3>
                  <p>{editingSede ? 'Actualiza los datos de la sede.' : 'Registra una nueva sucursal y define su información base.'}</p>
                </div>
              </div>
              <button className="close-btn" type="button" onClick={() => { setShowSedeModal(false); resetSf(); }}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveSede}>
              <div className="modal-body">
                <div className="field">
                  <label>Nombre de la sede</label>
                  <input type="text" placeholder="Ej: La Merced" value={sedeForm.nombre} onChange={e => setSf(f => ({ ...f, nombre: e.target.value }))} required />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Dirección</label>
                    <input type="text" placeholder="Dirección o referencia" value={sedeForm.direccion} onChange={e => setSf(f => ({ ...f, direccion: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Teléfono</label>
                    <input type="text" placeholder="Número de contacto" value={sedeForm.telefono} onChange={e => setSf(f => ({ ...f, telefono: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Estado</label>
                  <select value={sedeForm.estado} onChange={e => setSf(f => ({ ...f, estado: e.target.value }))}>
                    <option value="activo">Activa</option>
                    <option value="inactivo">Inactiva</option>
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowSedeModal(false); resetSf(); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" id="btn-save-sede">Guardar sede</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL URBANO ── */}
      {showUrbanoModal && (
        <div className="modal-overlay open" onClick={() => { setShowUrbanoModal(false); resetUrf(); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-accent" />
            <div className="modal-head">
              <div className="modal-head-content">
                <div className="modal-head-icon">
                  <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </div>
                <div>
                  <h3>{editingUrbano ? 'Editar acceso Urbano' : 'Configurar acceso Urbano'}</h3>
                  <p>Asigna el usuario de Urbano que usará esta sede para consultar rutas.</p>
                </div>
              </div>
              <button className="close-btn" type="button" onClick={() => { setShowUrbanoModal(false); resetUrf(); }}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveUrbano}>
              <div className="modal-body">
                <div className="secret-note">
                  <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <span><strong>Acceso protegido.</strong> La contraseña nunca se muestra; solo puedes reemplazarla.</span>
                </div>
                <div className="field">
                  <label>Sede</label>
                  <select value={urbanoForm.sedeId} onChange={e => setUrf(f => ({ ...f, sedeId: e.target.value }))} disabled={!!editingUrbano} required>
                    <option value="">Seleccionar sede</option>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Usuario Urbano</label>
                    <input type="text" placeholder="Usuario asignado por Urbano" value={urbanoForm.username} onChange={e => setUrf(f => ({ ...f, username: e.target.value }))} required />
                  </div>
                  <div className="field">
                    <label>Estado</label>
                    <select value={urbanoForm.estado} onChange={e => setUrf(f => ({ ...f, estado: e.target.value }))}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Contraseña Urbano</label>
                  <input type="password" placeholder={editingUrbano ? 'Dejar vacía para conservar la actual' : 'Obligatoria al crear'} value={urbanoForm.password} onChange={e => setUrf(f => ({ ...f, password: e.target.value }))} />
                  <span className="field-hint">{editingUrbano ? 'En edición puedes dejarla vacía para conservar la actual.' : 'Obligatoria al crear.'}</span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowUrbanoModal(false); resetUrf(); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" id="btn-save-urbano">Guardar acceso</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL USUARIO ── */}
      {showUserModal && (
        <div className="modal-overlay open" onClick={() => { setShowUserModal(false); resetUf(); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-accent" />
            <div className="modal-head">
              <div className="modal-head-content">
                <div className="modal-head-icon">
                  <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                </div>
                <div>
                  <h3>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h3>
                  <p>{editingUser ? 'Actualiza los datos del usuario.' : 'Crea un acceso y asígnalo a la sede correcta.'}</p>
                </div>
              </div>
              <button className="close-btn" type="button" onClick={() => { setShowUserModal(false); resetUf(); }}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveUser}>
              <div className="modal-body">
                <div className="field-row">
                  <div className="field">
                    <label>Nombre</label>
                    <input type="text" placeholder="Nombre completo" value={userForm.nombre} onChange={e => setUf(f => ({ ...f, nombre: e.target.value }))} required />
                  </div>
                  <div className="field">
                    <label>Usuario</label>
                    <input type="text" placeholder="usuario_login" value={userForm.usuario} onChange={e => setUf(f => ({ ...f, usuario: e.target.value }))} required />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Rol</label>
                    <select 
                      value={userForm.rol} 
                      onChange={e => {
                        const newRol = e.target.value;
                        setUf(f => ({ ...f, rol: newRol, permisos: [...(ROLE_DEFAULT_PERMISSIONS[newRol] || [])] }));
                      }}
                    >
                      <option value="EncargadoOficina">Encargado de Oficina</option>
                      <option value="AdminEmpresa">Administrador General</option>
                    </select>
                    <span className="field-hint">Selecciona el alcance operativo del usuario.</span>
                  </div>
                  <div className="field">
                    <label>Sede</label>
                    <select value={userForm.sedeId} onChange={e => setUf(f => ({ ...f, sedeId: e.target.value }))} required={userForm.rol === 'EncargadoOficina'}>
                      <option value="">Seleccionar sede</option>
                      {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                    <span className="field-hint" id="user-form-sede-hint">
                      {userForm.rol === 'EncargadoOficina' ? 'Obligatoria para Encargado de Oficina.' : 'Este rol tiene alcance central y no pertenece a una sede.'}
                    </span>
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Estado</label>
                    <select value={userForm.estado} onChange={e => setUf(f => ({ ...f, estado: e.target.value }))}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Contraseña</label>
                    <input type="password" placeholder={editingUser ? 'Solo llena si deseas cambiarla' : 'Obligatoria al crear'} value={userForm.password} onChange={e => setUf(f => ({ ...f, password: e.target.value }))} />
                  </div>
                </div>

                {/* MATRIZ DE PERMISOS DINÁMICA REMOVIDA A VISTA INDEPENDIENTE */}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowUserModal(false); resetUf(); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" id="btn-save-user">Guardar usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL PERFIL ── exacto del admin.html original ── */}
      {showProfileModal && (
        <div className="modal-overlay open" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-accent" />
            <div className="modal-head">
              <div className="modal-head-content">
                <div className="modal-head-icon">
                  <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                </div>
                <div>
                  <h3>Mi perfil</h3>
                  <p>Actualiza tu nombre, usuario o contraseña de acceso.</p>
                </div>
              </div>
              <button className="close-btn" type="button" onClick={() => setShowProfileModal(false)}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveProfile}>
              <div className="modal-body">
                <div className="field-row">
                  <div className="field">
                    <label>Nombre</label>
                    <input type="text" placeholder="Nombre visible" value={profileForm.nombre} onChange={e => setPf(f => ({ ...f, nombre: e.target.value }))} required />
                  </div>
                  <div className="field">
                    <label>Usuario</label>
                    <input type="text" placeholder="usuario_login" value={profileForm.usuario} onChange={e => setPf(f => ({ ...f, usuario: e.target.value }))} required />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Contraseña actual</label>
                    <input type="password" placeholder="Solo si cambias contraseña" value={profileForm.password_actual} onChange={e => setPf(f => ({ ...f, password_actual: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Nueva contraseña</label>
                    <input type="password" placeholder="Opcional" value={profileForm.nuevo_password} onChange={e => setPf(f => ({ ...f, nuevo_password: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => setShowProfileModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" id="btn-save-profile">Guardar perfil</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

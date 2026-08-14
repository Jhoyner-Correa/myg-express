import React, { useState, useEffect, useCallback } from 'react';
import '../../css/admin.css';
import apiClient from '../../core/api/apiClient';
import { useAuth } from '../../core/auth/authState';
import { showToast, showConfirm } from '../../core/utils/toast';
import { UserAccessPanel } from './access/components/UserAccessPanel';

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

// ── Componente ──
export const Admin: React.FC = () => {
  const { user } = useAuth();

  // Data
  const [resumen, setResumen] = useState<OverviewResumen>({ total_sedes: 0, sedes_activas: 0, total_usuarios: 0, total_lotes: 0, lotes_activos: 0, total_destinatarios: 0 });
  const [sedes, setSedes] = useState<SedeItem[]>([]);
  const [urbanoCreds, setUrbanoCreds] = useState<UrbanoCredential[]>([]);

  // Modals
  const [showSedeModal, setShowSedeModal] = useState(false);
  const [showUrbanoModal, setShowUrbanoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Editing state
  const [editingSede, setEditingSede] = useState<SedeItem | null>(null);
  const [editingUrbano, setEditingUrbano] = useState<UrbanoCredential | null>(null);

  // Forms
  const [sedeForm, setSf] = useState({ nombre: '', direccion: '', telefono: '', estado: 'activo' });
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

  const loadUrbano = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/urbano-credenciales');
      if (r.data?.ok) setUrbanoCreds(r.data.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadResumen(), loadSedes(), loadUrbano()]);
  }, [loadResumen, loadSedes, loadUrbano]);

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

        <UserAccessPanel sites={sedes} />
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

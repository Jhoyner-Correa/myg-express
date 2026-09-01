import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  KeyRound,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import '../../css/admin.css';
import { ProfileModal } from '../../components/ui/ProfileModal/ProfileModal';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import apiClient from '../../core/api/apiClient';
import { useAuth } from '../../core/auth/authState';
import {
  deleteProfilePhoto,
  updateProfile,
  updateProfilePhoto,
} from '../../core/auth/profile.service';
import type { ProfileUpdateInput } from '../../core/auth/profile.service';
import { showToast, showConfirm } from '../../core/utils/toast';
import { RrhhExecutiveHeader } from '../rrhh/components/RrhhExecutiveHeader';
import type { ExecutiveAlert } from '../rrhh/components/executive-alerts';
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
  usuarios_activos: number;
  accesos_urbano_activos: number;
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
  usuarios_activos: number;
  accesos_urbano_activos: number;
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
  const { user, updateUser } = useAuth();
  const [activeView, setActiveView] = useState<'sites' | 'integrations' | 'users'>('sites');

  // Data
  const [resumen, setResumen] = useState<OverviewResumen>({ total_sedes: 0, sedes_activas: 0, total_usuarios: 0, usuarios_activos: 0, accesos_urbano_activos: 0, total_lotes: 0, lotes_activos: 0, total_destinatarios: 0 });
  const [sedes, setSedes] = useState<SedeItem[]>([]);
  const [urbanoCreds, setUrbanoCreds] = useState<UrbanoCredential[]>([]);

  // Modals
  const [showSedeModal, setShowSedeModal] = useState(false);
  const [showUrbanoModal, setShowUrbanoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [savingForm, setSavingForm] = useState(false);

  // Editing state
  const [editingSede, setEditingSede] = useState<SedeItem | null>(null);
  const [editingUrbano, setEditingUrbano] = useState<UrbanoCredential | null>(null);

  // Forms
  const [sedeForm, setSf] = useState({ nombre: '', direccion: '', telefono: '', estado: 'activo' });
  const [urbanoForm, setUrf] = useState({ sedeId: '', username: '', password: '', estado: 'activo' });

  // ── Loaders ──
  const loadResumen = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/overview');
      if (r.data?.ok) setResumen(r.data.data?.resumen || { total_sedes: 0, sedes_activas: 0, total_usuarios: 0, usuarios_activos: 0, accesos_urbano_activos: 0, total_lotes: 0, lotes_activos: 0, total_destinatarios: 0 });
      return Boolean(r.data?.ok);
    } catch { return false; }
  }, []);

  const loadSedes = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/sedes');
      if (r.data?.ok) setSedes(r.data.data || []);
      return Boolean(r.data?.ok);
    } catch { return false; }
  }, []);

  const loadUrbano = useCallback(async () => {
    try {
      const r = await apiClient.get('/admin/urbano-credenciales');
      if (r.data?.ok) setUrbanoCreds(r.data.data || []);
      return Boolean(r.data?.ok);
    } catch { return false; }
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
    if (!sedeForm.nombre.trim() || savingForm) return;
    setSavingForm(true);
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
    finally { setSavingForm(false); }
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
    if (savingForm) return;
    if (!urbanoForm.sedeId || !urbanoForm.username.trim()) { showToast('Completa todos los campos obligatorios', 'warning'); return; }
    if (!editingUrbano && !urbanoForm.password.trim()) { showToast('La contraseña Urbano es obligatoria al crear el acceso.', 'warning'); return; }
    setSavingForm(true);
    try {
      const payload: any = { username: urbanoForm.username.trim(), estado: urbanoForm.estado };
      if (urbanoForm.password.trim()) payload.password = urbanoForm.password.trim();
      await apiClient.put(`/admin/urbano-credenciales/${urbanoForm.sedeId}`, payload);
      showToast('Acceso Urbano guardado correctamente.', 'success');
      setShowUrbanoModal(false); resetUrf(); await loadUrbano();
    } catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo guardar el acceso Urbano', 'error'); }
    finally { setSavingForm(false); }
  };
  const handleDeleteUrbano = async (c: UrbanoCredential) => {
    const ok = await showConfirm({ title: 'Eliminar acceso Urbano', message: `Se eliminará la configuración de Urbano para la sede "${c.sede_nombre}". La sede dejará de consultar rutas hasta configurar un nuevo acceso.`, confirmText: 'Eliminar acceso', type: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/admin/urbano-credenciales/${c.sede_id}`); showToast('Credencial Urbano eliminada', 'success'); await loadUrbano(); }
    catch (err: any) { showToast(err.response?.data?.mensaje || 'No se pudo eliminar la credencial', 'error'); }
  };



  const openProfile = () => setShowProfileModal(true);
  const saveProfile = async (input: ProfileUpdateInput) => {
    const updatedUser = await updateProfile(input);
    updateUser?.(updatedUser);
    return updatedUser;
  };
  const saveProfilePhoto = async (file: File) => {
    const updatedUser = await updateProfilePhoto(file);
    updateUser?.(updatedUser);
    return updatedUser;
  };
  const removeProfilePhoto = async () => {
    const updatedUser = await deleteProfilePhoto();
    updateUser?.(updatedUser);
    return updatedUser;
  };

  // ── Render ──
  const pendingIntegrations = Math.max(resumen.total_sedes - resumen.accesos_urbano_activos, 0);
  const suspendedUsers = Math.max(resumen.total_usuarios - resumen.usuarios_activos, 0);
  const adminAlerts: ExecutiveAlert[] = [
    ...(pendingIntegrations > 0 ? [{
      id: 'admin-integrations',
      tone: 'warning' as const,
      kind: 'request' as const,
      title: `${pendingIntegrations} ${pendingIntegrations === 1 ? 'sede requiere' : 'sedes requieren'} configurar su integración`,
      site: 'Administración central',
      time: 'Pendiente',
      target: 'integrations',
    }] : []),
    ...(suspendedUsers > 0 ? [{
      id: 'admin-users',
      tone: 'info' as const,
      kind: 'request' as const,
      title: `${suspendedUsers} ${suspendedUsers === 1 ? 'cuenta suspendida' : 'cuentas suspendidas'} para revisión`,
      site: 'Seguridad',
      time: 'Pendiente',
      target: 'users',
    }] : []),
  ];
  const navigateFromHeader = (target: string) => {
    if (target === 'integrations' || target === 'users' || target === 'sites') setActiveView(target);
  };

  return (
    <div className="main admin-page">
      <PageHeader
        icon={<ShieldCheck />}
        title="Administración central"
        subtitle="Gobierno de sedes, integraciones y accesos de la plataforma"
        tone="corporate"
        metadata={<RrhhExecutiveHeader
          user={user}
          sites={[]}
          canViewAllSites={false}
          siteId={null}
          month=""
          months={[]}
          query=""
          alerts={adminAlerts}
          onSiteChange={() => undefined}
          onMonthChange={() => undefined}
          onQueryChange={() => undefined}
          onAlertSelect={navigateFromHeader}
          onAlertsClick={() => navigateFromHeader(adminAlerts[0]?.target || 'sites')}
          onOpenProfile={openProfile}
          compact
          contextLabel="Administración central"
        />}
      />

      <main className="content admin-command-content">
        <nav className="admin-command-nav" aria-label="Áreas de administración central">
          <button type="button" className={activeView === 'sites' ? 'active' : ''} onClick={() => setActiveView('sites')}><Building2 size={17} /><span>Sedes</span><small>{resumen.total_sedes}</small></button>
          <button type="button" className={activeView === 'integrations' ? 'active' : ''} onClick={() => setActiveView('integrations')}><Network size={17} /><span>Integraciones</span><small>{resumen.accesos_urbano_activos}</small></button>
          <button type="button" className={activeView === 'users' ? 'active' : ''} onClick={() => setActiveView('users')}><Users size={17} /><span>Usuarios y accesos</span><small>{resumen.total_usuarios}</small></button>
        </nav>

        {/* PANEL SEDES */}
        {activeView === 'sites' && <section className="panel" id="sedes-panel">
          <div className="panel-head">
            <div className="panel-heading-copy">
              <span className="panel-eyebrow">ESTRUCTURA OPERATIVA</span>
              <h2 className="panel-title">Sedes registradas</h2>
              <p className="panel-sub">Alta, edición y estado operativo de cada sede.</p>
            </div>
            <div className="actions">
              <button className="btn btn-soft btn-sm" onClick={loadSedes}><RefreshCw size={15} /> Actualizar</button>
              <button className="btn btn-primary" onClick={openNewSede}><Plus size={16} /> Nueva sede</button>
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
                        <button className="btn-icon edit" data-tooltip="Editar sede" aria-label={`Editar ${s.nombre}`} onClick={() => openEditSede(s)}><Pencil size={15} /></button>
                        <button className="btn-icon delete" data-tooltip="Eliminar sede" aria-label={`Eliminar ${s.nombre}`} onClick={() => handleDeleteSede(s.id, s.nombre)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>}

        {/* PANEL URBANO */}
        {activeView === 'integrations' && <section className="panel" id="urbano-panel">
          <div className="panel-head">
            <div className="panel-heading-copy">
              <span className="panel-eyebrow">INTEGRACIÓN OPERATIVA</span>
              <h2 className="panel-title">Accesos Urbano por sede</h2>
              <p className="panel-sub">Credenciales independientes para la consulta de rutas en cada sede.</p>
            </div>
            <div className="actions">
              <button className="btn btn-soft btn-sm" onClick={loadUrbano}><RefreshCw size={15} /> Actualizar</button>
              <button className="btn btn-primary" onClick={openNewUrbano}><KeyRound size={16} /> Configurar acceso</button>
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
                        <button className="btn-icon edit" data-tooltip="Editar acceso" aria-label={`Editar acceso de ${c.sede_nombre}`} onClick={() => openEditUrbano(c)}><Pencil size={15} /></button>
                        <button className="btn-icon delete" data-tooltip="Eliminar acceso" aria-label={`Eliminar acceso de ${c.sede_nombre}`} onClick={() => handleDeleteUrbano(c)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>}

        {activeView === 'users' && <UserAccessPanel sites={sedes} />}
      </main>

      {/* ── MODAL SEDE ── */}
      {showSedeModal && (
        <div className="modal-overlay open" onClick={() => { if (!savingForm) { setShowSedeModal(false); resetSf(); } }}>
          <div className="modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="site-modal-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-content">
                <div className="modal-head-icon">
                  <Building2 size={21} />
                </div>
                <div>
                  <span className="modal-eyebrow">ESTRUCTURA OPERATIVA</span>
                  <h3 id="site-modal-title">{editingSede ? 'Editar sede' : 'Registrar nueva sede'}</h3>
                  <p>{editingSede ? 'Actualiza la identidad y disponibilidad de esta ubicación.' : 'Incorpora una ubicación a la estructura de MyG Express.'}</p>
                </div>
              </div>
              <button className="close-btn" type="button" aria-label="Cerrar formulario" disabled={savingForm} onClick={() => { setShowSedeModal(false); resetSf(); }}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveSede}>
              <div className="modal-body">
                <div className="form-section-heading">
                  <div><strong>Información de la sede</strong><span>Datos visibles en la operación y asignación de usuarios.</span></div>
                  <span className="required-legend">* Obligatorio</span>
                </div>
                <div className="field field-wide">
                  <label htmlFor="site-name">Nombre de la sede <b>*</b></label>
                  <input id="site-name" type="text" autoComplete="organization" maxLength={120} placeholder="Ej. La Merced" value={sedeForm.nombre} onChange={e => setSf(f => ({ ...f, nombre: e.target.value }))} required />
                </div>
                <div className="field-row site-contact-grid">
                  <div className="field">
                    <label htmlFor="site-address">Dirección operativa</label>
                    <input id="site-address" type="text" autoComplete="street-address" maxLength={240} placeholder="Dirección o referencia" value={sedeForm.direccion} onChange={e => setSf(f => ({ ...f, direccion: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label htmlFor="site-phone">Teléfono de contacto</label>
                    <input id="site-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="Número de contacto" value={sedeForm.telefono} onChange={e => setSf(f => ({ ...f, telefono: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="site-status">Estado operativo</label>
                  <select id="site-status" value={sedeForm.estado} onChange={e => setSf(f => ({ ...f, estado: e.target.value }))}>
                    <option value="activo">Activa</option>
                    <option value="inactivo">Inactiva</option>
                  </select>
                  <span className="field-hint">Una sede inactiva conserva su historial, pero queda fuera de nuevas operaciones.</span>
                </div>
              </div>
              <div className="modal-foot">
                <span className="modal-foot-note"><ShieldCheck size={15} /> Configuración administrativa</span>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-ghost" disabled={savingForm} onClick={() => { setShowSedeModal(false); resetSf(); }}>Cancelar</button>
                  <button type="submit" className="btn btn-primary admin-form-submit" id="btn-save-sede" disabled={savingForm}><Save size={15} /> {savingForm ? 'Guardando…' : editingSede ? 'Guardar cambios' : 'Registrar sede'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL URBANO ── */}
      {showUrbanoModal && (
        <div className="modal-overlay open" onClick={() => { if (!savingForm) { setShowUrbanoModal(false); resetUrf(); } }}>
          <div className="modal admin-form-modal integration-form-modal" role="dialog" aria-modal="true" aria-labelledby="urbano-modal-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-content">
                <div className="modal-head-icon">
                  <Network size={21} />
                </div>
                <div>
                  <span className="modal-eyebrow">INTEGRACIÓN POR SEDE</span>
                  <h3 id="urbano-modal-title">{editingUrbano ? 'Editar acceso Urbano' : 'Configurar acceso Urbano'}</h3>
                  <p>Vincula una sede con sus credenciales operativas de consulta.</p>
                </div>
              </div>
              <button className="close-btn" type="button" aria-label="Cerrar formulario" disabled={savingForm} onClick={() => { setShowUrbanoModal(false); resetUrf(); }}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleSaveUrbano}>
              <div className="modal-body">
                <div className="secret-note">
                  <ShieldCheck size={20} />
                  <span><strong>Credencial protegida</strong> La contraseña permanece cifrada y nunca se muestra nuevamente.</span>
                </div>
                <div className="form-section-heading">
                  <div><strong>Asignación operativa</strong><span>Define la sede, la cuenta externa y su disponibilidad.</span></div>
                  <span className="required-legend">* Obligatorio</span>
                </div>
                <div className="field">
                  <label htmlFor="urbano-site">Sede vinculada <b>*</b></label>
                  <select id="urbano-site" value={urbanoForm.sedeId} onChange={e => setUrf(f => ({ ...f, sedeId: e.target.value }))} disabled={!!editingUrbano} required>
                    <option value="">Seleccionar sede</option>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="urbano-user">Usuario Urbano <b>*</b></label>
                    <input id="urbano-user" type="text" autoComplete="username" maxLength={120} placeholder="Usuario asignado" value={urbanoForm.username} onChange={e => setUrf(f => ({ ...f, username: e.target.value }))} required />
                  </div>
                  <div className="field">
                    <label htmlFor="urbano-status">Estado de integración</label>
                    <select id="urbano-status" value={urbanoForm.estado} onChange={e => setUrf(f => ({ ...f, estado: e.target.value }))}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="urbano-password">Contraseña Urbano {!editingUrbano && <b>*</b>}</label>
                  <input id="urbano-password" type="password" autoComplete="new-password" maxLength={200} required={!editingUrbano} placeholder={editingUrbano ? 'Escribe solo para reemplazarla' : 'Ingresa la contraseña asignada'} value={urbanoForm.password} onChange={e => setUrf(f => ({ ...f, password: e.target.value }))} />
                  <span className="field-hint">{editingUrbano ? 'Déjala vacía para conservar la credencial vigente.' : 'Se almacenará protegida al crear la integración.'}</span>
                </div>
              </div>
              <div className="modal-foot">
                <span className="modal-foot-note"><KeyRound size={15} /> Acceso restringido</span>
                <div className="modal-foot-actions">
                  <button type="button" className="btn btn-ghost" disabled={savingForm} onClick={() => { setShowUrbanoModal(false); resetUrf(); }}>Cancelar</button>
                  <button type="submit" className="btn btn-primary admin-form-submit" id="btn-save-urbano" disabled={savingForm}><Save size={15} /> {savingForm ? 'Guardando…' : editingUrbano ? 'Guardar cambios' : 'Vincular acceso'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ProfileModal
        open={showProfileModal}
        user={user}
        onClose={() => setShowProfileModal(false)}
        onSave={saveProfile}
        onPhotoUpload={saveProfilePhoto}
        onPhotoDelete={removeProfilePhoto}
      />
    </div>
  );
};

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../../../core/auth/authState';
import { resolveUserAvatar } from '../../../../core/auth/user-avatar';
import { showToast } from '../../../../core/utils/toast';
import { adminAccessService } from '../admin-access.service';
import type {
  AccessCatalog,
  SaveSystemUser,
  SiteOption,
  SystemUser,
  SystemUserDetail,
  SystemUserStatus,
} from '../types';
import styles from './UserAccessPanel.module.css';

type Props = { sites: SiteOption[] };

type UserForm = {
  name: string;
  username: string;
  password: string;
  roleCode: string;
  siteId: string;
  status: SystemUserStatus;
  moduleCodes: string[];
};

const emptyForm: UserForm = {
  name: '',
  username: '',
  password: '',
  roleCode: 'EncargadoOficina',
  siteId: '',
  status: 'activo',
  moduleCodes: [],
};

const eventLabels: Record<string, string> = {
  USUARIO_CREADO: 'Usuario creado',
  USUARIO_ACTUALIZADO: 'Datos y alcance actualizados',
  USUARIO_SUSPENDIDO: 'Usuario suspendido',
  USUARIO_PASSWORD_ACTUALIZADO: 'Contraseña actualizada',
  USUARIO_MODULOS_ACTUALIZADOS: 'Módulos visibles actualizados',
};

function formatDateTime(value: string | null): string {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function UserAccessPanel({ sites }: Props) {
  const { user: currentUser, updateUser } = useAuth();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [catalog, setCatalog] = useState<AccessCatalog>({ company: null, roles: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<SystemUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<SystemUser | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });

  const managedRoles = useMemo(() => catalog.roles.filter(role => role.managed), [catalog.roles]);
  const selectedRole = catalog.roles.find(role => role.code === form.roleCode);
  const editingOwnProtectedAccess = Boolean(
    editing?.protected && editing.id === currentUser?.id,
  );
  const activeSites = sites.filter(site => site.estado === 'activo');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, catalogData] = await Promise.all([
        adminAccessService.listUsers(),
        adminAccessService.getCatalog(),
      ]);
      setUsers(userData);
      setCatalog(catalogData);
    } catch (error: any) {
      showToast(error.response?.data?.mensaje || 'No se pudo cargar la administración de accesos.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    const defaultRole = managedRoles.find(role => role.scopeType === 'SEDE') ?? managedRoles[0];
    setEditing(null);
    setForm({
      ...emptyForm,
      roleCode: defaultRole?.code ?? 'EncargadoOficina',
      moduleCodes: defaultRole?.modules.map(module => module.code) ?? [],
    });
    setFormOpen(true);
  };

  const openEdit = (user: SystemUser) => {
    if (user.protected) {
      if (user.id !== currentUser?.id) {
        showToast('Las cuentas técnicas solo pueden gestionar su propia visibilidad.', 'warning');
        return;
      }
    }
    setEditing(user);
    setForm({
      name: user.name,
      username: user.username,
      password: '',
      roleCode: user.role.code,
      siteId: user.scope.siteId ? String(user.scope.siteId) : '',
      status: user.status,
      moduleCodes: user.protected && user.id === currentUser?.id
        ? currentUser.modulos_visibles ?? user.access.modules.map(module => module.code)
        : user.access.modules.map(module => module.code),
    });
    setFormOpen(true);
  };

  const openDetail = async (user: SystemUser) => {
    setDetail({ ...user, recentActivity: [] });
    setDetailLoading(true);
    try {
      setDetail(await adminAccessService.getUser(user.id));
    } catch (error: any) {
      showToast(error.response?.data?.mensaje || 'No se pudo cargar el detalle.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRole) return;
    if (editingOwnProtectedAccess) {
      setSaving(true);
      try {
        const result = await adminAccessService.updateMyModules(form.moduleCodes);
        updateUser?.({ modulos_visibles: result.modulos_visibles });
        showToast('La visibilidad de tu pantalla fue actualizada.', 'success');
        setFormOpen(false);
        await load();
      } catch (error: any) {
        showToast(error.response?.data?.mensaje || 'No se pudieron guardar tus módulos.', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (selectedRole.scopeType === 'SEDE' && !form.siteId) {
      showToast('Selecciona la sede que podrá operar este usuario.', 'warning');
      return;
    }
    const payload: SaveSystemUser = {
      nombre: form.name.trim(),
      usuario: form.username.trim(),
      role_code: form.roleCode,
      sede_id: selectedRole.scopeType === 'SEDE' ? Number(form.siteId) : null,
      estado: form.status,
      module_codes: form.moduleCodes,
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
    };
    setSaving(true);
    try {
      if (editing) {
        await adminAccessService.updateUser(editing.id, payload);
        showToast('Usuario y alcance actualizados.', 'success');
      } else {
        await adminAccessService.createUser(payload);
        showToast('Usuario empresarial creado.', 'success');
      }
      setFormOpen(false);
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.mensaje || 'No se pudo guardar el usuario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openPassword = (user: SystemUser) => {
    setPasswordTarget(user);
    setPasswordForm({ current: '', next: '', confirm: '' });
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordTarget) return;
    if (passwordForm.next !== passwordForm.confirm) {
      showToast('Las contraseñas nuevas no coinciden.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await adminAccessService.changePassword(passwordTarget.id, {
        nueva_password: passwordForm.next,
        password_actual: passwordForm.current,
      });
      showToast('Contraseña actualizada y registrada en auditoría.', 'success');
      setPasswordTarget(null);
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.mensaje || 'No se pudo actualizar la contraseña.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.panel} id="usuarios-panel">
      <header className={styles.panelHeader}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}><Users size={19} /></span>
          <div>
            <h2>Usuarios y accesos</h2>
            <p>Administra identidad, alcance, módulos autorizados y seguridad.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} /> Actualizar
          </button>
          <button className={styles.primaryButton} onClick={openCreate}>
            <UserPlus size={16} /> Nuevo usuario
          </button>
        </div>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Alcance</th>
              <th>Rol</th>
              <th>Accesos</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th>Seguridad</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className={styles.empty}>Cargando usuarios…</td></tr>}
            {!loading && users.length === 0 && (
              <tr><td colSpan={8} className={styles.empty}>No hay cuentas registradas.</td></tr>
            )}
            {!loading && users.map(user => (
              <tr key={user.id}>
                <td>
                  <button className={styles.identityButton} onClick={() => void openDetail(user)}>
                    <span className={user.protected ? styles.systemAvatar : styles.avatar}>
                      <img src={resolveUserAvatar(user)} alt={`Avatar de ${user.name}`} />
                    </span>
                    <span><strong>{user.name}</strong><small>@{user.username}</small></span>
                  </button>
                </td>
                <td>
                  <span className={styles.scope}><Building2 size={14} /> {user.scope.label}</span>
                  <small className={styles.muted}>{user.scope.type === 'SEDE' ? 'Sede asignada' : user.scope.type === 'EMPRESA' ? 'Toda la empresa' : 'Plataforma'}</small>
                </td>
                <td><span className={styles.role}>{user.role.name}</span></td>
                <td>
                  <button className={styles.accessButton} onClick={() => void openDetail(user)}>
                    {user.access.moduleCount} {user.access.moduleCount === 1 ? 'módulo' : 'módulos'} <ChevronRight size={14} />
                  </button>
                </td>
                <td><span className={user.status === 'activo' ? styles.activeStatus : styles.inactiveStatus}><i />{user.status === 'activo' ? 'Activo' : 'Suspendido'}</span></td>
                <td><span className={styles.dateValue}>{formatDateTime(user.lastAccessAt)}</span></td>
                <td><span className={styles.security}><ShieldCheck size={15} /> Contraseña configurada</span></td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.viewAction} aria-label={`Ver ${user.name}`} data-tooltip="Ver expediente" onClick={() => void openDetail(user)}><Eye size={15} /></button>
                    {(!user.protected || user.id === currentUser?.id) && <button className={styles.editAction} aria-label={`Editar ${user.name}`} data-tooltip={user.protected ? 'Personalizar mis módulos' : 'Editar acceso'} onClick={() => openEdit(user)}><Edit3 size={15} /></button>}
                    {(!user.protected || user.id === currentUser?.id) && (
                      <button className={styles.passwordAction} aria-label={`Cambiar contraseña de ${user.name}`} data-tooltip={user.id === currentUser?.id ? 'Cambiar mi contraseña' : 'Restablecer contraseña'} onClick={() => openPassword(user)}><KeyRound size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className={styles.overlay} onMouseDown={event => event.target === event.currentTarget && setFormOpen(false)}>
          <form className={styles.modal} onSubmit={save}>
            <header className={styles.modalHeader}>
              <div>
                <span>GESTIÓN DE ACCESO</span>
                <h3>{editingOwnProtectedAccess ? 'Personalizar mis módulos' : editing ? 'Editar usuario' : 'Nuevo usuario empresarial'}</h3>
                <p>{editingOwnProtectedAccess ? 'Define qué áreas operativas quieres visualizar en tu sesión.' : 'Define la identidad, función y ámbito autorizado.'}</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setFormOpen(false)}><X size={19} /></button>
            </header>
            <div className={styles.modalBody}>
              {!editingOwnProtectedAccess && <>
                <div className={styles.twoColumns}>
                  <label>Nombre completo<input required value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} placeholder="Ej. Juan Pérez" /></label>
                  <label>Usuario<input required value={form.username} onChange={e => setForm(current => ({ ...current, username: e.target.value }))} placeholder="juan.perez" autoCapitalize="none" /></label>
                </div>
                <div className={styles.twoColumns}>
                  <label>Rol<select value={form.roleCode} onChange={e => {
                    const nextRole = managedRoles.find(role => role.code === e.target.value);
                    setForm(current => ({
                      ...current,
                      roleCode: e.target.value,
                      siteId: '',
                      moduleCodes: nextRole?.modules.map(module => module.code) ?? [],
                    }));
                  }}>{managedRoles.map(role => <option value={role.code} key={role.code}>{role.name}</option>)}</select><small>{selectedRole?.description}</small></label>
                  <label>Sede<select value={form.siteId} disabled={selectedRole?.scopeType !== 'SEDE'} required={selectedRole?.scopeType === 'SEDE'} onChange={e => setForm(current => ({ ...current, siteId: e.target.value }))}><option value="">Seleccionar sede</option>{activeSites.map(site => <option key={site.id} value={site.id}>{site.nombre}</option>)}</select><small>{selectedRole?.scopeType === 'SEDE' ? 'Operará únicamente esta sede.' : 'El rol tiene alcance corporativo.'}</small></label>
                </div>
                <div className={styles.twoColumns}>
                  <label>Estado<select value={form.status} onChange={e => setForm(current => ({ ...current, status: e.target.value as SystemUserStatus }))}><option value="activo">Activo</option><option value="inactivo">Suspendido</option></select></label>
                  {!editing && <label>Contraseña inicial<input type="password" minLength={4} maxLength={72} required value={form.password} onChange={e => setForm(current => ({ ...current, password: e.target.value }))} placeholder="Mínimo 4 caracteres" /><small>Usa entre 4 y 72 caracteres.</small></label>}
                </div>
              </>}
              <fieldset className={styles.moduleSelector}>
                <legend>{editingOwnProtectedAccess ? 'Módulos visibles en el menú' : 'Accesos operativos'}</legend>
                <p>{editingOwnProtectedAccess ? 'Desmarca las áreas que no necesitas ver. Podrás habilitarlas nuevamente cuando quieras.' : 'Selecciona solamente los módulos necesarios para su función.'}</p>
                <div>
                  {selectedRole?.modules.map(module => {
                    const checked = form.moduleCodes.includes(module.code);
                    const required = editingOwnProtectedAccess && module.code === 'admin.panel.ver';
                    return (
                      <label key={module.code} className={checked ? styles.moduleOptionActive : styles.moduleOption}>
                        <input type="checkbox" checked={checked} disabled={required} onChange={() => setForm(current => ({
                          ...current,
                          moduleCodes: checked
                            ? current.moduleCodes.filter(code => code !== module.code)
                            : [...current.moduleCodes, module.code],
                        }))} />
                        <CheckCircle2 size={15} />
                        <span>{module.name}{required ? ' · obligatorio' : ''}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className={styles.accountNotice}><LockKeyhole size={17} /><span><strong>{editingOwnProtectedAccess ? 'Permisos protegidos' : 'Principio de mínimo acceso'}</strong>{editingOwnProtectedAccess ? 'Esta selección solo ordena tu menú; tus permisos administrativos permanecen activos.' : 'El rol define el límite y esta selección solo puede restringirlo.'}</span></div>
            </div>
            <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setFormOpen(false)}>Cancelar</button><button className={styles.primaryButton} disabled={saving}>{saving ? 'Guardando…' : editingOwnProtectedAccess ? 'Guardar visualización' : 'Guardar usuario'}</button></footer>
          </form>
        </div>
      )}

      {detail && (
        <div className={styles.drawerOverlay} onMouseDown={event => event.target === event.currentTarget && setDetail(null)}>
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="user-access-title">
            <header className={styles.drawerHeader}>
              <button className={styles.drawerClose} aria-label="Cerrar detalle" onClick={() => setDetail(null)}><X size={20} /></button>
              <div className={detail.protected ? styles.systemAvatarLarge : styles.avatarLarge}>
                <img src={resolveUserAvatar(detail)} alt={`Avatar de ${detail.name}`} />
              </div>
              <span className={styles.recordLabel}>EXPEDIENTE DE ACCESO</span>
              <h3 id="user-access-title">{detail.name}</h3>
              <p>@{detail.username}</p>
              <div className={styles.identityMeta}>
                <span className={detail.status === 'activo' ? styles.activeStatus : styles.inactiveStatus}><i />{detail.status === 'activo' ? 'Activo' : 'Suspendido'}</span>
                <span><ShieldCheck size={14} />{detail.role.name}</span>
              </div>
            </header>
            <div className={styles.drawerBody}>
              <section className={styles.detailSection}>
                <div className={styles.sectionHeading}><Building2 size={18} /><div><h4>Organización y alcance</h4><p>Responsabilidad asignada dentro de la plataforma.</p></div></div>
                <dl className={styles.factGrid}><div><dt>Tipo de cuenta</dt><dd>{detail.userType === 'SISTEMA' ? 'Sistema' : 'Empresa'}</dd></div><div><dt>Rol operativo</dt><dd>{detail.role.name}</dd></div><div><dt>Ámbito autorizado</dt><dd>{detail.scope.label}</dd></div></dl>
              </section>
              <section className={styles.detailSection}>
                <div className={styles.sectionHeading}><ShieldCheck size={18} /><div><h4>Accesos habilitados</h4><p>{detail.access.moduleCount} módulos disponibles para esta cuenta.</p></div></div>
                <div className={styles.moduleList}>{detail.access.modules.map(module => <span key={module.code}><CheckCircle2 size={14} />{module.name}</span>)}</div>
              </section>
              <section className={styles.detailSection}>
                <div className={styles.sectionHeading}><KeyRound size={18} /><div><h4>Seguridad de la cuenta</h4><p>Credenciales y últimos eventos de autenticación.</p></div></div>
                <dl className={styles.securityGrid}><div><dt>Último acceso</dt><dd>{formatDateTime(detail.lastAccessAt)}</dd></div><div><dt>Contraseña</dt><dd>Configurada</dd></div><div><dt>Último cambio</dt><dd>{formatDateTime(detail.passwordUpdatedAt)}</dd></div></dl>
              </section>
              <section className={styles.detailSection}>
                <div className={styles.sectionHeading}><Clock3 size={18} /><div><h4>Actividad reciente</h4><p>Trazabilidad administrativa de esta identidad.</p></div></div>
                {detailLoading ? <p className={styles.emptyActivity}>Cargando actividad…</p> : detail.recentActivity.length ? <div className={styles.timeline}>{detail.recentActivity.map((activity, index) => <div key={`${activity.createdAt}-${index}`}><Clock3 size={14} /><span><strong>{eventLabels[activity.event] ?? activity.event}</strong><small>{formatDateTime(activity.createdAt)}{activity.ip ? ` · ${activity.ip}` : ''}</small></span></div>)}</div> : <p className={styles.emptyActivity}>Aún no hay eventos administrativos registrados.</p>}
              </section>
            </div>
          </aside>
        </div>
      )}

      {passwordTarget && (
        <div className={styles.overlay} onMouseDown={event => event.target === event.currentTarget && setPasswordTarget(null)}>
          <form className={`${styles.modal} ${styles.passwordModal}`} onSubmit={changePassword}>
            <header className={styles.modalHeader}>
              <div><span>SEGURIDAD DE LA CUENTA</span><h3>{passwordTarget.id === currentUser?.id ? 'Cambiar mi contraseña' : 'Restablecer contraseña'}</h3><p>{passwordTarget.name} · @{passwordTarget.username}</p></div>
              <button type="button" aria-label="Cerrar" onClick={() => setPasswordTarget(null)}><X size={19} /></button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.passwordSummary}>
                <span className={styles.passwordTargetAvatar}>
                  <img src={resolveUserAvatar(passwordTarget)} alt={`Avatar de ${passwordTarget.name}`} />
                </span>
                <div><strong>Cambio protegido y auditable</strong><p>{passwordTarget.id === currentUser?.id ? 'Confirma tu contraseña actual antes de guardar.' : 'Confirma tu identidad de administrador para restablecer este acceso.'}</p></div>
              </div>
              <label>Tu contraseña de administrador<input type="password" required autoComplete="current-password" value={passwordForm.current} onChange={e => setPasswordForm(current => ({ ...current, current: e.target.value }))} /></label>
              <div className={styles.twoColumns}>
                <label>Nueva contraseña<input type="password" required minLength={4} maxLength={72} autoComplete="new-password" value={passwordForm.next} onChange={e => setPasswordForm(current => ({ ...current, next: e.target.value }))} /></label>
                <label>Confirmar contraseña<input type="password" required minLength={4} maxLength={72} autoComplete="new-password" value={passwordForm.confirm} onChange={e => setPasswordForm(current => ({ ...current, confirm: e.target.value }))} /></label>
              </div>
              <p className={styles.passwordPolicy}>La contraseña puede tener entre 4 y 72 caracteres.</p>
            </div>
            <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setPasswordTarget(null)}>Cancelar</button><button className={styles.primaryButton} disabled={saving}><LockKeyhole size={15} />{saving ? 'Actualizando…' : 'Actualizar contraseña'}</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}

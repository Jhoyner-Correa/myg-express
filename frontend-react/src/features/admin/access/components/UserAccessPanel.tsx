import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { showConfirm, showToast } from '../../../../core/utils/toast';
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
};

const emptyForm: UserForm = {
  name: '',
  username: '',
  password: '',
  roleCode: 'EncargadoOficina',
  siteId: '',
  status: 'activo',
};

const eventLabels: Record<string, string> = {
  USUARIO_CREADO: 'Usuario creado',
  USUARIO_ACTUALIZADO: 'Datos y alcance actualizados',
  USUARIO_SUSPENDIDO: 'Usuario suspendido',
};

function formatDateTime(value: string | null): string {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export function UserAccessPanel({ sites }: Props) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [catalog, setCatalog] = useState<AccessCatalog>({ company: null, roles: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<SystemUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const managedRoles = useMemo(() => catalog.roles.filter(role => role.managed), [catalog.roles]);
  const selectedRole = managedRoles.find(role => role.code === form.roleCode);
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
    setForm({ ...emptyForm, roleCode: defaultRole?.code ?? 'EncargadoOficina' });
    setFormOpen(true);
  };

  const openEdit = (user: SystemUser) => {
    if (user.protected) {
      showToast('Las cuentas técnicas se protegen y no se editan desde este formulario.', 'warning');
      return;
    }
    setEditing(user);
    setForm({
      name: user.name,
      username: user.username,
      password: '',
      roleCode: user.role.code,
      siteId: user.scope.siteId ? String(user.scope.siteId) : '',
      status: user.status,
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

  const suspend = async (user: SystemUser) => {
    const confirmed = await showConfirm({
      title: 'Suspender usuario',
      message: `${user.name} perderá el acceso al sistema, pero su historial permanecerá disponible.`,
      confirmText: 'Suspender acceso',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await adminAccessService.suspendUser(user.id);
      showToast('Acceso suspendido correctamente.', 'success');
      setDetail(null);
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.mensaje || 'No se pudo suspender el usuario.', 'error');
    }
  };

  return (
    <section className={styles.panel} id="usuarios-panel">
      <header className={styles.panelHeader}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}><Users size={19} /></span>
          <div>
            <h2>Usuarios y accesos</h2>
            <p>Identidad, rol y alcance operativo de las cuentas del sistema.</p>
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
                    <span className={user.protected ? styles.systemAvatar : styles.avatar}>{initials(user.name)}</span>
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
                    <button aria-label={`Ver ${user.name}`} title="Ver detalle" onClick={() => void openDetail(user)}><ChevronRight size={16} /></button>
                    {!user.protected && <button aria-label={`Editar ${user.name}`} title="Editar usuario" onClick={() => openEdit(user)}><Edit3 size={15} /></button>}
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
              <div><span>GESTIÓN DE ACCESO</span><h3>{editing ? 'Editar usuario' : 'Nuevo usuario empresarial'}</h3><p>Define la identidad, función y ámbito autorizado.</p></div>
              <button type="button" aria-label="Cerrar" onClick={() => setFormOpen(false)}><X size={19} /></button>
            </header>
            <div className={styles.modalBody}>
              <div className={styles.twoColumns}>
                <label>Nombre completo<input required value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} placeholder="Ej. Juan Pérez" /></label>
                <label>Usuario<input required value={form.username} onChange={e => setForm(current => ({ ...current, username: e.target.value }))} placeholder="juan.perez" autoCapitalize="none" /></label>
              </div>
              <div className={styles.twoColumns}>
                <label>Rol<select value={form.roleCode} onChange={e => setForm(current => ({ ...current, roleCode: e.target.value, siteId: '' }))}>{managedRoles.map(role => <option value={role.code} key={role.code}>{role.name}</option>)}</select><small>{selectedRole?.description}</small></label>
                <label>Sede<select value={form.siteId} disabled={selectedRole?.scopeType !== 'SEDE'} required={selectedRole?.scopeType === 'SEDE'} onChange={e => setForm(current => ({ ...current, siteId: e.target.value }))}><option value="">Seleccionar sede</option>{activeSites.map(site => <option key={site.id} value={site.id}>{site.nombre}</option>)}</select><small>{selectedRole?.scopeType === 'SEDE' ? 'Operará únicamente esta sede.' : 'El rol tiene alcance corporativo.'}</small></label>
              </div>
              <div className={styles.twoColumns}>
                <label>Estado<select value={form.status} onChange={e => setForm(current => ({ ...current, status: e.target.value as SystemUserStatus }))}><option value="activo">Activo</option><option value="inactivo">Suspendido</option></select></label>
                <label>{editing ? 'Nueva contraseña (opcional)' : 'Contraseña temporal'}<input type="password" minLength={8} required={!editing} value={form.password} onChange={e => setForm(current => ({ ...current, password: e.target.value }))} placeholder={editing ? 'Conservar contraseña actual' : 'Mínimo 8 caracteres'} /></label>
              </div>
              <div className={styles.accountNotice}><LockKeyhole size={17} /><span><strong>Cuenta empresarial</strong>Los usuarios técnicos del sistema se administran fuera de este formulario.</span></div>
            </div>
            <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setFormOpen(false)}>Cancelar</button><button className={styles.primaryButton} disabled={saving}>{saving ? 'Guardando…' : 'Guardar usuario'}</button></footer>
          </form>
        </div>
      )}

      {detail && (
        <div className={styles.drawerOverlay} onMouseDown={event => event.target === event.currentTarget && setDetail(null)}>
          <aside className={styles.drawer}>
            <header className={styles.drawerHeader}><div className={detail.protected ? styles.systemAvatarLarge : styles.avatarLarge}>{initials(detail.name)}</div><div><h3>{detail.name}</h3><p>@{detail.username}</p><span className={detail.status === 'activo' ? styles.activeStatus : styles.inactiveStatus}><i />{detail.status === 'activo' ? 'Activo' : 'Suspendido'}</span></div><button aria-label="Cerrar detalle" onClick={() => setDetail(null)}><X size={20} /></button></header>
            <div className={styles.drawerBody}>
              <section><h4>Organización y alcance</h4><dl><div><dt>Tipo de cuenta</dt><dd>{detail.userType === 'SISTEMA' ? 'Sistema' : 'Empresa'}</dd></div><div><dt>Rol</dt><dd>{detail.role.name}</dd></div><div><dt>Ámbito</dt><dd>{detail.scope.label}</dd></div></dl></section>
              <section><h4>Accesos</h4><div className={styles.moduleList}>{detail.access.modules.map(module => <span key={module.code}><CheckCircle2 size={14} />{module.name}</span>)}</div></section>
              <section><h4>Seguridad</h4><dl><div><dt>Último acceso</dt><dd>{formatDateTime(detail.lastAccessAt)}</dd></div><div><dt>Contraseña</dt><dd>Configurada</dd></div><div><dt>Último cambio</dt><dd>{formatDateTime(detail.passwordUpdatedAt)}</dd></div></dl></section>
              <section><h4>Actividad reciente</h4>{detailLoading ? <p className={styles.muted}>Cargando actividad…</p> : detail.recentActivity.length ? <div className={styles.timeline}>{detail.recentActivity.map((activity, index) => <div key={`${activity.createdAt}-${index}`}><Clock3 size={14} /><span><strong>{eventLabels[activity.event] ?? activity.event}</strong><small>{formatDateTime(activity.createdAt)}{activity.ip ? ` · ${activity.ip}` : ''}</small></span></div>)}</div> : <p className={styles.muted}>Aún no hay eventos administrativos registrados.</p>}</section>
            </div>
            {!detail.protected && <footer className={styles.drawerFooter}><button className={styles.secondaryButton} onClick={() => openEdit(detail)}><Edit3 size={15} /> Editar usuario</button>{detail.status === 'activo' && <button className={styles.dangerButton} onClick={() => void suspend(detail)}>Suspender acceso</button>}</footer>}
          </aside>
        </div>
      )}
    </section>
  );
}

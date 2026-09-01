import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, Bell, Building2, CalendarDays, ChevronDown, ChevronRight, CircleHelp, FileClock, Search, Settings, ShieldCheck, UserX, X } from 'lucide-react';
import type { UserSession } from '../../../core/auth/authState';
import { resolveUserAvatar } from '../../../core/auth/user-avatar';
import type { Site } from '../types';
import type { ExecutiveAlert } from './executive-alerts';
import styles from './RrhhExecutiveHeader.module.css';

type MonthOption = { key: string; label: string };

type Props = {
  user: UserSession | null;
  sites: Site[];
  canViewAllSites: boolean;
  siteId: number | null;
  month: string;
  months: MonthOption[];
  query: string;
  alerts: ExecutiveAlert[];
  onSiteChange: (siteId: number | null) => void;
  onMonthChange: (month: string) => void;
  onQueryChange: (query: string) => void;
  onAlertSelect: (target: string) => void;
  onAlertsClick: () => void;
  onOpenProfile?: () => void;
  compact?: boolean;
  showSite?: boolean;
  showSearch?: boolean;
  showPeriod?: boolean;
  contextLabel?: string;
  searchPlaceholder?: string;
};

function displayName(name?: string) {
  const normalizedName = name?.trim();
  if (!normalizedName) return 'Administrador';

  return normalizedName
    .toLocaleLowerCase('es')
    .replace(/(^|[\s'-])\p{L}/gu, letter => letter.toLocaleUpperCase('es'));
}

function accessScope(user: UserSession | null) {
  if (user?.alcance === 'SISTEMA') return 'Toda la plataforma';
  if (user?.alcance === 'EMPRESA') return 'Toda la empresa';
  return user?.sede_nombre || 'Sede asignada';
}

export function RrhhExecutiveHeader({
  user,
  sites,
  canViewAllSites,
  siteId,
  month,
  months,
  query,
  alerts,
  onSiteChange,
  onMonthChange,
  onQueryChange,
  onAlertSelect,
  onAlertsClick,
  onOpenProfile,
  compact = false,
  showSite = true,
  showSearch = true,
  showPeriod = true,
  contextLabel = 'Recursos Humanos',
  searchPlaceholder = 'Buscar en asistencia...',
}: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const roleLabel = user?.rol_label || user?.rol || 'Administrador general';
  const userDisplayName = displayName(user?.nombre);
  const userAvatar = resolveUserAvatar(user);
  const alertCount = alerts.length;

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('es') === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    if (!profileOpen && !notificationsOpen && !helpOpen) return;

    const closeFloatingPanels = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node) && !profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
      if (!helpRef.current?.contains(event.target as Node)) setHelpOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        setNotificationsOpen(false);
        setHelpOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeFloatingPanels);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFloatingPanels);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [helpOpen, notificationsOpen, profileOpen]);

  useEffect(() => {
    if (!profileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [profileOpen]);

  return (
    <div className={styles.tools} data-compact={compact || undefined}>
      {!compact && <>
      {showSite && <label className={styles.selectControl} title="Filtrar por sede">
        <Building2 aria-hidden="true" />
        <select aria-label="Alcance de sede" value={siteId ?? 'all'} onChange={event => onSiteChange(event.target.value === 'all' ? null : Number(event.target.value))}>
          {canViewAllSites && <option value="all">Todas las sedes</option>}
          {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </label>}

      {showPeriod && <label className={styles.selectControl} title="Cambiar periodo">
        <CalendarDays aria-hidden="true" />
        <select aria-label="Mes de la agenda" value={month} onChange={event => onMonthChange(event.target.value)}>
          {months.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </label>}

      {showSearch && <label className={styles.searchControl}>
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Buscar colaboradores en la asistencia del resumen"
        />
        {query
          ? <button type="button" aria-label="Limpiar búsqueda" onClick={() => { onQueryChange(''); searchRef.current?.focus(); }}><X /></button>
          : <kbd aria-hidden="true">Ctrl K</kbd>}
      </label>}
      </>}

      <div className={styles.notifications} ref={notificationsRef}>
        <button
          className={styles.notificationButton}
          data-active={alertCount > 0}
          type="button"
          aria-label={`Notificaciones: ${alertCount} pendientes`}
          aria-haspopup="dialog"
          aria-expanded={notificationsOpen}
          title="Abrir notificaciones"
          onClick={() => {
            setNotificationsOpen(open => !open);
            setProfileOpen(false);
            setHelpOpen(false);
          }}
        >
          <Bell aria-hidden="true" />
          {alertCount > 0 && (
            <span className={styles.notificationCount} aria-live="polite">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        {notificationsOpen && <section className={styles.notificationPanel} role="dialog" aria-label="Centro de notificaciones">
          <header className={styles.notificationHeader}>
            <div>
              <strong>Notificaciones</strong>
              <small>Seguimiento de {contextLabel}</small>
            </div>
            <span>{alertCount} {alertCount === 1 ? 'pendiente' : 'pendientes'}</span>
          </header>

          <div className={styles.notificationList}>
            {alerts.slice(0, 5).map(alert => <button
              key={alert.id}
              className={styles.notificationItem}
              type="button"
              onClick={() => {
                setNotificationsOpen(false);
                onAlertSelect(alert.target);
              }}
            >
              <span className={`${styles.alertIcon} ${styles[alert.tone]}`} aria-hidden="true">
                {alert.kind === 'request' ? <FileClock /> : alert.tone === 'warning' ? <AlertTriangle /> : <UserX />}
              </span>
              <span className={styles.alertCopy}>
                <strong>{alert.title}</strong>
                <small>{alert.site} · {alert.time}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>)}
            {alertCount === 0 && <div className={styles.notificationEmpty}>
              <span><Bell aria-hidden="true" /></span>
              <strong>Todo está al día</strong>
              <small>No existen incidencias pendientes de revisión.</small>
            </div>}
          </div>

          {alertCount > 0 && <button className={styles.notificationFooter} type="button" onClick={() => {
            setNotificationsOpen(false);
            onAlertsClick();
          }}>
            Ver todas las alertas
            <ArrowRight aria-hidden="true" />
          </button>}
        </section>}
      </div>

      <div className={styles.help} ref={helpRef}>
        <button
          className={styles.helpButton}
          type="button"
          aria-label={`Abrir ayuda de ${contextLabel}`}
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          title="Ayuda"
          onClick={() => {
            setHelpOpen(open => !open);
            setNotificationsOpen(false);
            setProfileOpen(false);
          }}
        >
          <CircleHelp aria-hidden="true" />
        </button>

        {helpOpen && <section className={styles.helpPanel} role="dialog" aria-label={`Ayuda de ${contextLabel}`}>
          <header>
            <span><CircleHelp aria-hidden="true" /></span>
            <div>
              <strong>Ayuda de {contextLabel}</strong>
              <small>Accesos rápidos del panel</small>
            </div>
          </header>
          <div className={styles.helpItems}>
            {contextLabel === 'Administración central' ? <>
              <div><ShieldCheck aria-hidden="true" /><span><strong>Acciones protegidas</strong><small>Los cambios sensibles requieren confirmar la identidad.</small></span></div>
              <div><Building2 aria-hidden="true" /><span><strong>Administración por áreas</strong><small>Gestiona sedes, integraciones y usuarios por separado.</small></span></div>
              <div><Settings aria-hidden="true" /><span><strong>Trazabilidad</strong><small>Los cambios de acceso y contraseña quedan auditados.</small></span></div>
            </> : <>
              <div><Search aria-hidden="true" /><span><strong>Buscar información</strong><small>Presiona Ctrl K desde cualquier sección.</small></span></div>
              <div><Building2 aria-hidden="true" /><span><strong>Cambiar alcance</strong><small>Filtra la información por sede.</small></span></div>
              <div><CalendarDays aria-hidden="true" /><span><strong>Cambiar periodo</strong><small>Selecciona el mes que deseas revisar.</small></span></div>
            </>}
          </div>
        </section>}
      </div>

      <div className={styles.profile} ref={profileRef}>
        <button
          className={styles.profileTrigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          aria-label={profileOpen ? 'Cerrar menú de sesión' : 'Abrir menú de sesión'}
          onClick={() => {
            setProfileOpen(open => !open);
            setNotificationsOpen(false);
            setHelpOpen(false);
          }}
        >
          <span className={styles.avatar}><img src={userAvatar} alt="" /></span>
          <span className={styles.profileCopy}>
            <strong>{userDisplayName}</strong>
            <small>{roleLabel}</small>
          </span>
          <ChevronDown className={profileOpen ? styles.rotated : ''} aria-hidden="true" />
        </button>

        {profileOpen && createPortal(<>
          <button
            className={styles.profileBackdrop}
            type="button"
            aria-label="Cerrar menú de perfil"
            onClick={() => setProfileOpen(false)}
          />
          <div ref={profileMenuRef} className={styles.profileMenu} role="menu">
          <header>
            <span className={styles.menuAvatar}><img src={userAvatar} alt="" /></span>
            <div className={styles.menuIdentity}>
              <strong>{userDisplayName}</strong>
              <small>@{user?.usuario || 'usuario'}</small>
              <span className={styles.roleBadge}>
                <ShieldCheck aria-hidden="true" />
                {roleLabel}
              </span>
            </div>
          </header>
          <div className={styles.sessionDetails}>
            <div className={styles.detailRow}>
              <span className={styles.detailIcon}><ShieldCheck aria-hidden="true" /></span>
              <small>Rol</small>
              <strong>{roleLabel}</strong>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailIcon}><Building2 aria-hidden="true" /></span>
              <small>Alcance</small>
              <strong>{accessScope(user)}</strong>
            </div>
          </div>
          <div className={styles.menuActions}>
            <button className={styles.profileSettingsButton} type="button" role="menuitem" onClick={() => { setProfileOpen(false); onOpenProfile?.(); }}>
              <span className={styles.actionIcon}><Settings aria-hidden="true" /></span>
              <span>Configuración de mi perfil</span>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          </div>
        </>, document.body)}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, Building2, CalendarDays, ChevronDown, FileClock, LogOut, Search, ShieldCheck, UserX, X } from 'lucide-react';
import type { UserSession } from '../../../core/auth/authState';
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
  onLogout: () => void;
};

function initials(name?: string) {
  return (name || 'AD')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toLocaleUpperCase('es');
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
  onLogout,
}: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const roleLabel = user?.rol_label || user?.rol || 'Administrador general';
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
    if (!profileOpen && !notificationsOpen) return;

    const closeFloatingPanels = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeFloatingPanels);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeFloatingPanels);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [notificationsOpen, profileOpen]);

  return (
    <div className={styles.tools}>
      <label className={styles.selectControl} title="Filtrar por sede">
        <Building2 aria-hidden="true" />
        <select aria-label="Alcance de sede" value={siteId ?? 'all'} onChange={event => onSiteChange(event.target.value === 'all' ? null : Number(event.target.value))}>
          {canViewAllSites && <option value="all">Todas las sedes</option>}
          {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </label>

      <label className={styles.selectControl} title="Cambiar periodo">
        <CalendarDays aria-hidden="true" />
        <select aria-label="Mes de la agenda" value={month} onChange={event => onMonthChange(event.target.value)}>
          {months.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </label>

      <label className={styles.searchControl}>
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder="Buscar empleados, documentos..."
          aria-label="Buscar en el resumen de Recursos Humanos"
        />
        {query
          ? <button type="button" aria-label="Limpiar búsqueda" onClick={() => { onQueryChange(''); searchRef.current?.focus(); }}><X /></button>
          : <kbd aria-hidden="true">Ctrl K</kbd>}
      </label>

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
          }}
        >
          <Bell aria-hidden="true" />
          {alertCount > 0 && <span aria-live="polite">{alertCount > 9 ? '9+' : alertCount}</span>}
        </button>

        {notificationsOpen && <section className={styles.notificationPanel} role="dialog" aria-label="Centro de notificaciones">
          <header className={styles.notificationHeader}>
            <div>
              <strong>Notificaciones</strong>
              <small>Seguimiento de Recursos Humanos</small>
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
          }}
        >
          <span className={styles.avatar}>{initials(user?.nombre)}<i aria-hidden="true" /></span>
          <span className={styles.profileCopy}>
            <strong>{user?.nombre || 'Administrador'}</strong>
            <small>{roleLabel}</small>
          </span>
          <ChevronDown className={profileOpen ? styles.rotated : ''} aria-hidden="true" />
        </button>

        {profileOpen && <div className={styles.profileMenu} role="menu">
          <header>
            <span className={styles.menuAvatar}>{initials(user?.nombre)}</span>
            <div><strong>{user?.nombre || 'Administrador'}</strong><small>@{user?.usuario || 'usuario'}</small></div>
          </header>
          <div className={styles.sessionDetails}>
            <span><ShieldCheck aria-hidden="true" /><small>Rol</small><strong>{roleLabel}</strong></span>
            <span><Building2 aria-hidden="true" /><small>Alcance</small><strong>{accessScope(user)}</strong></span>
          </div>
          <button className={styles.logoutButton} type="button" role="menuitem" onClick={onLogout}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>}
      </div>
    </div>
  );
}

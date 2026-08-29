import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, BadgeCheck, BriefcaseBusiness, CalendarClock, CalendarDays, Camera, CheckCircle2,
  Clock3, FileText, Fingerprint, History, Home, KeyRound, Laptop, Mail, MapPin,
  MessageSquareText, Phone, ShieldCheck, Smartphone, Trash2, UserRound, UserX, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import axios from 'axios';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import { calculateEmploymentTenure, dateInPeru, formatEmploymentTenure } from '../employment-tenure';
import type { Employee, EmployeeOperationalProfile, EmployeeStatus } from '../types';
import { getEmployeeAvatarUrl } from './employee-avatar';
import { formatDurationMinutes } from './attendance-formatters';
import styles from './EmployeeProfileDrawer.module.css';

export type EmployeeProfileTab = 'summary' | 'access' | 'activity';
export type EmployeeProfileOperation = 'status' | null;

type Props = {
  employee: Employee | null;
  initialTab?: EmployeeProfileTab;
  initialOperation?: EmployeeProfileOperation;
  canManage: boolean;
  onClose: () => void;
  onActivate: (employee: Employee) => void;
  onChanged: () => Promise<void>;
};

const sectionMeta: Record<EmployeeProfileTab, { label: string; description: string; icon: typeof UserRound }> = {
  summary: { label: 'Perfil del colaborador', description: 'Información personal, laboral y situación operativa.', icon: UserRound },
  access: { label: 'Acceso móvil', description: 'Administración del equipo vinculado y seguridad.', icon: Smartphone },
  activity: { label: 'Actividad del colaborador', description: 'Historial auditable de acciones administrativas.', icon: History },
};

const statusLabel: Record<EmployeeStatus, string> = {
  ACTIVO: 'Activo', INACTIVO: 'Inactivo', SUSPENDIDO: 'Suspendido',
};

const eventLabels: Record<string, string> = {
  ACTIVACION_DISPOSITIVO: 'Aplicación móvil activada',
  REVOCACION_DISPOSITIVO: 'Acceso móvil revocado',
  CAMBIO_ESTADO_EMPLEADO: 'Estado laboral actualizado',
  MARCACION_ASISTENCIA: 'Asistencia registrada',
  CORRECCION_ASISTENCIA: 'Asistencia corregida',
  FOTO_PERFIL_EMPLEADO: 'Foto de perfil actualizada',
};

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', withTime
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }
    : { dateStyle: 'medium', timeZone: 'America/Lima' }).format(date);
}

function ProfileField({ icon: Icon, label, value, wide = false }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  wide?: boolean;
}) {
  const unavailable = value === 'No registrado' || value === 'No registrada' || value === '—';
  return <div className={`${styles.profileField} ${wide ? styles.profileFieldWide : ''}`}>
    <span className={styles.profileFieldIcon}><Icon aria-hidden="true" /></span>
    <div>
      <dt>{label}</dt>
      <dd className={unavailable ? styles.unavailableValue : undefined}>{value}</dd>
    </div>
  </div>;
}

export function EmployeeProfileDrawer({
  employee, initialTab = 'summary', initialOperation = null, canManage, onClose, onActivate, onChanged,
}: Props) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<EmployeeProfileTab>(initialTab);
  const [profile, setProfile] = useState<EmployeeOperationalProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [operation, setOperation] = useState<'status' | 'revoke' | 'photo-delete' | null>(null);
  const [targetStatus, setTargetStatus] = useState<EmployeeStatus>('SUSPENDIDO');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);

  const loadProfile = async (employeeId: number, signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setProfile(await rrhhService.getEmployeeOperationalProfile(employeeId, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  };

  useEffect(() => {
    if (!employee) return;
    const controller = new AbortController();
    setTab(initialTab);
    setOperation(initialOperation);
    setTargetStatus(employee.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO');
    setReason(''); setProfile(null); setPhotoFailed(false);
    void loadProfile(employee.id, controller.signal);
    return () => controller.abort();
  }, [employee, initialOperation, initialTab]);

  useEffect(() => {
    if (!employee) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.requestAnimationFrame(() => drawerRef.current?.focus());
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [employee, onClose]);

  if (!employee) return null;

  const submitOperation = async () => {
    if (!operation) return;
    if (operation !== 'photo-delete' && reason.trim().length < 3) {
      showToast('Indica un motivo de al menos 3 caracteres.', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (operation === 'photo-delete') {
        await rrhhService.deleteEmployeePhoto(employee.id);
        setPhotoFailed(false);
        showToast('Foto de perfil eliminada.', 'success');
      } else if (operation === 'revoke') {
        await rrhhService.revokeEmployeeDevice(employee.id, reason.trim());
        showToast('Acceso móvil y sesiones revocados.', 'success');
      } else {
        const result = await rrhhService.setEmployeeStatus(employee.id, targetStatus, reason.trim());
        showToast(result.mobile_access_revoked
          ? 'Estado actualizado y acceso móvil cerrado por seguridad.'
          : 'Estado laboral actualizado.', 'success');
      }
      setOperation(null); setReason('');
      await Promise.all([loadProfile(employee.id), onChanged()]);
    } catch (saveError) {
      showToast(getApiErrorMessage(saveError, 'No se pudo completar la acción.'), 'error');
    } finally { setSaving(false); }
  };

  const handlePhotoSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Selecciona una imagen JPG, PNG o WebP.', 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('La foto no puede superar los 2 MB.', 'warning');
      return;
    }
    setPhotoSaving(true);
    try {
      await rrhhService.uploadEmployeePhoto(employee.id, file);
      setPhotoFailed(false);
      showToast('Foto de perfil actualizada.', 'success');
      await Promise.all([loadProfile(employee.id), onChanged()]);
    } catch (uploadError) {
      showToast(getApiErrorMessage(uploadError, 'No se pudo actualizar la foto.'), 'error');
    } finally {
      setPhotoSaving(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const activeEmployee = profile?.employee;
  const currentStatus = activeEmployee?.status ?? employee.estado;
  const profilePhoto = activeEmployee?.photo || employee.foto || null;
  const tenureEndDate = activeEmployee?.termination_date || dateInPeru();
  const employmentTenure = formatEmploymentTenure(
    calculateEmploymentTenure(activeEmployee?.admission_date, tenureEndDate),
  );
  const activeSection = sectionMeta[tab];
  const ActiveSectionIcon = activeSection.icon;

  return createPortal(<div className={styles.overlay} onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <div className={styles.avatarControl}>
            <span className={`${styles.avatar} ${!profilePhoto || photoFailed ? styles.avatarFallback : ''}`}>
              {profilePhoto && !photoFailed
                ? <img src={profilePhoto} alt={`Foto de ${employee.nombres} ${employee.apellidos}`} onError={() => setPhotoFailed(true)} />
                : <img
                    src={getEmployeeAvatarUrl(employee)}
                    alt=""
                    aria-hidden="true"
                  />}
            </span>
            {canManage && <>
              <input
                ref={photoInputRef}
                className={styles.photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => void handlePhotoSelected(event.target.files?.[0])}
              />
              <button
                type="button"
                className={styles.photoButton}
                disabled={photoSaving}
                aria-label={profilePhoto ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
                title={profilePhoto ? 'Cambiar foto' : 'Agregar foto'}
                onClick={() => photoInputRef.current?.click()}
              ><Camera /></button>
              {profilePhoto && !photoFailed && <button
                type="button"
                className={styles.photoRemoveButton}
                disabled={photoSaving}
                aria-label="Eliminar foto de perfil"
                title="Eliminar foto"
                onClick={() => setOperation('photo-delete')}
              ><Trash2 /></button>}
            </>}
          </div>
          <div>
            <span className={styles.eyebrow}>{employee.codigoEmpleado}</span>
            <h2 id={titleId}>{employee.nombres} {employee.apellidos}</h2>
            <p>{employee.cargoNombre} · {employee.sedeNombre}</p>
          </div>
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar perfil" onClick={onClose}><X /></button>
      </header>

      <div className={styles.statusBar}>
        <span className={`${styles.status} ${styles[`status${currentStatus}`]}`}><i />{statusLabel[currentStatus]}</span>
        <span><MapPin />{employee.sedeNombre || 'Sin sede'}</span>
        <span>{employee.tipoRastreo === 'SOLO_MARCACION' ? <Fingerprint /> : <Activity />}{employee.tipoRastreo === 'CONTINUO' ? 'Rastreo continuo' : employee.tipoRastreo === 'SOLO_MARCACION' ? 'Solo marcación' : 'Sin rastreo'}</span>
      </div>

      {tab !== 'summary' && <div className={styles.sectionHeading}>
        <span><ActiveSectionIcon /></span>
        <div><h3>{activeSection.label}</h3><p>{activeSection.description}</p></div>
      </div>}

      <div className={styles.body}>
        {loading && !profile ? <div className={styles.loading}>Consultando información operativa…</div> : error ? <div className={styles.error}><p>{getApiErrorMessage(error, 'No se pudo cargar el perfil.')}</p><button type="button" onClick={() => void loadProfile(employee.id)}>Reintentar</button></div> : profile && <>
          {tab === 'summary' && <div className={styles.sectionStack}>
            <div className={styles.profileLayout}>
              <section className={styles.profileCard}>
                <header className={styles.profileCardHeader}>
                  <span className={styles.profileCardIcon}><BriefcaseBusiness /></span>
                  <div><span className={styles.sectionNumber}>01</span><h3>Datos personales y laborales</h3></div>
                </header>

                <div className={styles.profileGroup}>
                  <dl className={styles.profileDetails}>
                    <ProfileField icon={FileText} label="DNI / documento" value={activeEmployee?.document || 'No registrado'} />
                    <ProfileField icon={BadgeCheck} label="RUC" value={activeEmployee?.ruc || 'No registrado'} />
                    <ProfileField icon={Phone} label="Teléfono" value={activeEmployee?.phone || 'No registrado'} />
                    <ProfileField icon={Mail} label="Correo electrónico" value={activeEmployee?.email || 'No registrado'} />
                    <ProfileField icon={Home} label="Dirección declarada" value={activeEmployee?.address || 'No registrada'} wide />
                  </dl>
                </div>

                <footer className={styles.employmentMeta}>
                  <div><CalendarDays /><span><small>Fecha de ingreso</small><strong>{formatDate(activeEmployee?.admission_date)}</strong></span></div>
                  <div><CalendarClock /><span><small>{activeEmployee?.termination_date ? 'Antigüedad al cese' : 'Antigüedad laboral'}</small><strong>{employmentTenure}</strong></span></div>
                  <div><History /><span><small>Última actualización</small><strong>{formatDate(activeEmployee?.updated_at, true)}</strong></span></div>
                </footer>
              </section>

              <section className={`${styles.profileCard} ${styles.operationalCard}`}>
                <header className={styles.profileCardHeader}>
                  <span className={`${styles.profileCardIcon} ${styles.operationalIcon}`}><Activity /></span>
                  <div><span className={styles.sectionNumber}>02</span><h3>Control operativo</h3></div>
                </header>

                <div className={styles.lastAttendance}>
                  <span><CalendarDays /></span>
                  <div><small>Última asistencia registrada</small><strong>{formatDate(profile.attendance.last_attendance_date)}</strong></div>
                </div>

                <div className={styles.operationalMetrics}>
                  <article>
                    <span className={styles.metricIcon}><Clock3 /></span>
                    <div><small>Tardanza acumulada</small><strong>{formatDurationMinutes(profile.attendance.delay_minutes)}</strong></div>
                  </article>
                  <article>
                    <span className={`${styles.metricIcon} ${styles.absenceIcon}`}><UserX /></span>
                    <div><small>Ausencias registradas</small><strong>{profile.attendance.absent_days}</strong></div>
                  </article>
                </div>

                <div className={styles.observationBlock}>
                  <MessageSquareText />
                  <div><small>Observaciones internas</small><p>{activeEmployee?.notes || 'Sin observaciones registradas.'}</p></div>
                </div>
              </section>
            </div>
          </div>}

          {tab === 'access' && <div className={styles.sectionStack}>
            <section className={styles.infoCard}>
              <header><ShieldCheck /><div><h3>Seguridad móvil</h3><p>Dispositivo vinculado y sesiones de la aplicación.</p></div></header>
              {profile.mobile ? <dl className={styles.infoGrid}>
                <div><dt>Estado</dt><dd>{profile.mobile.status}</dd></div>
                <div><dt>Sesiones activas</dt><dd>{profile.mobile.active_sessions}</dd></div>
                <div><dt>Equipo</dt><dd>{[profile.mobile.brand, profile.mobile.model].filter(Boolean).join(' ') || 'No informado'}</dd></div>
                <div><dt>Android / app</dt><dd>{profile.mobile.os_version || '—'} / {profile.mobile.app_version || '—'}</dd></div>
                <div><dt>Biometría registrada</dt><dd>{formatDate(profile.mobile.biometric_registered_at, true)}</dd></div>
                <div><dt>Último acceso</dt><dd>{formatDate(profile.mobile.last_access_at, true)}</dd></div>
              </dl> : <div className={styles.empty}><Laptop />Este colaborador aún no tiene un celular vinculado.</div>}
              {canManage && <div className={styles.cardActions}>
                <button type="button" onClick={() => onActivate(employee)}><KeyRound />{profile.mobile?.status === 'AUTORIZADO' ? 'Renovar credenciales' : 'Generar acceso'}</button>
                {profile.mobile?.status === 'AUTORIZADO' && <button type="button" className={styles.dangerButton} onClick={() => { setOperation('revoke'); setReason(''); }}><X />Revocar acceso</button>}
              </div>}
            </section>
          </div>}

          {tab === 'activity' && <section className={styles.activitySection}>
            <header><History /><div><h3>Actividad reciente</h3><p>Registro auditable de seguridad y administración.</p></div></header>
            {!profile.audit.length ? <div className={styles.empty}>Todavía no existen eventos auditables.</div> : <ol className={styles.timeline}>
              {profile.audit.map(event => <li key={event.id}><span><CheckCircle2 /></span><div><strong>{eventLabels[event.event_type] || event.event_type.replaceAll('_', ' ')}</strong><p>{event.actor_name ? `Realizado por ${event.actor_name}` : 'Evento generado por el sistema'} · {event.result_code}</p><time>{formatDate(event.created_at, true)}</time></div></li>)}
            </ol>}
          </section>}
        </>}
      </div>

      {operation && <div className={styles.confirmOverlay} onMouseDown={event => {
        if (event.target === event.currentTarget && !saving) { setOperation(null); setReason(''); }
      }}>
        <section className={styles.confirmPanel} role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-confirmation`}>
          <span className={`${styles.confirmIcon} ${operation === 'photo-delete' ? styles.confirmIconDanger : ''}`}>
            {operation === 'photo-delete' ? <Trash2 /> : operation === 'revoke' ? <Smartphone /> : <ShieldCheck />}
          </span>
          <div className={styles.confirmCopy}>
            <strong id={`${titleId}-confirmation`}>{operation === 'revoke' ? 'Revocar acceso móvil' : operation === 'photo-delete' ? 'Eliminar foto de perfil' : 'Cambiar estado laboral'}</strong>
            <p>{operation === 'photo-delete' ? 'La fotografía será eliminada y se mostrará nuevamente el avatar corporativo.' : 'Esta acción quedará registrada en la auditoría.'}</p>
          </div>
          {operation === 'status' && <label className={styles.confirmField}>
            <span>Nuevo estado</span>
            <select aria-label="Nuevo estado laboral" value={targetStatus} onChange={event => setTargetStatus(event.target.value as EmployeeStatus)}>
              <option value="ACTIVO" disabled={currentStatus === 'ACTIVO'}>Activo</option>
              <option value="SUSPENDIDO" disabled={currentStatus === 'SUSPENDIDO'}>Suspendido</option>
              <option value="INACTIVO" disabled={currentStatus === 'INACTIVO'}>Inactivo · baja laboral</option>
            </select>
          </label>}
          {operation !== 'photo-delete' && <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={255} placeholder="Motivo de la acción…" autoFocus />}
          <div className={styles.confirmActions}>
            <button type="button" disabled={saving} onClick={() => { setOperation(null); setReason(''); }}>{operation === 'photo-delete' ? 'Conservar foto' : 'Cancelar'}</button>
            <button
              type="button"
              className={`${styles.confirmButton} ${operation === 'status' ? styles.confirmButtonSuccess : ''}`}
              disabled={saving}
              onClick={() => void submitOperation()}
            >{saving ? 'Procesando…' : operation === 'photo-delete' ? 'Eliminar foto' : operation === 'status' ? 'Actualizar estado' : 'Confirmar'}</button>
          </div>
        </section>
      </div>}

    </aside>
  </div>, document.body);
}

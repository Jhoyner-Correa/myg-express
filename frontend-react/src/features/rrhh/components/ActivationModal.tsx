import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MonitorSmartphone,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { rrhhService } from '../rrhh.service';
import type { ActivationCredentials, Employee, EmployeeOperationalProfile } from '../types';
import styles from './ActivationModal.module.css';

type ActivationMode = 'status' | 'provision';

type Props = {
  employee: Employee | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

function formatAccessDate(value: string | null | undefined) {
  if (!value) return 'Sin actividad reciente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin actividad reciente';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function ActivationModal({ employee, onClose, onChanged }: Props) {
  const hasActiveAccess = Boolean(employee?.accesoMovilActivo);
  const [mode, setMode] = useState<ActivationMode>('provision');
  const [profile, setProfile] = useState<EmployeeOperationalProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [credentials, setCredentials] = useState<ActivationCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMode(employee?.accesoMovilActivo ? 'status' : 'provision');
    setProfile(null);
    setCredentials(null);
    setError(null);
    setCopied(false);
    setSecondsRemaining(0);
    setPassword('');
    setShowPassword(false);
    if (!employee?.accesoMovilActivo) return undefined;

    const controller = new AbortController();
    setProfileLoading(true);
    void rrhhService.getEmployeeOperationalProfile(employee.id, controller.signal)
      .then(setProfile)
      .catch(profileError => {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(profileError, 'No se pudo consultar el dispositivo autorizado.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false);
      });
    return () => controller.abort();
  }, [employee]);

  useEffect(() => {
    if (!credentials) return undefined;
    const expiresAt = Date.now() + credentials.expires_in_seconds * 1000;
    const updateRemaining = () => setSecondsRemaining(
      Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
    );
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [credentials]);

  const generate = async () => {
    if (!employee) return;
    if (password.length < 4 || password.length > 64 || /\s/.test(password)) {
      setError('Define una contraseña de 4 a 64 caracteres, sin espacios.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const generated = await rrhhService.createActivation(employee.id, password, hasActiveAccess);
      setSecondsRemaining(generated.expires_in_seconds);
      setCredentials(generated);
      await onChanged();
    } catch (activationError) {
      setError(getApiErrorMessage(activationError, 'No se pudo generar el acceso.'));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!employee || !credentials || secondsRemaining <= 0) return;
    try {
      await navigator.clipboard.writeText(
        `Usuario: ${employee.dni}\nContraseña: ${credentials.password}\nCódigo de activación: ${credentials.activation_code}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona y copia las credenciales manualmente.');
    }
  };

  const close = () => {
    if (!loading) onClose();
  };
  const cancelProvision = () => {
    if (hasActiveAccess && !credentials) {
      setMode('status');
      setPassword('');
      setError(null);
      return;
    }
    close();
  };
  const remainingLabel = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;
  const mobile = profile?.mobile;

  const footer = credentials && secondsRemaining > 0
    ? <>
      <Button variant="secondary" disabled={loading} onClick={close}>Cerrar</Button>
      <Button variant="corporate" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
        {copied ? 'Acceso copiado' : 'Copiar acceso'}
      </Button>
    </>
    : mode === 'status' && hasActiveAccess
      ? <>
        <Button variant="secondary" disabled={loading} onClick={close}>Cerrar</Button>
        <Button variant="corporate" icon={<RefreshCw size={16} />} onClick={() => { setMode('provision'); setError(null); }}>
          Reemplazar celular
        </Button>
      </>
      : <>
        <Button variant="secondary" disabled={loading} onClick={cancelProvision}>
          {hasActiveAccess ? 'Volver' : 'Cerrar'}
        </Button>
        <Button variant="corporate" icon={<KeyRound size={16} />} loading={loading} onClick={() => void generate()}>
          {hasActiveAccess ? 'Revocar y generar acceso' : 'Generar acceso'}
        </Button>
      </>;

  return <Modal
    open={Boolean(employee)}
    onClose={close}
    title="Acceso a la aplicación móvil"
    description={`Seguridad y dispositivo de ${employee?.nombres ?? 'el colaborador'}.`}
    maxWidth={500}
    footer={footer}
  >
    {credentials ? <div className={styles.credentials}>
      <div className={styles.credentialsHeading}>
        <ShieldCheck />
        <div><strong>Nuevo acceso preparado</strong><span>Entrega estos datos directamente al colaborador</span></div>
      </div>
      <div className={styles.credentialRow}><span className={`${styles.credentialIcon} ${styles.userIcon}`}><UserRound /></span><div><small>Usuario</small><strong>{employee?.dni}</strong></div></div>
      <div className={styles.credentialRow}><span className={`${styles.credentialIcon} ${styles.passwordIcon}`}><LockKeyhole /></span><div><small>Contraseña</small><strong>{credentials.password}</strong></div></div>
      <div className={styles.credentialRow}><span className={`${styles.credentialIcon} ${styles.codeIcon}`}><ScanLine /></span><div><small>Código de activación</small><strong>{credentials.activation_code}</strong></div></div>
      <div className={`${styles.expiry} ${secondsRemaining <= 0 ? styles.expired : ''}`} role="status">
        <Clock3 /><div><span>{secondsRemaining > 0 ? 'Tiempo disponible' : 'Código vencido'}</span><strong>{remainingLabel}</strong></div><p>Se muestra una sola vez.</p>
      </div>
    </div> : mode === 'status' && hasActiveAccess ? <section className={styles.activeAccess} aria-live="polite">
      <div className={styles.activeAccessHero}>
        <span className={styles.activeAccessIcon}><ShieldCheck /></span>
        <div><small>ACCESO VIGENTE</small><h3>Celular autorizado</h3><p>El colaborador puede continuar usando la aplicación. No necesita nuevas credenciales.</p></div>
      </div>
      <div className={styles.deviceSummary} aria-busy={profileLoading}>
        <div><Smartphone /><span><small>Equipo vinculado</small><strong>{profileLoading ? 'Consultando…' : mobile ? [mobile.brand, mobile.model].filter(Boolean).join(' ') || 'Dispositivo Android' : 'Dispositivo autorizado'}</strong></span></div>
        <div><MonitorSmartphone /><span><small>Sesiones activas</small><strong>{profileLoading ? '—' : mobile?.active_sessions ?? 0}</strong></span></div>
        <div><Clock3 /><span><small>Último acceso</small><strong>{profileLoading ? 'Consultando…' : formatAccessDate(mobile?.last_access_at)}</strong></span></div>
      </div>
      <div className={styles.activeAccessNotice}>
        <ShieldCheck />
        <p>La contraseña se cambia desde la aplicación. Usa <strong>Reemplazar celular</strong> únicamente si el equipo fue cambiado, perdido o restablecido.</p>
      </div>
    </section> : <div className={styles.activationIntro}>
      <span className={hasActiveAccess ? styles.replacementIcon : styles.activationIcon}>
        {hasActiveAccess ? <AlertTriangle /> : <KeyRound />}
      </span>
      <h3>{hasActiveAccess ? 'Reemplazar el celular autorizado' : 'Preparar primer acceso'}</h3>
      <p>{hasActiveAccess
        ? 'Esta acción cerrará las sesiones y bloqueará el celular actual. El nuevo código permitirá vincular un único equipo.'
        : 'Define la contraseña habitual del colaborador. El código de activación permitirá autorizar su primer celular.'}</p>
      <label className={styles.passwordField}>
        <span>Contraseña asignada por RR. HH.</span>
        <div className={styles.passwordControl}>
          <LockKeyhole aria-hidden="true" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            maxLength={64}
            autoComplete="new-password"
            placeholder="Ej. myg2026"
            onChange={event => setPassword(event.target.value)}
          />
          {password && <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(current => !current)}>
            {showPassword ? <EyeOff /> : <Eye />}
          </button>}
        </div>
        <small>Entre 4 y 64 caracteres, sin espacios.</small>
      </label>
      {hasActiveAccess && <div className={styles.replacementWarning}><AlertTriangle /><span>El acceso actual dejará de funcionar inmediatamente al confirmar.</span></div>}
    </div>}
    {error && <div className={styles.formError} role="alert">{error}</div>}
  </Modal>;
}

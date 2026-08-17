import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Pencil, ShieldCheck, User, UserCheck, UserCog, X } from 'lucide-react';
import { getApiErrorMessage } from '../../../core/api/errors';
import type { UserSession } from '../../../core/auth/authState';
import type { ProfileUpdateInput } from '../../../core/auth/profile.service';
import { showToast } from '../../../core/utils/toast';
import { Button } from '../Button/Button';
import styles from './ProfileModal.module.css';

type Props = {
  open: boolean;
  user: UserSession | null;
  onClose: () => void;
  onSave: (input: ProfileUpdateInput) => Promise<UserSession>;
};

function formatDisplayName(name?: string) {
  if (!name) return 'Administrador';
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toLocaleUpperCase('es') + word.slice(1).toLocaleLowerCase('es'))
    .join(' ');
}

function initials(name?: string) {
  return (name || 'AD')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toLocaleUpperCase('es');
}

export function ProfileModal({ open, user, onClose, onSave }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Show/Hide password toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setNombre(formatDisplayName(user.nombre));
      setUsuario(user.usuario || '');
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setIsEditing(false);
    }
  }, [user, open]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => {
      document.removeEventListener('keydown', handleKeyboard);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open || !user) return null;

  // Real-time password strength calculation
  const hasMinLength = password.length >= 12;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  let strengthScore = 0;
  if (password) {
    if (hasMinLength) strengthScore += 1;
    if (hasLowercase && hasUppercase) strengthScore += 1;
    if (hasNumber) strengthScore += 1;
    if (hasSpecial) strengthScore += 1;
  }

  const getStrengthLabel = () => {
    if (strengthScore <= 1) return { text: 'Insegura', color: '#ef4444', width: '25%' };
    if (strengthScore === 2) return { text: 'Débil', color: '#f59e0b', width: '50%' };
    if (strengthScore === 3) return { text: 'Fuerte', color: '#10b981', width: '75%' };
    return { text: 'Muy Fuerte', color: '#059669', width: '100%' };
  };

  const strength = getStrengthLabel();
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nombre.trim()) {
      showToast('Ingresa tus nombres y apellidos.', 'warning');
      return;
    }
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(usuario.trim())) {
      showToast('El usuario debe tener entre 3 y 50 caracteres y solo usar letras, números, punto, guion o guion bajo.', 'warning');
      return;
    }

    const usernameChanged = usuario.trim() !== user.usuario;
    const passwordChangeRequested = Boolean(password || confirmPassword);
    if ((usernameChanged || passwordChangeRequested) && !currentPassword) {
      showToast('Ingresa tu contraseña actual para modificar tus credenciales de acceso.', 'warning');
      return;
    }

    if (passwordChangeRequested) {
      if (password !== confirmPassword) {
        showToast('Las contraseñas nuevas no coinciden.', 'warning');
        return;
      }
      if (strengthScore < 3) {
        showToast('La nueva contraseña debe cumplir con los criterios mínimos de seguridad (Fuerte).', 'warning');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        nombre: nombre.trim(),
        usuario: usuario.trim(),
        ...((usernameChanged || password) ? { password_actual: currentPassword } : {}),
        ...(password ? { nuevo_password: password } : {}),
      });
      showToast('Configuración de perfil actualizada correctamente.', 'success');
      setIsEditing(false);
      onClose();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo guardar la configuración.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = user.rol_label || user.rol || 'Administrador general';
  const siteLabel = user.sede_nombre || (user.alcance === 'EMPRESA' ? 'Toda la empresa' : 'Sede asignada');

  return createPortal(
    <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" tabIndex={-1}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerTitleIcon} aria-hidden="true"><UserCog /></span>
            <div className={styles.headerCopy}>
              <h2 id="profile-modal-title">
                {isEditing ? 'Editar Mi Perfil' : 'Configuración de mi perfil'}
              </h2>
              <p>
                {isEditing
                  ? 'Modifica tus datos de cuenta y credenciales de acceso'
                  : 'Resumen ejecutivo de cuenta y alcance asignado'}
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeButton} aria-label="Cerrar modal" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {isEditing ? (
          <form onSubmit={handleSubmit}>
            <div className={styles.body}>
              <div className={styles.userHeroCard}>
                <span className={styles.userHeroAvatar}>{initials(nombre || user.nombre)}</span>
                <div className={styles.userHeroInfo}>
                  <div className={styles.userHeroName}>
                    <strong>{nombre || formatDisplayName(user.nombre)}</strong>
                  </div>
                  <span className={styles.userHeroHandle}>@{usuario || user.usuario || 'usuario'}</span>
                  <div className={styles.userHeroBadges}>
                    <span className={styles.userPill}><ShieldCheck /> {roleLabel}</span>
                    <span className={styles.userPill}><Building2 /> {siteLabel}</span>
                  </div>
                </div>
              </div>

              <div className={styles.formSection}>
                <span className={styles.sectionTitle}><User /> Datos Editables</span>
                <div className={styles.formGrid}>
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label htmlFor="profile-nombre">Nombres y Apellidos</label>
                    <div className={styles.inputControl}>
                      <User aria-hidden="true" />
                      <input
                        id="profile-nombre"
                        type="text"
                        value={nombre}
                        onChange={e => setNombre(e.target.value)}
                        placeholder="Ej. Renzo Morales"
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="profile-usuario">Nombre de Usuario</label>
                    <div className={styles.inputControl}>
                      <User aria-hidden="true" />
                      <input
                        id="profile-usuario"
                        type="text"
                        value={usuario}
                        onChange={e => setUsuario(e.target.value)}
                        placeholder="usuario_admin"
                        required
                      />
                    </div>
                  </div>

                </div>
              </div>

              <div className={styles.formSection}>
                <span className={styles.sectionTitle}><ShieldCheck /> Ámbito Operativo (Solo lectura)</span>
                <div className={styles.formGrid}>
                  <div className={styles.readOnlyCard}>
                    <span className={styles.readOnlyCardIcon}><ShieldCheck /></span>
                    <div className={styles.readOnlyCardText}>
                      <small>Rol asignado</small>
                      <strong>{roleLabel}</strong>
                    </div>
                  </div>

                  <div className={styles.readOnlyCard}>
                    <span className={styles.readOnlyCardIcon}><Building2 /></span>
                    <div className={styles.readOnlyCardText}>
                      <small>Sede asignada</small>
                      <strong>{siteLabel}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.formSection}>
                <span className={styles.sectionTitle}><Lock /> Seguridad</span>

                <div className={styles.formGrid}>
                  <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                    <label htmlFor="profile-current-password">Contraseña actual (para cambiar usuario o contraseña)</label>
                    <div className={styles.inputControl}>
                      <KeyRound aria-hidden="true" />
                      <input
                        id="profile-current-password"
                        type={showCurrent ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        className={styles.showHideBtn}
                        onClick={() => setShowCurrent(!showCurrent)}
                        title={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showCurrent ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="profile-password">Nueva Contraseña</label>
                    <div className={styles.inputControl}>
                      <KeyRound aria-hidden="true" />
                      <input
                        id="profile-password"
                        type={showNew ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Mínimo 12 caracteres"
                      />
                      <button
                        type="button"
                        className={styles.showHideBtn}
                        onClick={() => setShowNew(!showNew)}
                        title={showNew ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showNew ? <EyeOff /> : <Eye />}
                      </button>
                    </div>

                    {password && (
                      <div className={styles.passwordStrengthWrapper}>
                        <div className={styles.strengthBarContainer}>
                          <div
                            className={styles.strengthBar}
                            style={{
                              width: strength.width,
                              backgroundColor: strength.color,
                            }}
                          />
                        </div>
                        <span className={styles.strengthLabel} style={{ color: strength.color }}>
                          Seguridad: {strength.text}
                        </span>

                        <ul className={styles.rulesList}>
                          <li className={`${styles.ruleItem} ${hasMinLength ? styles.ruleItemSuccess : ''}`}>
                            <span className={styles.ruleItemIcon}>
                              {hasMinLength ? <Check /> : <X size={10} />}
                            </span>
                            Mínimo 12 caracteres
                          </li>
                          <li className={`${styles.ruleItem} ${hasLowercase ? styles.ruleItemSuccess : ''}`}>
                            <span className={styles.ruleItemIcon}>
                              {hasLowercase ? <Check /> : <X size={10} />}
                            </span>
                            Una minúscula
                          </li>
                          <li className={`${styles.ruleItem} ${hasUppercase ? styles.ruleItemSuccess : ''}`}>
                            <span className={styles.ruleItemIcon}>
                              {hasUppercase ? <Check /> : <X size={10} />}
                            </span>
                            Una Mayúscula
                          </li>
                          <li className={`${styles.ruleItem} ${hasNumber ? styles.ruleItemSuccess : ''}`}>
                            <span className={styles.ruleItemIcon}>
                              {hasNumber ? <Check /> : <X size={10} />}
                            </span>
                            Un Número
                          </li>
                          <li className={`${styles.ruleItem} ${hasSpecial ? styles.ruleItemSuccess : ''}`}>
                            <span className={styles.ruleItemIcon}>
                              {hasSpecial ? <Check /> : <X size={10} />}
                            </span>
                            Caracter especial
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="profile-confirm-password">Confirmar Nueva Contraseña</label>
                    <div className={styles.inputControl}>
                      <KeyRound aria-hidden="true" />
                      <input
                        id="profile-confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repite la contraseña"
                      />
                      <button
                        type="button"
                        className={styles.showHideBtn}
                        onClick={() => setShowConfirm(!showConfirm)}
                        title={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showConfirm ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                    {confirmPassword && (
                      <span
                        className={styles.matchBadge}
                        style={{ color: passwordsMatch ? '#10b981' : '#ef4444' }}
                      >
                        {passwordsMatch ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <footer className={styles.footer}>
              <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
                Cancelar edición
              </Button>
              <Button
                type="submit"
                variant="corporate"
                className={styles.primaryButton}
                icon={<Check size={16} />}
                loading={saving}
              >
                Guardar cambios
              </Button>
            </footer>
          </form>
        ) : (
          <div>
            <div className={styles.body}>
              <div className={styles.userHeroCard}>
                <span className={styles.userHeroAvatar}>{initials(user.nombre)}</span>
                <div className={styles.userHeroInfo}>
                  <div className={styles.userHeroName}>
                    <strong>{formatDisplayName(user.nombre)}</strong>
                  </div>
                  <span className={styles.userHeroHandle}>@{user.usuario || 'usuario'}</span>
                  <div className={styles.userHeroBadges}>
                    <span className={styles.userPill}><ShieldCheck /> {roleLabel}</span>
                    <span className={styles.userPill}><Building2 /> {siteLabel}</span>
                  </div>
                </div>
              </div>

              <div className={styles.viewSection}>
                <span className={styles.sectionTitle}><User /> Información de Perfil</span>
                <div className={styles.viewGrid}>
                  <div className={styles.viewCard}>
                    <span className={styles.viewCardIcon}><User aria-hidden="true" /></span>
                    <div className={styles.viewCardText}>
                      <small>Nombres y Apellidos</small>
                      <strong>{formatDisplayName(user.nombre)}</strong>
                    </div>
                  </div>

                  <div className={styles.viewCard}>
                    <span className={styles.viewCardIcon}><UserCheck aria-hidden="true" /></span>
                    <div className={styles.viewCardText}>
                      <small>Usuario de Acceso</small>
                      <strong>@{user.usuario || 'usuario'}</strong>
                    </div>
                  </div>

                  <div className={styles.viewCard}>
                    <span className={styles.viewCardIcon}><Building2 aria-hidden="true" /></span>
                    <div className={styles.viewCardText}>
                      <small>Sede Operativa</small>
                      <strong>{siteLabel}</strong>
                    </div>
                  </div>

                  <div className={styles.viewCard}>
                    <span className={styles.viewCardIcon}><ShieldCheck aria-hidden="true" /></span>
                    <div className={styles.viewCardText}>
                      <small>Rol de Sistema</small>
                      <strong>{roleLabel}</strong>
                    </div>
                  </div>

                  <div className={styles.viewCard}>
                    <span className={`${styles.viewCardIcon} ${styles.viewCardIconSuccess}`}>
                      <CheckCircle2 aria-hidden="true" />
                    </span>
                    <div className={styles.viewCardText}>
                      <small>Estado de Cuenta</small>
                      <strong>{user.estado === 'inactivo' ? 'Inactivo' : 'Activo'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className={styles.footer}>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
              <Button
                type="button"
                variant="corporate"
                className={styles.primaryButton}
                icon={<Pencil size={15} />}
                onClick={() => setIsEditing(true)}
              >
                Editar información
              </Button>
            </footer>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

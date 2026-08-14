import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { rrhhService } from '../rrhh.service';
import type { ActivationCredentials, Employee } from '../types';
import styles from '../Rrhh.module.css';

export function ActivationModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const [credentials, setCredentials] = useState<ActivationCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setCredentials(null); setError(null); setCopied(false); }, [employee]);
  const generate = async () => {
    if (!employee) return;
    setLoading(true); setError(null);
    try { setCredentials(await rrhhService.createActivation(employee.id)); }
    catch (activationError) { setError(activationError instanceof Error ? activationError.message : 'No se pudo generar el acceso.'); }
    finally { setLoading(false); }
  };
  const copy = async () => {
    if (!employee || !credentials) return;
    await navigator.clipboard.writeText(`Usuario: ${employee.codigoEmpleado}\nClave temporal: ${credentials.temporary_password}\nCódigo de activación: ${credentials.activation_code}`);
    setCopied(true);
  };
  return <Modal open={Boolean(employee)} onClose={onClose} title="Acceso a la aplicación móvil" description={`Credenciales para ${employee?.nombres ?? 'el colaborador'}.`} maxWidth={540}
    footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button>{credentials ? <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>{copied ? 'Copiado' : 'Copiar acceso'}</Button> : <Button icon={<KeyRound size={16} />} loading={loading} onClick={() => void generate()}>Generar acceso</Button>}</>}>
    {!credentials ? <div className={styles.activationIntro}><KeyRound /><p>Se invalidará cualquier código pendiente y se creará una clave temporal de un solo uso.</p></div> : <div className={styles.credentials}>
      <div><span>Usuario</span><strong>{employee?.codigoEmpleado}</strong></div><div><span>Clave temporal</span><strong>{credentials.temporary_password}</strong></div><div><span>Código de activación</span><strong>{credentials.activation_code}</strong></div>
      <p>Válido durante {Math.round(credentials.expires_in_seconds / 60)} minutos. Esta información no volverá a mostrarse.</p>
    </div>}
    {error && <div className={styles.formError} role="alert">{error}</div>}
  </Modal>;
}

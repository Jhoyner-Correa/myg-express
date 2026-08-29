import { useEffect, useState, type FormEvent } from 'react';
import { CalendarRange, FileText, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { rrhhService } from '../rrhh.service';
import type { Employee } from '../types';
import styles from './AbsenceForms.module.css';

type Props = { open: boolean; siteId: number | null; employees: Employee[]; onClose: () => void; onSaved: () => Promise<void> };
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()); }

export function AbsenceRequestModal({ open, siteId, employees, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<'PERMISO' | 'VACACIONES'>('PERMISO');
  const [employeeId, setEmployeeId] = useState(0);
  const [type, setType] = useState('PERSONAL');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind('PERMISO'); setEmployeeId(0); setType('PERSONAL'); setStart(''); setEnd(''); setReason(''); setError(null);
  }, [open]);

  const selectKind = (value: 'PERMISO' | 'VACACIONES') => { setKind(value); setStart(''); setEnd(''); setError(null); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employeeId || !start || !end || reason.trim().length < 3) { setError('Completa el colaborador, el periodo y el motivo.'); return; }
    if ((kind === 'PERMISO' && end <= start) || (kind === 'VACACIONES' && end < start)) { setError(kind === 'PERMISO' ? 'La fecha final debe ser posterior al inicio.' : 'La fecha final debe ser igual o posterior al inicio.'); return; }
    const selected = employees.find((employee) => employee.id === employeeId);
    const requestSiteId = selected?.sedeId ?? siteId;
    if (!requestSiteId) { setError('No se pudo determinar la sede del colaborador.'); return; }
    setSaving(true); setError(null);
    try {
      if (kind === 'PERMISO') await rrhhService.createPermission({ sede_id: requestSiteId, employee_id: employeeId, type, start_at: start, end_at: end, reason: reason.trim() });
      else await rrhhService.createVacation({ sede_id: requestSiteId, employee_id: employeeId, start_date: start, end_date: end, reason: reason.trim() });
      await onSaved(); onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo registrar la solicitud.'); }
    finally { setSaving(false); }
  };

  return <Modal open={open} onClose={onClose} title="Registrar solicitud" description="Permiso, justificación o vacaciones" maxWidth={700}
    footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="absence-request" loading={saving}>Enviar a revisión</Button></>}>
    <form id="absence-request" className={styles.form} onSubmit={submit}>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.kindSelector}>
        <button type="button" className={kind === 'PERMISO' ? styles.kindActive : ''} onClick={() => selectKind('PERMISO')}><Stethoscope /><span><strong>Permiso o justificación</strong><small>Ausencia por horas o parte del día</small></span></button>
        <button type="button" className={kind === 'VACACIONES' ? styles.kindActive : ''} onClick={() => selectKind('VACACIONES')}><CalendarRange /><span><strong>Vacaciones</strong><small>Descanso por uno o varios días</small></span></button>
      </div>
      <section className={styles.section}>
        <header><UserRound /><div><h3>Colaborador y clasificación</h3><p>La sede se obtiene del registro laboral.</p></div></header>
        <div className={styles.grid}>
          <label><span>Colaborador</span><select value={employeeId} onChange={(event) => setEmployeeId(Number(event.target.value))}><option value={0}>Seleccionar colaborador</option>{employees.filter((employee) => employee.estado === 'ACTIVO').map((employee) => <option key={employee.id} value={employee.id}>{employee.apellidos}, {employee.nombres}{siteId === null && employee.sedeNombre ? ` · ${employee.sedeNombre}` : ''}</option>)}</select></label>
          {kind === 'PERMISO' && <label><span>Tipo de permiso</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="PERSONAL">Personal</option><option value="MEDICO">Médico</option><option value="FAMILIAR">Familiar</option><option value="OTRO">Otra justificación</option></select></label>}
        </div>
      </section>
      <section className={styles.section}>
        <header><CalendarRange /><div><h3>Periodo solicitado</h3><p>{kind === 'PERMISO' ? 'Indica la hora exacta de inicio y retorno.' : 'Indica el primer y último día de descanso.'}</p></div></header>
        <div className={styles.grid}>
          <label><span>Inicio</span><input type={kind === 'PERMISO' ? 'datetime-local' : 'date'} min={kind === 'VACACIONES' ? today() : undefined} value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label><span>Fin</span><input type={kind === 'PERMISO' ? 'datetime-local' : 'date'} min={kind === 'VACACIONES' ? start || today() : undefined} value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
      </section>
      <section className={styles.section}>
        <header><FileText /><div><h3>Motivo y sustento</h3><p>Describe la razón que deberá evaluar RR. HH.</p></div></header>
        <label className={styles.full}><span>Detalle de la solicitud</span><textarea rows={4} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Escribe una explicación clara y verificable..." /><small>{reason.length}/500</small></label>
      </section>
      <div className={styles.auditNote}><ShieldCheck /><span>La solicitud no modificará la asistencia hasta ser aprobada.</span></div>
    </form>
  </Modal>;
}

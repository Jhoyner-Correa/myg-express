import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { rrhhService } from '../rrhh.service';
import type { AttendanceCorrectionInput, AttendanceDashboardEmployee } from '../types';
import styles from '../Rrhh.module.css';

type Props = { siteId: number; date: string; employee: AttendanceDashboardEmployee | null; onClose: () => void; onSaved: () => Promise<void> };
const clockTypes = [
  ['ENTRADA', 'Entrada'], ['SALIDA_ALMUERZO', 'Salida a almuerzo'], ['REGRESO', 'Regreso'], ['SALIDA', 'Salida final'],
] as const;

function localClock(value: string | null) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  return `${parts.find(part => part.type === 'hour')?.value}:${parts.find(part => part.type === 'minute')?.value}`;
}

export function AttendanceCorrectionModal({ siteId, date, employee, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<AttendanceCorrectionInput['status']>('PRESENTE');
  const [attendanceType, setAttendanceType] = useState<AttendanceCorrectionInput['attendance_type']>('NORMAL');
  const [delay, setDelay] = useState(0);
  const [reason, setReason] = useState('');
  const [marks, setMarks] = useState<AttendanceCorrectionInput['marks']>({ ENTRADA: null, SALIDA_ALMUERZO: null, REGRESO: null, SALIDA: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!employee) return;
    setStatus(employee.status === 'SIN_REGISTRO' ? 'PRESENTE' : employee.status);
    setDelay(employee.delay_minutes);
    setAttendanceType('NORMAL'); setReason(''); setError(null);
    setMarks({ ENTRADA: localClock(employee.marks.entry) || null, SALIDA_ALMUERZO: localClock(employee.marks.lunch_out) || null, REGRESO: localClock(employee.marks.lunch_return) || null, SALIDA: localClock(employee.marks.exit) || null });
  }, [employee]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!employee) return;
    if (reason.trim().length < 8) { setError('Explica el motivo de la corrección con al menos 8 caracteres.'); return; }
    setSaving(true); setError(null);
    try {
      await rrhhService.correctAttendance({ sede_id: siteId, employee_id: employee.employee_id, date, status, attendance_type: attendanceType, delay_minutes: delay, reason, marks });
      await onSaved(); onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo aplicar la corrección.'); }
    finally { setSaving(false); }
  };
  const hasMarks = status === 'PRESENTE' || status === 'TARDANZA';
  return <Modal open={Boolean(employee)} onClose={onClose} title="Corregir asistencia" description={`${employee?.names ?? ''} ${employee?.last_names ?? ''} · ${date}`} maxWidth={650}
    footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="attendance-correction" loading={saving}>Aplicar corrección</Button></>}>
    <form id="attendance-correction" className={styles.form} onSubmit={submit}>
      {error && <div className={styles.formError} role="alert">{error}</div>}
      <div className={styles.formGrid}><label>Estado<select value={status} onChange={event => setStatus(event.target.value as AttendanceCorrectionInput['status'])}><option value="PRESENTE">Presente</option><option value="TARDANZA">Tardanza</option><option value="FALTA">Falta</option><option value="PERMISO">Permiso</option><option value="VACACIONES">Vacaciones</option></select></label><label>Modalidad<select value={attendanceType} onChange={event => setAttendanceType(event.target.value as AttendanceCorrectionInput['attendance_type'])}><option value="NORMAL">Presencial</option><option value="REMOTA">Remota</option><option value="COMISION">Comisión</option><option value="VISITA">Visita</option></select></label>{status === 'TARDANZA' && <label>Minutos de tardanza<input type="number" min="1" max="720" value={delay} onChange={event => setDelay(Number(event.target.value))} /></label>}</div>
      {hasMarks && <fieldset className={styles.correctionClocks}><legend>Marcaciones corregidas</legend>{clockTypes.map(([key, label]) => <label key={key}>{label}<input type="time" value={marks[key] ?? ''} onChange={event => setMarks(current => ({ ...current, [key]: event.target.value || null }))} /></label>)}</fieldset>}
      {!hasMarks && <div className={styles.correctionNotice}>Este estado no conserva marcaciones horarias. Las marcaciones existentes se retirarán, manteniendo el historial en auditoría.</div>}
      <label className={styles.fullField}>Motivo obligatorio<textarea rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe el documento o evidencia que sustenta el cambio..." /></label>
    </form>
  </Modal>;
}

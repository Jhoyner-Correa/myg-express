import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { buildWeeklyAssignments, validateEmployeeInput, WEEKDAYS } from '../domain';
import { rrhhService } from '../rrhh.service';
import type { Employee, EmployeeInput, JobRole, ScheduleAssignment, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';

type Props = {
  open: boolean;
  siteId: number;
  employee: Employee | null;
  roles: JobRole[];
  schedules: WorkSchedule[];
  onClose: () => void;
  onSave: (input: EmployeeInput, assignments: ScheduleAssignment[], effectiveFrom: string) => Promise<void>;
};

function today() { return new Date().toISOString().slice(0, 10); }

function initialInput(siteId: number, employee: Employee | null): EmployeeInput {
  return {
    codigo_empleado: employee?.codigoEmpleado ?? '', sede_id: siteId, cargo_id: employee?.cargoId ?? 0,
    dni: employee?.dni ?? '', nombres: employee?.nombres ?? '', apellidos: employee?.apellidos ?? '',
    sexo: employee?.sexo ?? 'M', telefono: employee?.telefono ?? '', email: employee?.email ?? '',
    fecha_ingreso: String(employee?.fechaIngreso ?? today()).slice(0, 10),
    tipo_rastreo: employee?.tipoRastreo ?? 'SOLO_MARCACION', estado: employee?.estado ?? 'ACTIVO',
    observaciones: employee?.observaciones ?? '',
  };
}

export function EmployeeModal({ open, siteId, employee, roles, schedules, onClose, onSave }: Props) {
  const [form, setForm] = useState(() => initialInput(siteId, employee));
  const [scheduleId, setScheduleId] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const title = employee ? 'Editar colaborador' : 'Registrar colaborador';

  useEffect(() => {
    if (!open) return;
    setForm(initialInput(siteId, employee));
    setScheduleId(0);
    setWeekdays([1, 2, 3, 4, 5, 6]);
    setScheduleEffectiveFrom(today());
    setError(null);
    if (employee) {
      void rrhhService.getEmployeeSchedule(employee.id).then(assignments => {
        setScheduleId(assignments[0]?.schedule_id ?? 0);
        setWeekdays(assignments.map(item => item.weekday));
      }).catch(() => setError('No se pudo consultar el horario actual. Puedes guardarlo nuevamente.'));
    }
  }, [employee, open, siteId]);

  const roleTracking = useMemo(() => roles.find(role => role.id === form.cargo_id)?.default_tracking_type, [form.cargo_id, roles]);
  useEffect(() => {
    if (!employee && roleTracking) setForm(current => ({ ...current, tipo_rastreo: roleTracking }));
  }, [employee, roleTracking]);

  const update = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateEmployeeInput(form);
    if (validation) { setError(validation); return; }
    if (scheduleId < 1 || weekdays.length === 0) { setError('Selecciona un horario y al menos un día laboral.'); return; }
    setSaving(true); setError(null);
    try { await onSave(form, buildWeeklyAssignments(scheduleId, weekdays), scheduleEffectiveFrom); } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el colaborador.');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description="Información laboral, acceso móvil y jornada semanal." maxWidth={760}
      footer={<><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="rrhh-employee-form" loading={saving}>Guardar colaborador</Button></>}>
      <form id="rrhh-employee-form" className={styles.form} onSubmit={submit}>
        {error && <div className={styles.formError} role="alert">{error}</div>}
        <div className={styles.formGrid}>
          <label>Código de empleado<input value={form.codigo_empleado} onChange={e => update('codigo_empleado', e.target.value.toUpperCase())} placeholder="MYG-001" /></label>
          <label>DNI / documento<input inputMode="numeric" value={form.dni} onChange={e => update('dni', e.target.value.replace(/\D/g, ''))} /></label>
          <label>Nombres<input value={form.nombres} onChange={e => update('nombres', e.target.value)} /></label>
          <label>Apellidos<input value={form.apellidos} onChange={e => update('apellidos', e.target.value)} /></label>
          <label>Cargo<select value={form.cargo_id} onChange={e => update('cargo_id', Number(e.target.value))}><option value={0}>Seleccionar cargo</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label>Fecha de ingreso<input type="date" value={form.fecha_ingreso} onChange={e => update('fecha_ingreso', e.target.value)} /></label>
          <label>Teléfono<input inputMode="tel" value={form.telefono} onChange={e => update('telefono', e.target.value.replace(/[^+\d]/g, ''))} /></label>
          <label>Correo corporativo<input type="email" value={form.email} onChange={e => update('email', e.target.value)} /></label>
          <label>Sexo<select value={form.sexo} onChange={e => update('sexo', e.target.value as EmployeeInput['sexo'])}><option value="M">Masculino</option><option value="F">Femenino</option></select></label>
          <label>Estado<select value={form.estado} onChange={e => update('estado', e.target.value as EmployeeInput['estado'])}><option value="ACTIVO">Activo</option><option value="SUSPENDIDO">Suspendido</option><option value="INACTIVO">Inactivo</option></select></label>
          <label>Seguimiento<select value={form.tipo_rastreo} onChange={e => update('tipo_rastreo', e.target.value as EmployeeInput['tipo_rastreo'])}><option value="NINGUNO">Sin rastreo</option><option value="SOLO_MARCACION">Solo marcación</option><option value="CONTINUO">Continuo (repartidor)</option></select></label>
          <label>Horario<select value={scheduleId} onChange={e => setScheduleId(Number(e.target.value))}><option value={0}>Seleccionar horario</option>{schedules.filter(schedule => schedule.status === 'ACTIVO').map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name} · {schedule.start_time.slice(0, 5)}–{schedule.end_time.slice(0, 5)}</option>)}</select></label>
          <label>Aplicar horario desde<input type="date" min={today()} value={scheduleEffectiveFrom} onChange={e => setScheduleEffectiveFrom(e.target.value)} /></label>
        </div>
        <fieldset className={styles.weekdays}><legend>Días laborales</legend>{WEEKDAYS.map(day => <label key={day.value}><input type="checkbox" checked={weekdays.includes(day.value)} onChange={() => setWeekdays(current => current.includes(day.value) ? current.filter(value => value !== day.value) : [...current, day.value])} />{day.label}</label>)}</fieldset>
        <label className={styles.fullField}>Observaciones<textarea rows={2} value={form.observaciones} onChange={e => update('observaciones', e.target.value)} /></label>
      </form>
    </Modal>
  );
}

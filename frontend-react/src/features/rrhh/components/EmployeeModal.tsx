import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  ContactRound,
  FileText,
  LoaderCircle,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { buildWeeklyAssignments, validateEmployeeInput, WEEKDAYS } from '../domain';
import { rrhhService } from '../rrhh.service';
import type { Employee, EmployeeInput, JobRole, ScheduleAssignment, Site, WorkSchedule } from '../types';
import { formatScheduleRange } from './attendance-formatters';
import styles from './EmployeeModal.module.css';

type Props = {
  open: boolean;
  siteId: number | null;
  employee: Employee | null;
  sites: Site[];
  roles: JobRole[];
  schedules: WorkSchedule[];
  onClose: () => void;
  onSave: (input: EmployeeInput, assignments: ScheduleAssignment[], effectiveFrom: string) => Promise<void>;
};

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const trackingHelp: Record<EmployeeInput['tipo_rastreo'], string> = {
  NINGUNO: 'No se solicitará ubicación durante la jornada.',
  SOLO_MARCACION: 'La ubicación se valida únicamente al registrar una marcación.',
  CONTINUO: 'La aplicación transmitirá ubicación durante la jornada activa.',
};

function initialInput(siteId: number | null, employee: Employee | null): EmployeeInput {
  return {
    sede_id: employee?.sedeId ?? siteId ?? 0, cargo_id: employee?.cargoId ?? 0,
    dni: employee?.dni ?? '', ruc: employee?.ruc ?? '', nombres: employee?.nombres ?? '', apellidos: employee?.apellidos ?? '',
    sexo: employee?.sexo ?? 'M', telefono: employee?.telefono ?? '', email: employee?.email ?? '',
    direccion: employee?.direccion ?? '',
    fecha_ingreso: String(employee?.fechaIngreso ?? today()).slice(0, 10),
    tipo_rastreo: employee?.tipoRastreo ?? 'SOLO_MARCACION', estado: employee?.estado ?? 'ACTIVO',
    observaciones: employee?.observaciones ?? '',
  };
}

export function EmployeeModal({ open, siteId, employee, sites, roles, schedules, onClose, onSave }: Props) {
  const [form, setForm] = useState(() => initialInput(siteId, employee));
  const [scheduleId, setScheduleId] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [scheduleMode, setScheduleMode] = useState<'INHERITED' | 'CUSTOM'>('INHERITED');
  const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lookingUpDni, setLookingUpDni] = useState(false);
  const [dniLookup, setDniLookup] = useState<{ status: 'idle' | 'success' | 'warning' | 'error'; message: string }>({ status: 'idle', message: '' });
  const title = employee ? 'Editar colaborador' : 'Registrar colaborador';

  useEffect(() => {
    if (!open) return;
    setForm(initialInput(siteId, employee));
    setScheduleId(0);
    setWeekdays([1, 2, 3, 4, 5, 6]);
    setScheduleMode('INHERITED');
    setScheduleEffectiveFrom(today());
    setError(null);
    setDniLookup({ status: 'idle', message: '' });
    let cancelled = false;
    if (employee) {
      void rrhhService.getEmployeeSchedule(employee.id).then(assignments => {
        if (cancelled) return;
        setScheduleMode(assignments.length ? 'CUSTOM' : 'INHERITED');
        setScheduleId(assignments[0]?.schedule_id ?? 0);
        setWeekdays(assignments.map(item => item.weekday));
      }).catch(() => {
        if (!cancelled) setError('No se pudo consultar el horario actual. Puedes guardarlo nuevamente.');
      });
    }
    return () => { cancelled = true; };
  }, [employee, open, siteId]);

  const roleTracking = useMemo(() => roles.find(role => role.id === form.cargo_id)?.default_tracking_type, [form.cargo_id, roles]);
  useEffect(() => {
    if (!employee && roleTracking) setForm(current => ({ ...current, tipo_rastreo: roleTracking }));
  }, [employee, roleTracking]);

  const update = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const updateDni = (value: string) => {
    update('dni', value.replace(/\D/g, '').slice(0, 12));
    setDniLookup({ status: 'idle', message: '' });
  };
  const lookupDni = async () => {
    const requestedDni = form.dni.trim();
    if (!/^\d{8}$/.test(requestedDni)) {
      setDniLookup({ status: 'error', message: 'Ingresa un DNI peruano de 8 dígitos.' });
      return;
    }
    setLookingUpDni(true);
    setDniLookup({ status: 'idle', message: '' });
    try {
      const identity = await rrhhService.lookupDni(requestedDni);
      setForm(current => current.dni === requestedDni
        ? {
            ...current,
            nombres: identity.nombres,
            apellidos: identity.apellidos,
            ruc: identity.ruc ?? current.ruc,
            direccion: identity.direccion || current.direccion,
          }
        : current);
      if (identity.rucStatus === 'FOUND') {
        setDniLookup({ status: 'success', message: 'Identidad y RUC encontrados. Datos completados.' });
      } else if (identity.rucStatus === 'NOT_FOUND') {
        setDniLookup({ status: 'success', message: 'Identidad encontrada. El DNI no registra un RUC asociado.' });
      } else {
        setDniLookup({ status: 'warning', message: 'Identidad encontrada. No fue posible verificar el RUC; puedes ingresarlo manualmente.' });
      }
    } catch (lookupError) {
      setDniLookup({ status: 'error', message: getApiErrorMessage(lookupError, 'No se pudo consultar el DNI.') });
    } finally {
      setLookingUpDni(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedForm: EmployeeInput = {
      ...form,
      dni: form.dni.trim(),
      ruc: form.ruc.trim(),
      nombres: form.nombres.trim().replace(/\s+/g, ' '),
      apellidos: form.apellidos.trim().replace(/\s+/g, ' '),
      telefono: form.telefono.trim(),
      email: form.email.trim().toLowerCase(),
      direccion: form.direccion.trim().replace(/\s+/g, ' '),
      observaciones: form.observaciones.trim(),
    };
    const validation = validateEmployeeInput(normalizedForm);
    if (validation) { setError(validation); return; }
    if (scheduleMode === 'CUSTOM' && (scheduleId < 1 || weekdays.length === 0)) { setError('Selecciona un horario y al menos un día laboral.'); return; }
    setSaving(true); setError(null);
    try { await onSave(normalizedForm, scheduleMode === 'CUSTOM' ? buildWeeklyAssignments(scheduleId, weekdays) : [], scheduleEffectiveFrom); } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el colaborador.');
    } finally { setSaving(false); }
  };

  const closeSafely = () => { if (!saving) onClose(); };
  const selectedSite = sites.find(site => site.id === form.sede_id)?.name;

  return (
    <Modal
      open={open}
      onClose={closeSafely}
      title={title}
      description="Datos personales, asignación laboral y política de jornada."
      icon={<UserPlus />}
      maxWidth={940}
      className={styles.employeeDialog}
      footer={<>
        <Button type="button" variant="secondary" onClick={closeSafely} disabled={saving}>Cancelar</Button>
        <Button type="submit" form="rrhh-employee-form" variant="corporate" icon={<Save />} loading={saving}>{employee ? 'Guardar cambios' : 'Registrar colaborador'}</Button>
      </>}
    >
      <form id="rrhh-employee-form" className={styles.employeeForm} onSubmit={submit} aria-busy={saving || undefined}>
        {error && <div className={styles.formError} role="alert">{error}</div>}
        <div className={styles.formColumns}>
          <section className={`${styles.formSection} ${styles.identitySection}`}>
            <header className={styles.sectionHeader}><span><ContactRound /></span><div><h3>Identificación y contacto</h3><p>Información oficial para el expediente del colaborador.</p></div></header>
            <div className={styles.sectionBody}>
              <label className={`${styles.field} ${styles.wideField}`}>
                <span className={styles.fieldLabel}>DNI / documento <b>*</b></span>
                <div className={styles.dniLookupControl}>
                  <input autoFocus={!employee} required inputMode="numeric" value={form.dni} onChange={e => updateDni(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && form.dni.length === 8) { e.preventDefault(); void lookupDni(); } }} maxLength={12} autoComplete="off" placeholder="8 dígitos para consulta automática" />
                  <button type="button" onClick={() => void lookupDni()} disabled={lookingUpDni || form.dni.length !== 8 || saving} aria-label="Consultar datos del DNI">
                    {lookingUpDni ? <LoaderCircle className={styles.lookupSpinner} aria-hidden="true" /> : <Search aria-hidden="true" />}
                    <span>{lookingUpDni ? 'Consultando…' : 'Consultar DNI'}</span>
                  </button>
                </div>
                {dniLookup.status !== 'idle'
                  ? <small className={dniLookup.status === 'success' ? styles.dniLookupSuccess : dniLookup.status === 'warning' ? styles.dniLookupWarning : styles.dniLookupError} role="status" aria-live="polite">{dniLookup.status === 'success' && <CircleCheck aria-hidden="true" />}{dniLookup.status === 'warning' && <CircleAlert aria-hidden="true" />}{dniLookup.message}</small>
                  : <small className={styles.fieldHint}>La consulta automática está disponible para DNI peruano de 8 dígitos.</small>}
              </label>
              <label className={styles.field}><span className={styles.fieldLabel}>Nombres <b>*</b></span><input required value={form.nombres} onChange={e => update('nombres', e.target.value)} autoComplete="given-name" placeholder="Nombres del colaborador" /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Apellidos <b>*</b></span><input required value={form.apellidos} onChange={e => update('apellidos', e.target.value)} autoComplete="family-name" placeholder="Apellidos del colaborador" /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>RUC <i>Opcional</i></span><input inputMode="numeric" value={form.ruc} onChange={e => update('ruc', e.target.value.replace(/\D/g, '').slice(0, 11))} maxLength={11} autoComplete="off" placeholder="11 dígitos" /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Teléfono <i>Opcional</i></span><input inputMode="tel" value={form.telefono} onChange={e => update('telefono', e.target.value.replace(/[^+\d]/g, ''))} maxLength={16} autoComplete="tel" placeholder="Ej. 987654321" /></label>
              <label className={`${styles.field} ${styles.wideField}`}><span className={styles.fieldLabel}>Correo electrónico <i>Opcional</i></span><input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="nombre@correo.com" autoComplete="email" /></label>
              <label className={`${styles.field} ${styles.wideField}`}><span className={styles.fieldLabel}>Dirección domiciliaria <b>*</b></span><input required value={form.direccion} onChange={e => update('direccion', e.target.value)} maxLength={255} autoComplete="street-address" placeholder="Av., jirón, calle, número y referencia" /></label>
            </div>
          </section>

          <section className={`${styles.formSection} ${styles.employmentSection}`}>
            <header className={styles.sectionHeader}><span><BriefcaseBusiness /></span><div><h3>Asignación laboral</h3><p>Sede, cargo y reglas operativas vigentes.</p></div></header>
            <div className={styles.sectionBody}>
              <label className={styles.field}><span className={styles.fieldLabel}>Sede <b>*</b></span><select required value={form.sede_id} onChange={e => update('sede_id', Number(e.target.value))}><option value={0}>Seleccionar sede</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Cargo <b>*</b></span><select required value={form.cargo_id} onChange={e => update('cargo_id', Number(e.target.value))}><option value={0}>Seleccionar cargo</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Fecha de ingreso <b>*</b></span><input required type="date" value={form.fecha_ingreso} onChange={e => update('fecha_ingreso', e.target.value)} /></label>
              <label className={styles.field}><span className={styles.fieldLabel}>Sexo registrado <b>*</b></span><select value={form.sexo} onChange={e => update('sexo', e.target.value as EmployeeInput['sexo'])}><option value="M">Masculino</option><option value="F">Femenino</option></select></label>
              <label className={`${styles.field} ${styles.wideField}`}><span className={styles.fieldLabel}>Seguimiento operativo <b>*</b></span><select value={form.tipo_rastreo} onChange={e => update('tipo_rastreo', e.target.value as EmployeeInput['tipo_rastreo'])}><option value="NINGUNO">Sin rastreo</option><option value="SOLO_MARCACION">Solo marcación</option><option value="CONTINUO">Continuo · personal de reparto</option></select><small className={styles.fieldHint}>{trackingHelp[form.tipo_rastreo]}</small></label>
              <label className={`${styles.field} ${styles.wideField}`}><span className={styles.fieldLabel}>Estado laboral <b>*</b></span><select disabled={Boolean(employee)} value={form.estado} onChange={e => update('estado', e.target.value as EmployeeInput['estado'])}><option value="ACTIVO">Activo</option><option value="SUSPENDIDO">Suspendido</option><option value="INACTIVO">Inactivo</option></select>{employee && <small className={styles.fieldHint}>Los cambios de estado se realizan desde el perfil y requieren un motivo auditable.</small>}</label>
              <label className={`${styles.field} ${styles.wideField}`}><span className={styles.fieldLabel}>Observaciones internas <i>Opcional</i></span><textarea rows={3} maxLength={500} value={form.observaciones} onChange={e => update('observaciones', e.target.value)} placeholder="Información relevante para la administración de RR.HH." /></label>
            </div>
          </section>
        </div>

        <section className={`${styles.formSection} ${styles.scheduleSection}`}>
          <header className={styles.sectionHeader}><span><CalendarClock /></span><div><h3>Política de jornada</h3><p>Define cómo se resolverá el horario semanal de este colaborador.</p></div></header>
          <div className={styles.scheduleBody}>
            <div className={styles.scheduleControls}>
              <label className={styles.field}><span className={styles.fieldLabel}>Política semanal <b>*</b></span><select value={scheduleMode} onChange={e => setScheduleMode(e.target.value as 'INHERITED' | 'CUSTOM')}><option value="INHERITED">Heredar de sede o empresa</option><option value="CUSTOM">Asignar horario personalizado</option></select></label>
              {scheduleMode === 'CUSTOM' && <label className={styles.field}><span className={styles.fieldLabel}>Horario <b>*</b></span><select value={scheduleId} onChange={e => setScheduleId(Number(e.target.value))}><option value={0}>Seleccionar horario</option>{schedules.filter(schedule => schedule.status === 'ACTIVO').map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name} · {formatScheduleRange(schedule.start_time, schedule.end_time)}</option>)}</select></label>}
              <label className={styles.field}><span className={styles.fieldLabel}>Aplicar desde <b>*</b></span><input required type="date" min={today()} value={scheduleEffectiveFrom} onChange={e => setScheduleEffectiveFrom(e.target.value)} /></label>
            </div>
            {scheduleMode === 'INHERITED'
              ? <div className={styles.inheritedScheduleNote}><ShieldCheck aria-hidden="true" /><div><strong>Administración centralizada</strong><span>Se aplicará primero la política de {selectedSite || 'la sede seleccionada'} y, cuando no exista, la política corporativa.</span></div></div>
              : <fieldset className={styles.weekdays}><legend>Días laborales del horario personalizado</legend>{WEEKDAYS.map(day => <label key={day.value}><input type="checkbox" checked={weekdays.includes(day.value)} onChange={() => setWeekdays(current => current.includes(day.value) ? current.filter(value => value !== day.value) : [...current, day.value])} /><span>{day.label}</span></label>)}</fieldset>}
          </div>
        </section>

        <div className={styles.auditNote}><FileText aria-hidden="true" /><span>Verifica la información antes de guardar. Los campos identificados con * son obligatorios.</span></div>
      </form>
    </Modal>
  );
}

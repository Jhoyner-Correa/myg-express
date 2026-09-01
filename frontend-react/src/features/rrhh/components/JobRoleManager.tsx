import { useState, type FormEvent } from 'react';
import { BriefcaseBusiness, MapPin, Pencil, Plus, Route, Smartphone } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { EmployeeTracking, JobRole } from '../types';
import styles from '../Rrhh.module.css';

type Props = {
  roles: JobRole[];
  canManage: boolean;
  onCatalogChanged: () => Promise<void>;
};

const emptyRole = { name: '', description: '', default_tracking_type: 'SOLO_MARCACION' as EmployeeTracking };

const trackingMeta: Record<EmployeeTracking, { label: string; description: string; icon: typeof Smartphone }> = {
  SOLO_MARCACION: { label: 'Solo marcación', description: 'Verifica el GPS únicamente al registrar asistencia.', icon: MapPin },
  CONTINUO: { label: 'Rastreo continuo', description: 'Registra ubicación durante toda la jornada activa.', icon: Route },
  NINGUNO: { label: 'Sin rastreo', description: 'El cargo no utiliza funciones de ubicación móvil.', icon: Smartphone },
};

export function JobRoleManager({ roles, canManage, onCatalogChanged }: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newRole = () => {
    setEditingId(null);
    setDraft(emptyRole);
    setError(null);
    setEditorOpen(true);
  };

  const editRole = (role: JobRole) => {
    setEditingId(role.id);
    setDraft({ name: role.name, description: role.description ?? '', default_tracking_type: role.default_tracking_type });
    setError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (name.length < 2) {
      setError('Escribe un nombre de cargo claro, de al menos 2 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = { ...draft, name, description: draft.description.trim() || null };
      if (editingId) await rrhhService.updateJobRole(editingId, input);
      else await rrhhService.createJobRole(input);
      await onCatalogChanged();
      showToast(editingId ? 'Cargo actualizado correctamente.' : 'Cargo creado correctamente.', 'success');
      setEditorOpen(false);
    } catch (saveError) {
      const message = getApiErrorMessage(saveError, 'No se pudo guardar el cargo.');
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const continuousRoles = roles.filter(role => role.default_tracking_type === 'CONTINUO').length;

  return <>
    <section className={`${styles.configCard} ${styles.roleManager}`}>
      <header className={styles.settingsCardHeader}>
        <span><BriefcaseBusiness /></span>
        <div><small>ESTRUCTURA ORGANIZACIONAL</small><h2>Catálogo de cargos</h2><p>Responsabilidades y política móvil que heredará cada colaborador.</p></div>
        <div className={styles.roleHeaderActions}>
          <strong className={styles.configurationProgress}>{roles.length} cargos activos</strong>
          {canManage && <Button type="button" size="sm" variant="corporate" icon={<Plus />} onClick={newRole}>Nuevo cargo</Button>}
        </div>
      </header>

      <div className={styles.roleCatalogSummary}>
        <div><span>Total configurados</span><strong>{roles.length}</strong><small>Cargos disponibles</small></div>
        <div><span>Control de asistencia</span><strong>{roles.length - continuousRoles}</strong><small>Sin seguimiento continuo</small></div>
        <div><span>Operación en ruta</span><strong>{continuousRoles}</strong><small>Con rastreo continuo</small></div>
      </div>

      <div className={styles.roleTableHead} aria-hidden="true"><span>Cargo y responsabilidad</span><span>Política de ubicación</span><span>Acción</span></div>
      <div className={styles.roleList}>
        {roles.map(role => {
          const meta = trackingMeta[role.default_tracking_type];
          const TrackingIcon = meta.icon;
          const trackingTone = role.default_tracking_type === 'CONTINUO'
            ? styles.roleTrackingContinuous
            : role.default_tracking_type === 'NINGUNO'
              ? styles.roleTrackingNone
              : styles.roleTrackingAttendance;
          return <button type="button" key={role.id} onClick={() => editRole(role)}>
            <span className={styles.roleIcon}><BriefcaseBusiness /></span>
            <span className={styles.roleIdentityCell}><strong>{role.name}</strong><small>{role.description || 'Descripción administrativa pendiente'}</small></span>
            <span className={styles.rolePolicyCell}><i className={`${styles.roleTrackingPolicy} ${trackingTone}`}><TrackingIcon />{meta.label}</i></span>
            {canManage && <span className={styles.roleEditAction}><Pencil />Editar</span>}
          </button>;
        })}
      </div>
    </section>

    <Modal
      open={editorOpen}
      onClose={closeEditor}
      title={editingId ? 'Editar cargo' : 'Registrar nuevo cargo'}
      description="Define su responsabilidad y el nivel de ubicación requerido en el aplicativo."
      icon={editingId ? <Pencil /> : <BriefcaseBusiness />}
      maxWidth={720}
      footer={<>
        <Button type="button" variant="secondary" disabled={saving} onClick={closeEditor}>Cancelar</Button>
        <Button type="submit" form="job-role-form" variant="corporate" loading={saving}>{editingId ? 'Guardar cambios' : 'Registrar cargo'}</Button>
      </>}
    >
      <form id="job-role-form" className={styles.roleModalForm} onSubmit={save}>
        <div className={styles.roleFormFields}>
          <label>Nombre del cargo<input autoFocus required minLength={2} maxLength={100} value={draft.name} onChange={event => { setDraft(current => ({ ...current, name: event.target.value })); setError(null); }} placeholder="Ej. Supervisor de operaciones" disabled={!canManage || saving} /></label>
          <label>Descripción administrativa<textarea maxLength={255} rows={3} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Resume la responsabilidad principal del cargo" disabled={!canManage || saving} /></label>
        </div>

        <fieldset className={styles.trackingPolicyFieldset}>
          <legend><strong>Política de ubicación móvil</strong><small>Selecciona cómo utilizará el GPS este cargo.</small></legend>
          <div className={styles.trackingPolicyGrid}>
            {Object.entries(trackingMeta).map(([value, meta]) => {
              const TrackingIcon = meta.icon;
              return <label key={value} className={draft.default_tracking_type === value ? styles.trackingOptionActive : ''}>
                <input type="radio" name="tracking-policy" value={value} checked={draft.default_tracking_type === value} onChange={() => setDraft(current => ({ ...current, default_tracking_type: value as EmployeeTracking }))} disabled={!canManage || saving} />
                <span className={styles.trackingOptionIcon}><TrackingIcon /></span>
                <span><strong>{meta.label}</strong><small>{meta.description}</small></span>
                <i />
              </label>;
            })}
          </div>
        </fieldset>
        {error && <p className={styles.formError} role="alert">{error}</p>}
      </form>
    </Modal>
  </>;
}

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { ZoneItem } from '../types';
import styles from './RouteEditorModal.module.css';

type RouteEditorModalProps = {
  open: boolean;
  editing: boolean;
  zones: ZoneItem[];
  selectedName: string;
  onSelectedNameChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  onCreateZone: (name: string) => Promise<void> | void;
  onDeleteZone: (id: number) => Promise<void> | void;
  onClose: () => void;
};

export function RouteEditorModal({
  open,
  editing,
  zones,
  selectedName,
  onSelectedNameChange,
  onSubmit,
  onCreateZone,
  onDeleteZone,
  onClose,
}: RouteEditorModalProps) {
  const [managingZones, setManagingZones] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setManagingZones(false);
      setNewZoneName('');
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedName || submitting) return;
    setSubmitting(true);
    try { await onSubmit(); } finally { setSubmitting(false); }
  };

  const createZone = async () => {
    const name = newZoneName.trim();
    if (!name) return;
    await onCreateZone(name);
    setNewZoneName('');
  };

  return (
    <Modal
      open={open}
      title={editing ? 'Editar ruta' : 'Crear nueva ruta'}
      description={editing
        ? 'Modifica el nombre operativo de la ruta.'
        : 'Selecciona una zona. El identificador de la ruta se genera automáticamente.'}
      onClose={onClose}
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="route-editor-form" loading={submitting}>
            {editing ? 'Guardar cambios' : 'Crear ruta'}
          </Button>
        </>
      )}
    >
      <form id="route-editor-form" className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span>Nombre de la ruta</span>
          <select value={selectedName} onChange={event => onSelectedNameChange(event.target.value)} required>
            <option value="">Selecciona una ruta</option>
            {zones.map(zone => <option key={zone.id} value={zone.nombre}>{zone.nombre}</option>)}
          </select>
          <small>El nombre identifica la zona; el código MYG se administra por separado.</small>
        </label>

        <button className={styles.manageToggle} type="button" onClick={() => setManagingZones(value => !value)}>
          {managingZones ? 'Ocultar gestión de zonas' : 'Gestionar nombres de ruta'}
        </button>

        {managingZones && (
          <section className={styles.zoneManager} aria-label="Gestión de zonas">
            <div className={styles.zoneInput}>
              <input
                value={newZoneName}
                onChange={event => setNewZoneName(event.target.value)}
                placeholder="Ej. Villa Rica"
                autoComplete="off"
              />
              <Button type="button" size="sm" variant="secondary" icon={<Plus />} onClick={createZone}>Agregar</Button>
            </div>
            <div className={styles.zoneList}>
              {zones.map(zone => (
                <div className={styles.zone} key={zone.id}>
                  <span>{zone.nombre}</span>
                  <button type="button" onClick={() => onDeleteZone(zone.id)} aria-label={`Eliminar zona ${zone.nombre}`}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
              {zones.length === 0 && <p className={styles.empty}>Todavía no hay zonas registradas.</p>}
            </div>
          </section>
        )}
      </form>
    </Modal>
  );
}

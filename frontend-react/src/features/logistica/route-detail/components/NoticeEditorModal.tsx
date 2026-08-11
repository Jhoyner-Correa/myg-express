import type { FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import styles from './NoticeEditorModal.module.css';

interface NoticeEditorModalProps {
  open: boolean;
  name: string;
  phone: string;
  code: string;
  message: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onCode: (value: string) => void;
  onMessage: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

interface FieldProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: 'text' | 'tel';
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  required = false,
  type = 'text',
}: FieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}{required && ' *'}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

export function NoticeEditorModal({
  open,
  name,
  phone,
  code,
  message,
  onName,
  onPhone,
  onCode,
  onMessage,
  onClose,
  onSubmit,
}: NoticeEditorModalProps) {
  return (
    <Modal
      open={open}
      title="Nuevo destinatario"
      description="Agrega manualmente un paquete a esta ruta."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="notice-editor-form">
            Guardar
          </Button>
        </>
      }
    >
      <form id="notice-editor-form" onSubmit={onSubmit}>
        <div className={styles.grid}>
          <Field
            label="Teléfono"
            type="tel"
            required
            value={phone}
            onChange={onPhone}
            placeholder="51987654321"
          />
          <Field
            label="Nombre"
            required
            value={name}
            onChange={onName}
            placeholder="Nombre del cliente"
          />
        </div>
        <Field
          label="Código de paquete"
          required
          value={code}
          onChange={onCode}
          placeholder="PKG-00123"
        />
        <label className={styles.field}>
          <span>Mensaje personalizado (opcional)</span>
          <textarea
            value={message}
            onChange={(event) => onMessage(event.target.value)}
            placeholder="Mensaje adicional"
          />
        </label>
      </form>
    </Modal>
  );
}

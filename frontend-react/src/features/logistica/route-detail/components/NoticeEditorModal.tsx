import type { FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import styles from './NoticeEditorModal.module.css';

type Props = { open: boolean; name: string; phone: string; code: string; message: string; onName: (v:string)=>void; onPhone:(v:string)=>void; onCode:(v:string)=>void; onMessage:(v:string)=>void; onClose:()=>void; onSubmit:(e:FormEvent)=>void };
export function NoticeEditorModal(p: Props) {
  return <Modal open={p.open} title="Nuevo destinatario" description="Agrega manualmente un paquete a esta ruta." onClose={p.onClose} footer={<><Button variant="secondary" type="button" onClick={p.onClose}>Cancelar</Button><Button type="submit" form="notice-editor-form">Guardar</Button></>}>
    <form id="notice-editor-form" onSubmit={p.onSubmit}>
      <div className={styles.grid}><Field label="Teléfono" required value={p.phone} onChange={p.onPhone} placeholder="51987654321" /><Field label="Nombre" required value={p.name} onChange={p.onName} placeholder="Nombre del cliente" /></div>
      <Field label="Código de paquete" required value={p.code} onChange={p.onCode} placeholder="PKG-00123" />
      <label className={styles.field}>Mensaje personalizado (opcional)<textarea value={p.message} onChange={e=>p.onMessage(e.target.value)} placeholder="Mensaje adicional" /></label>
    </form>
  </Modal>;
}
function Field({label,value,onChange,placeholder,required}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;required?:boolean}) { return <label className={styles.field}>{label}{required && ' *'}<input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required} /></label>; }

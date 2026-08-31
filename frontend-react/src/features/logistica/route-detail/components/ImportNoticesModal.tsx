import type { DragEvent } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import styles from './ImportNoticesModal.module.css';

type ImportStatus = {
  type: 'idle' | 'loading' | 'success' | 'error';
  msg: string;
};

interface ImportNoticesModalProps {
  open: boolean;
  fileName: string;
  status: ImportStatus;
  onFile: (file: File) => void;
  onClose: () => void;
}

export function ImportNoticesModal({
  open,
  fileName,
  status,
  onFile,
  onClose,
}: ImportNoticesModalProps) {
  const selectFile = (file?: File) => {
    if (file) onFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0]);
  };

  return (
    <Modal
      open={open}
      title="Carga de destinatarios"
      description="Sube un Excel con las columnas requeridas."
      onClose={onClose}
      maxWidth={480}
    >
      <label
        className={styles.dropzone}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <UploadCloud className={styles.icon} size={34} aria-hidden="true" />
        <span className={styles.title}>Arrastra tu archivo aquí</span>
        <span className={styles.subtitle}>
          o haz clic para seleccionar .xlsx, .xls o .csv
        </span>
        <span className={styles.file}>
          <FileSpreadsheet size={14} aria-hidden="true" />
          {fileName}
        </span>
        <span className={styles.chips}>
          <span>Nombre</span>
          <span>Código</span>
          <span>Teléfono</span>
        </span>
      </label>

      {status.type !== 'idle' && (
        <div
          className={`${styles.status} ${styles[status.type]}`}
          role={status.type === 'error' ? 'alert' : 'status'}
        >
          {status.type === 'loading' && (
            <span className={styles.spinner} aria-hidden="true" />
          )}
          {status.msg}
        </div>
      )}
    </Modal>
  );
}

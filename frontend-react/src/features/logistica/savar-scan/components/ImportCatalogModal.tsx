import { FileSpreadsheet } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import styles from '../SavarScan.module.css';

type Props = {
  open: boolean;
  lotName: string;
  loading: boolean;
  status: string;
  onLotName: (value: string) => void;
  onFile: (file: File) => void;
  onClose: () => void;
};

export function ImportCatalogModal({ open, lotName, loading, status, onLotName, onFile, onClose }: Props) {
  const acceptFile = (files?: FileList | null) => {
    const file = files?.[0];
    if (file && !loading) onFile(file);
  };

  return (
    <Modal
      open={open}
      title="Importar catálogo"
      description="Carga un lote de paquetes desde Excel."
      onClose={onClose}
      maxWidth={540}
    >
      <div className={styles.modalStack}>
        <label className={styles.field}>
          <span>Nombre del lote</span>
          <input
            value={lotName}
            onChange={event => onLotName(event.target.value)}
            placeholder="Ej. SAVAR - 12-08-2026"
          />
        </label>
        <label
          className={`${styles.dropzone} ${loading ? styles.disabled : ''}`}
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            acceptFile(event.dataTransfer.files);
          }}
        >
          <FileSpreadsheet aria-hidden="true" />
          <strong>{loading ? 'Procesando archivo...' : 'Arrastra tu archivo Excel aquí'}</strong>
          <span>{loading ? status : 'o haz clic para seleccionarlo'}</span>
          <small>XLSX · XLS · CSV</small>
          <input
            className="sr-only"
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={loading}
            onChange={event => acceptFile(event.target.files)}
          />
        </label>
        {status && <p className={styles.modalStatus} role="status">{status}</p>}
      </div>
    </Modal>
  );
}

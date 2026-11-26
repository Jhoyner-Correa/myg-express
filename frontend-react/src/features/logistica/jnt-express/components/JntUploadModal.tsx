import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { Button } from '../../../../components/ui/Button/Button';
import { jntService } from '../jnt.service';
import type { JntBatchDetailData } from '../types';
import styles from '../JntExpress.module.css';

interface JntUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (batchId: number, data: JntBatchDetailData) => void;
}

export const JntUploadModal: React.FC<JntUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.toLowerCase().endsWith('.pdf')) {
        setError('Solo se admiten archivos en formato PDF (.pdf)');
        return;
      }
      setFile(selected);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (!dropped.name.toLowerCase().endsWith('.pdf')) {
        setError('Solo se admiten archivos en formato PDF (.pdf)');
        return;
      }
      setFile(dropped);
      setError(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      setProgress(10);

      const res = await jntService.uploadPdf(file, (p) => {
        setProgress(p);
      });

      onSuccess(res.lote_id, res.data);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || err.message || 'Error al procesar el archivo PDF');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={uploading ? () => {} : onClose}
      title="Cargar PDF de Guías J&T Express"
    >
      <div className={styles.modalBody}>
        <p className={styles.modalDescription}>
          Sube el archivo PDF generado por el sistema de J&T Express (puede contener 200 o más páginas). El sistema extraerá automáticamente el código de paquete, datos de consignados, teléfono, lugar y peso.
        </p>

        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${file ? styles.dropZoneWithFile : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            disabled={uploading}
          />

          {file ? (
            <div className={styles.fileSelectedInfo}>
              <FileText className={styles.fileIcon} size={42} />
              <div className={styles.fileDetails}>
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileSize}>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
              <CheckCircle2 className={styles.checkIcon} size={24} />
            </div>
          ) : (
            <div className={styles.dropZonePlaceholder}>
              <Upload className={styles.uploadIcon} size={42} />
              <p className={styles.dropText}>Arrastra tu PDF aquí o haz clic para examinar</p>
              <span className={styles.dropSubtext}>Soporta manifiestos térmicos de etiquetas J&T</span>
            </div>
          )}
        </div>

        {uploading && (
          <div className={styles.uploadProgressContainer}>
            <div className={styles.uploadProgressBar}>
              <div
                className={styles.uploadProgressBarFill}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className={styles.uploadProgressText}>
              <Loader2 className={styles.spinner} size={16} />
              <span>Procesando PDF y extrayendo guías térmicas ({progress}%)...</span>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorMessage}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className={styles.modalActions}>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={uploading}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleProcess}
            disabled={!file || uploading}
          >
            {uploading ? 'Procesando...' : 'Comenzar Extracción'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

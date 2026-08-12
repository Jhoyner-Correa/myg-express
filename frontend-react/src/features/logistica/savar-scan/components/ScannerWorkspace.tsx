import type { KeyboardEvent, RefObject } from 'react';
import { Barcode, MapPin, PackageSearch, Phone, UserRound } from 'lucide-react';
import type { SavarPackage, ScanFeedback } from '../types';
import styles from '../SavarScan.module.css';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  feedback: ScanFeedback;
  packageItem: SavarPackage | null;
  disabled: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function ScannerWorkspace({ inputRef, value, feedback, packageItem, disabled, onChange, onKeyDown }: Props) {
  return (
    <div className={styles.scannerColumn}>
      <section className={`${styles.card} ${styles.scannerCard}`}>
        <label htmlFor="savar-scan-input"><Barcode aria-hidden="true" />Caja de escaneo</label>
        <div className={styles.scanInput}>
          <Barcode aria-hidden="true" />
          <input
            id="savar-scan-input"
            ref={inputRef}
            value={value}
            disabled={disabled}
            autoComplete="off"
            placeholder={disabled ? 'SELECCIONA UN LOTE PARA ESCANEAR' : 'ESCANEAR CÓDIGO DE BARRAS...'}
            onChange={event => onChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className={`${styles.scanFeedback} ${styles[feedback.tone]}`} role="status" aria-live="polite">
          <span aria-hidden="true" /><strong>{feedback.title}</strong><p>{feedback.description}</p>
        </div>
      </section>

      <section className={`${styles.card} ${styles.packageCard}`}>
        <header><PackageSearch aria-hidden="true" /><strong>Información del paquete</strong></header>
        <div className={styles.packageGrid}>
          <Info icon={<Barcode />} label="Código" value={packageItem?.codigo_paquete} />
          <Info icon={<Phone />} label="Teléfono" value={packageItem?.telefono} />
          <Info icon={<UserRound />} label="Consignado / cliente" value={packageItem?.consignado || packageItem?.nombre} wide />
          <Info icon={<MapPin />} label="Dirección de entrega" value={packageItem ? `${packageItem.direccion || ''}${packageItem.distrito ? ` · ${packageItem.distrito}` : ''}` : ''} wide />
          <Info label="Departamento / provincia" value={packageItem ? `${packageItem.departamento || '—'} / ${packageItem.provincia || '—'}` : ''} />
          <Info label="Distrito" value={packageItem?.distrito} />
        </div>
      </section>
    </div>
  );
}

function Info({ icon, label, value, wide = false }: { icon?: React.ReactNode; label: string; value?: string; wide?: boolean }) {
  return <div className={`${styles.packageInfo} ${wide ? styles.wide : ''}`}><small>{icon}{label}</small><strong title={value}>{value || '—'}</strong></div>;
}

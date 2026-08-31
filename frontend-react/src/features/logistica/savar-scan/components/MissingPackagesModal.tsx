import { Search } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { SavarPackage } from '../types';
import styles from '../SavarScan.module.css';

type Props = {
  open: boolean;
  lotName: string;
  items: SavarPackage[];
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
};

export function MissingPackagesModal({ open, lotName, items, query, onQuery, onClose }: Props) {
  return (
    <Modal
      open={open}
      title={`Paquetes faltantes · ${lotName}`}
      description="Paquetes que todavía no han sido registrados como recibidos."
      onClose={onClose}
      maxWidth={900}
    >
      <div className={styles.modalStack}>
        <label className={styles.modalSearch}>
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar faltantes</span>
          <input
            value={query}
            onChange={event => onQuery(event.target.value)}
            placeholder="Buscar por código, consignado o distrito..."
          />
        </label>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr><th>Código</th><th>Consignado</th><th>Dirección</th><th>Distrito</th></tr>
            </thead>
            <tbody>
              {items.length ? items.map((item, index) => (
                <tr key={`${item.codigo_paquete}-${index}`}>
                  <td className={styles.code}>{item.codigo_paquete}</td>
                  <td>{item.consignado || item.nombre || '—'}</td>
                  <td>{item.direccion || '—'}</td>
                  <td>{item.distrito || '—'}</td>
                </tr>
              )) : (
                <tr><td className={styles.empty} colSpan={4}>No hay paquetes faltantes con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

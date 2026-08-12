import { Search, Upload } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { zoneKey } from '../domain';
import type { ZoneTree } from '../types';
import styles from '../SavarScan.module.css';

type Props = {
  open: boolean;
  lotName: string;
  total: number;
  tree: ZoneTree;
  selected: Set<string>;
  search: string;
  selectedCount: number;
  loading: boolean;
  onSearch: (value: string) => void;
  onDistrict: (province: string, district: string) => void;
  onProvince: (province: string, districts: string[]) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function ZoneSelectionModal(props: Props) {
  return (
    <Modal
      open={props.open}
      title="Zonas a importar"
      description="Selecciona las provincias y distritos que deseas cargar."
      onClose={props.onClose}
      maxWidth={700}
      footer={(
        <>
          <Button variant="secondary" onClick={props.onClose}>Cancelar</Button>
          <Button loading={props.loading} disabled={!props.selectedCount} icon={<Upload />} onClick={props.onSubmit}>
            Importar seleccionados ({props.selectedCount})
          </Button>
        </>
      )}
    >
      <div className={styles.modalStack}>
        <div className={styles.fileSummary}>
          <span>Lote: <strong>{props.lotName}</strong></span>
          <strong>{props.total} paquetes detectados</strong>
        </div>
        <label className={styles.modalSearch}>
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar zonas</span>
          <input
            value={props.search}
            onChange={event => props.onSearch(event.target.value)}
            placeholder="Buscar provincia o distrito..."
          />
        </label>
        <div className={styles.zoneList}>
          {Object.entries(props.tree).map(([province, data]) => {
            const districts = Object.keys(data.districts);
            const checked = districts.every(district => props.selected.has(zoneKey(province, district)));
            return (
              <section key={province} className={styles.zoneGroup}>
                <header>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => props.onProvince(province, districts)}
                    />
                    {province}
                  </label>
                  <span>{data.total} paquetes</span>
                </header>
                <div>
                  {Object.entries(data.districts).map(([district, count]) => (
                    <label key={district}>
                      <span>
                        <input
                          type="checkbox"
                          checked={props.selected.has(zoneKey(province, district))}
                          onChange={() => props.onDistrict(province, district)}
                        />
                        {district}
                      </span>
                      <small>{count}</small>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
          {!Object.keys(props.tree).length && <p className={styles.empty}>No se encontraron zonas.</p>}
        </div>
      </div>
    </Modal>
  );
}

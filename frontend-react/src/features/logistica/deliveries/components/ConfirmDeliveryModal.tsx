import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { formatDeliveryDate, formatWeight, packageTypeLabel, routeLabel } from '../domain';
import type { DeliveryClient, DeliveryPackage } from '../types';
import styles from '../Deliveries.module.css';

type Props = {
  open: boolean;
  client: DeliveryClient | null;
  packageItem: DeliveryPackage | null;
  observation: string;
  loading: boolean;
  onObservation: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDeliveryModal(props: Props) {
  return (
    <Modal
      open={props.open}
      title="Confirmar entrega"
      description="Verifica el paquete antes de registrar su recojo."
      maxWidth={570}
      onClose={props.onClose}
      footer={<><Button variant="secondary" onClick={props.onClose}>Cancelar</Button><Button loading={props.loading} onClick={props.onConfirm}>Confirmar entrega</Button></>}
    >
      <div className={styles.modalContent}>
        <dl>
          <Info label="Cliente" value={props.client?.nombre} />
          <Info label="Código" value={props.packageItem?.codigo_paquete} />
          <Info label="Ruta" value={routeLabel(props.packageItem)} />
          <Info label="Peso" value={formatWeight(props.packageItem?.peso_kg)} />
          <Info label="Tipo" value={props.packageItem ? packageTypeLabel(props.packageItem) : '—'} />
          <Info label="Fecha de ingreso" value={formatDeliveryDate(props.packageItem?.fecha_ingreso)} />
        </dl>
        <label className={styles.observation}><span>Observación</span><textarea autoFocus maxLength={255} rows={4} value={props.observation} onChange={event => props.onObservation(event.target.value)} placeholder="Entregado con DNI físico" /><small>{props.observation.length}/255</small></label>
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}

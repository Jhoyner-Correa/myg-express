import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { PERMISSIONS, usePermissions } from '../../core/auth/permissions';
import { showConfirm, showToast } from '../../core/utils/toast';
import { ConfirmDeliveryModal } from './deliveries/components/ConfirmDeliveryModal';
import { DeliveryProfile } from './deliveries/components/DeliveryProfile';
import { DeliverySearchPanel } from './deliveries/components/DeliverySearchPanel';
import { deliveriesService } from './deliveries/deliveries.service';
import { downloadDeliveriesCsv } from './deliveries/exportCsv';
import { useDeliveries } from './deliveries/hooks/useDeliveries';
import type { DeliveryPackage } from './deliveries/types';
import styles from './deliveries/Deliveries.module.css';

const DEFAULT_OBSERVATION = 'Entregado con DNI físico';

export const GestionEntregas: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.DELIVERIES_MANAGE);
  const delivery = useDeliveries();
  const searchRef = useRef<HTMLInputElement>(null);
  const [modalPackage, setModalPackage] = useState<DeliveryPackage | null>(null);
  const [observation, setObservation] = useState(DEFAULT_OBSERVATION);
  const [saving, setSaving] = useState(false);

  const currentDate = useMemo(() => new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date()), []);

  const search = () => {
    const hasFilter = Boolean(delivery.filters.status || delivery.filters.date || delivery.filters.routeId);
    if (!delivery.filters.query.trim() && !hasFilter) {
      showToast('Ingresa un nombre, teléfono, código o selecciona un filtro.', 'warning', { title: 'Búsqueda incompleta' });
      searchRef.current?.focus();
      return;
    }
    void delivery.search();
  };

  const reset = () => {
    delivery.reset();
    window.requestAnimationFrame(() => searchRef.current?.focus());
  };

  const openDelivery = (item: DeliveryPackage) => {
    setModalPackage(item);
    setObservation(DEFAULT_OBSERVATION);
  };

  const closeDelivery = () => {
    if (saving) return;
    setModalPackage(null);
    setObservation(DEFAULT_OBSERVATION);
  };

  const confirmDelivery = async () => {
    if (!modalPackage || !canManage) return;
    setSaving(true);
    try {
      await deliveriesService.deliver(modalPackage.id, observation.trim() || 'Recogido en oficina');
      setModalPackage(null);
      showToast('Entrega confirmada correctamente.', 'success', { title: 'Paquete entregado' });
      await delivery.refreshCurrent();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo confirmar la entrega.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const revertDelivery = async (item: DeliveryPackage) => {
    if (!canManage) return;
    const accepted = await showConfirm({
      title: 'Revertir entrega',
      message: `El paquete “${item.codigo_paquete || item.id}” volverá a estado pendiente.`,
      confirmText: 'Revertir', cancelText: 'Cancelar', type: 'warning',
    });
    if (!accepted) return;
    try {
      await deliveriesService.revert(item.id);
      showToast('Paquete devuelto a pendiente.', 'success');
      await delivery.refreshCurrent();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo revertir la entrega.'), 'error');
    }
  };

  const exportCsv = () => {
    if (!delivery.selectedClient || !delivery.packages.length) return;
    downloadDeliveriesCsv(delivery.selectedClient, delivery.packages);
    showToast('Archivo CSV generado correctamente.', 'success');
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      <PageHeader
        icon={<ClipboardCheck />}
        title="Gestión de entregas"
        subtitle="Entregas físicas y recojo en oficina"
        metadata={<><span>{currentDate}</span><span className={styles.headerRole}><i />{user?.rol || 'Encargado de oficina'}</span></>}
      />
      <div className={styles.content}>
        <section className={styles.summary} aria-label="Resumen de entregas">
          <div><small>Pendientes</small><strong>{delivery.stats.pendientes}</strong><span>por entregar</span></div>
          <div><small>Recogidos</small><strong>{delivery.stats.recogidos}</strong><span>confirmados</span></div>
          <div><small>Total habilitado</small><strong>{delivery.stats.total}</strong><span>paquetes</span></div>
        </section>
        {Boolean(delivery.initialError) && (
          <div className={styles.warning} role="alert"><AlertTriangle /><span>No se pudo actualizar el resumen o las rutas.</span><button type="button" onClick={() => void delivery.reloadInitial()}>Reintentar</button></div>
        )}
        <section className={styles.workspace} aria-label="Gestión de entregas">
          <DeliverySearchPanel
            inputRef={searchRef}
            filters={delivery.filters}
            routes={delivery.routes}
            clients={delivery.clients}
            selectedKey={delivery.selectedClient?.cliente_key}
            searching={delivery.searching}
            hasSearched={delivery.hasSearched}
            error={delivery.searchError ? getApiErrorMessage(delivery.searchError, 'No se pudo buscar clientes.') : undefined}
            onFilters={delivery.setFilters}
            onSearch={search}
            onReset={reset}
            onSelect={client => void delivery.selectClient(client)}
          />
          <section className={`${styles.card} ${styles.profileCard}`}>
            <DeliveryProfile
              client={delivery.selectedClient}
              packages={delivery.packages}
              siteName={user?.sede_nombre || ''}
              loading={delivery.loadingProfile}
              error={delivery.profileError ? getApiErrorMessage(delivery.profileError, 'No se pudo cargar la ficha.') : undefined}
              canManage={canManage}
              onExport={exportCsv}
              onDeliver={openDelivery}
              onRevert={item => void revertDelivery(item)}
              onRetry={() => delivery.selectedClient && void delivery.selectClient(delivery.selectedClient)}
            />
          </section>
        </section>
      </div>
      <ConfirmDeliveryModal
        open={Boolean(modalPackage)}
        client={delivery.selectedClient}
        packageItem={modalPackage}
        observation={observation}
        loading={saving}
        onObservation={setObservation}
        onConfirm={() => void confirmDelivery()}
        onClose={closeDelivery}
      />
    </main>
  );
};

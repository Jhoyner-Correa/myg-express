import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { PERMISSIONS, usePermissions } from '../../core/auth/permissions';
import { showConfirm, showToast } from '../../core/utils/toast';
import { RouteLookupPanel } from './route-lookup/components/RouteLookupPanel';
import { RouteLookupResults } from './route-lookup/components/RouteLookupResults';
import { normalizeRouteId, toNoticeImport } from './route-lookup/domain';
import { downloadRouteExcel } from './route-lookup/exportExcel';
import { useRouteLookup } from './route-lookup/hooks/useRouteLookup';
import { routeLookupService } from './route-lookup/routeLookup.service';
import styles from './route-lookup/RouteLookup.module.css';

export const ConsultaHistorica: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.URBANO_ROUTES_MANAGE) && can(PERMISSIONS.NOTICES_MANAGE);
  const lookup = useRouteLookup();
  const [importing, setImporting] = useState(false);
  const currentDate = useMemo(() => new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date()), []);

  const consult = async () => {
    const routeId = normalizeRouteId(lookup.routeId);
    if (!routeId) {
      showToast('Ingresa un n\u00famero de ruta v\u00e1lido.', 'warning', { title: 'Ruta requerida' });
      return;
    }
    const result = await lookup.lookup();
    if (result) showToast(`${result.records?.length ?? 0} registros encontrados.`, 'success', { title: 'Consulta completada' });
  };

  const exportExcel = async () => {
    if (!lookup.filteredRecords.length) return;
    try {
      await downloadRouteExcel(lookup.result?.routeId || lookup.routeId, lookup.filteredRecords);
      showToast('Archivo Excel generado correctamente.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo generar el archivo Excel.'), 'error');
    }
  };

  const importToRoute = async () => {
    if (!canManage || !lookup.selectedDestination) return;
    const notices = lookup.filteredRecords.map(toNoticeImport).filter(item => item.telefono.length >= 8 && item.codigo_paquete);
    if (!notices.length) {
      showToast('Los resultados no contienen tel\u00e9fonos y c\u00f3digos v\u00e1lidos.', 'warning', { title: 'Sin registros importables' });
      return;
    }
    const skipped = lookup.filteredRecords.length - notices.length;
    const accepted = await showConfirm({
      title: 'Importar registros al lote',
      message: `Se agregar\u00e1n ${notices.length} registros a \u201c${lookup.selectedDestination.nombre_lote}\u201d.${skipped ? ` ${skipped} registros inv\u00e1lidos ser\u00e1n omitidos.` : ''}`,
      confirmText: 'Importar registros', cancelText: 'Cancelar', type: 'success',
    });
    if (!accepted) return;
    setImporting(true);
    try {
      const outcome = await routeLookupService.importNotices(lookup.selectedDestination.id, notices);
      if (!outcome.imported) {
        showToast('Estas gu\u00edas ya exist\u00edan en el lote seleccionado.', 'info', { title: 'Sin duplicados' });
      } else {
        showToast(`${outcome.imported} registros importados.${outcome.skipped ? ` ${outcome.skipped} omitidos.` : ''}`, 'success', { title: 'Importaci\u00f3n completada' });
      }
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudieron importar los registros.'), 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      <PageHeader icon={<Search />} title="Consulta de rutas" subtitle={'Consulta gu\u00edas de Urbano en tiempo real'} metadata={<><span>{currentDate}</span><span className={styles.headerRole}><i />{user?.rol || 'Encargado de oficina'}</span></>} />
      <div className={styles.content}>
        {Boolean(lookup.initialError) && <div className={styles.warning} role="alert"><AlertTriangle /><span>{'No se pudo cargar toda la configuraci\u00f3n inicial.'}</span><button type="button" onClick={() => void lookup.reloadInitial()}>Reintentar</button></div>}
        <RouteLookupPanel
          routeId={lookup.routeId} loading={lookup.loading} importing={importing} connected={lookup.connected}
          localities={lookup.localities} filters={lookup.filters} destinations={lookup.destinations}
          selectedDestinationId={lookup.selectedDestinationId} resultCount={lookup.filteredRecords.length}
          canManage={canManage} onRouteId={lookup.setRouteId} onFilters={lookup.setFilters}
          onDestination={lookup.setSelectedDestinationId} onLookup={() => void consult()}
          onExport={() => void exportExcel()} onImport={() => void importToRoute()}
        />
        <RouteLookupResults
          routeId={lookup.result?.routeId || lookup.routeId} records={lookup.filteredRecords}
          totalRecords={lookup.records.length}
          totalGuides={lookup.result?.totalGuias ?? lookup.records.length}
          localityCount={lookup.localities.length}
          contractFilter={lookup.filters.contract}
          onContractFilter={contract => lookup.setFilters({ ...lookup.filters, contract })}
          loading={lookup.loading}
          error={lookup.lookupError ? getApiErrorMessage(lookup.lookupError, 'No se pudo consultar la ruta en Urbano.') : undefined}
        />
      </div>
    </main>
  );
};

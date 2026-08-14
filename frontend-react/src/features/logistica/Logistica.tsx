// ============================================================
// frontend-react/src/features/logistica/Logistica.tsx
// Módulo de Logística (Gestión de Rutas) - React + TS
// Estructura y clases exactas de rutas.html original
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/authState';
import { PERMISSIONS, usePermissions } from '../../core/auth/permissions';
import { getApiErrorMessage } from '../../core/api/errors';
import { showToast, showConfirm } from '../../core/utils/toast';
import { RoutesToolbar } from './routes/components/RoutesToolbar';
import { RouteListSection } from './routes/components/RouteListSection';
import { RouteEditorModal } from './routes/components/RouteEditorModal';
import { RoutesHistoryModal } from './routes/components/RoutesHistoryModal';
import { RouteReportModal } from './routes/components/RouteReportModal';
import { RouteRowActions } from './routes/components/RouteRowActions';
import { RoutesOverview } from './routes/components/RoutesOverview';
import type { RouteDateFilter, RouteStatusFilter } from './routes/components/RoutesToolbar';
import type { ReportSummary, RouteItem, RouteNoticeSummaryItem } from './routes/types';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { Button } from '../../components/ui/Button/Button';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import pageStyles from './routes/RoutesPage.module.css';
import { routesService } from './routes/routes.service';
import { useRoutesData } from './routes/hooks/useRoutesData';
import { routeStatusLabel } from './routes/formatters';
import { AlertTriangle, MapPin, RefreshCw } from 'lucide-react';

const ROLES_MAP: Record<string, string> = {
  SysAdmin: 'Administrador del Sistema',
  AdminEmpresa: 'Administrador General',
  EncargadoOficina: 'Encargado de Oficina'
};

type HistoryScope = 'all' | 'today';

export const Logistica: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();

  const { routes, zones, loading, error, reload, refreshZones } = useRoutesData();
  const canManageRoutes = can(PERMISSIONS.ROUTES_MANAGE);
  const canViewNotices = can(PERMISSIONS.NOTICES_VIEW);
  const canManageDeliveries = can(PERMISSIONS.DELIVERIES_MANAGE);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<RouteDateFilter>('todos');
  const [filterStatus, setFilterStatus] = useState<RouteStatusFilter>('todos');

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyScope, setHistoryScope] = useState<HistoryScope>('all');
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Datos del Reporte
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportSummary | null>(null);
  const [reportRouteName, setReportRouteName] = useState('');

  // Buscador interno del modal de historial
  const [searchQueryHistory, setSearchQueryHistory] = useState('');

  // Creación de zonas y lotes
  const [selectedZoneName, setSelectedZoneName] = useState('');
  
  // Edición de nombre
  const [editandoId, setEditandoId] = useState<number | null>(null);

  // Obtener fecha actual en formato topbar
  const [currentDate] = useState(() => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('es-ES', options);
  });

  const renderRowActions = (route: RouteItem) => {
    return (
      <RouteRowActions
        route={route}
        canReport={canViewNotices}
        canEdit={canManageRoutes && String(route.fecha || '').startsWith(getTodayKey())}
        canEnableDeliveries={canManageDeliveries}
        canDelete={canManageRoutes}
        onReport={() => handleOpenReport(route.id, route.nombre_lote)}
        onEdit={() => {
          setEditandoId(route.id);
          setSelectedZoneName(route.nombre_lote);
          setShowCreateModal(true);
        }}
        onEnableDeliveries={() => handleEnableDeliveries(route.id)}
        onDelete={() => handleDeleteRoute(route.id)}
        onViewDetail={() => {
          setShowHistoryModal(false);
          navigate(`/rutas/${route.id}`);
        }}
      />
    );
  };



  // Crear Lote/Ruta
  const handleCreateRoute = async () => {
    if (!selectedZoneName) return;

    try {
      await routesService.createRoute({
        origen: 'Temu',
        nombre_lote: selectedZoneName
      });
      setShowCreateModal(false);
      setSelectedZoneName('');
      showToast('Ruta creada correctamente.', 'success', { title: 'Ruta creada' });
      await reload();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Error al crear la ruta'), 'error', { title: 'Error' });
    }
  };

  // Habilitar entregas
  const handleEnableDeliveries = async (id: number) => {
    try {
      await routesService.enableDeliveries(id);
      showToast('Entregas habilitadas correctamente.', 'success', { title: 'Entregas habilitadas' });
      await reload();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Error al habilitar las entregas'), 'error', { title: 'Error' });
    }
  };

  // Eliminar Lote
  const handleDeleteRoute = async (id: number) => {
    const confirmed = await showConfirm({
      title: '¿Eliminar ruta?',
      message: '¿Está seguro de eliminar esta ruta y todos sus paquetes asociados?',
      type: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    try {
      await routesService.deleteRoute(id);
      showToast('Ruta eliminada correctamente.', 'success', { title: 'Eliminado' });
      await reload();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Error al eliminar la ruta'), 'error', { title: 'Error' });
    }
  };

  // Guardar Edición de Nombre
  const handleSaveRouteName = async (id: number) => {
    if (!selectedZoneName.trim()) return;
    try {
      await routesService.renameRoute(id, selectedZoneName);
      setEditandoId(null);
      setSelectedZoneName('');
      setShowCreateModal(false);
      showToast('Ruta renombrada correctamente.', 'success', { title: 'Guardado' });
      await reload();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Error al renombrar la ruta'), 'error', { title: 'Error' });
    }
  };

  // Crear Zona
  const handleCreateZone = async (name: string) => {
    if (!name.trim()) return;
    try {
      await routesService.createZone(name);
      showToast('Zona creada correctamente.', 'success', { title: 'Zona creada' });
      await refreshZones();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Error al crear la zona'), 'error', { title: 'Error' });
    }
  };

  // Eliminar Zona
  const handleDeleteZone = async (id: number) => {
    try {
      await routesService.deleteZone(id);
      showToast('Zona eliminada correctamente.', 'success', { title: 'Eliminado' });
      await refreshZones();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Error al eliminar la zona'), 'error', { title: 'Error' });
    }
  };

  const closeRouteEditor = useCallback(() => {
    setShowCreateModal(false);
    setEditandoId(null);
    setSelectedZoneName('');
  }, []);

  // Cargar Reporte
  const handleOpenReport = async (routeId: number, routeName: string) => {
    setReportRouteName(routeName);
    setReportData(null);
    setReportLoading(true);
    setShowReportModal(true);

    try {
      const avisos = await routesService.listRouteNotices(routeId);
      
      const summary: ReportSummary = {
        total: avisos.length,
        enviados: 0,
        pendientes: 0,
        fallidos: 0,
        manuales: 0,
        sinWhatsapp: 0,
        manualList: [],
        nowaList: []
      };

      avisos.forEach((aviso: RouteNoticeSummaryItem) => {
        const status = String(aviso.estado_aviso || '').toLowerCase();
        if (status === 'enviado' || status === 'entregado') {
          summary.enviados += 1;
        } else if (status === 'enviado_manual' || status === 'manual') {
          summary.manuales += 1;
          summary.manualList.push(aviso);
        } else if (status === 'pendiente') {
          summary.pendientes += 1;
        } else if (status === 'fallido' || status === 'error' || status === 'auth_failure') {
          summary.fallidos += 1;
        } else if (status === 'sin_whatsapp') {
          summary.sinWhatsapp += 1;
          summary.nowaList.push(aviso);
        }
      });

      setReportData(summary);
    } catch (e) {
      console.error('Error al cargar reporte de ruta:', e);
    } finally {
      setReportLoading(false);
    }
  };


  // Filtrado y Búsqueda
  const getTodayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const getYesterdayKey = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filteredRoutes = useMemo(() => {
    const todayKey = getTodayKey();
    const yesterdayKey = getYesterdayKey();

    return routes.filter((item) => {
      // Búsqueda
      if (searchQuery) {
        const needle = searchQuery.toLowerCase();
        const haystack = [item.nombre_lote, item.origen, item.sede_nombre, item.zona, `MYG-${item.id}`]
          .map(v => String(v || '').toLowerCase()).join(' ');
        if (!haystack.includes(needle)) return false;
      }

      // Fecha
      if (filterDate === 'hoy') {
        if (!item.fecha?.startsWith(todayKey)) return false;
      } else if (filterDate === 'ayer') {
        if (!item.fecha?.startsWith(yesterdayKey)) return false;
      } else if (filterDate === '7d') {
        const routeTime = new Date(item.fecha).getTime();
        const limitTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (routeTime < limitTime) return false;
      }

      // Estado
      if (filterStatus !== 'todos') {
        const status = (item.estado || 'pendiente').toLowerCase();
        if (filterStatus === 'pendiente') {
          if (status !== 'pendiente' && status !== 'borrador') return false;
        } else if (status !== filterStatus) {
          return false;
        }
      }

      return true;
    });
  }, [routes, searchQuery, filterDate, filterStatus]);

  // Dividir Rutas: Hoy e Historial
  const { routesToday, routesHistory } = useMemo(() => {
    const todayKey = getTodayKey();
    const todayList = filteredRoutes.filter(r => r.fecha?.startsWith(todayKey));
    const historyList = filteredRoutes.filter(r => !r.fecha?.startsWith(todayKey));
    return { routesToday: todayList, routesHistory: historyList };
  }, [filteredRoutes]);

  // Compensa el espacio liberado por las rutas de hoy con más filas de historial.
  // 0 hoy → 3 históricas; 1 → 6; 2 → 5; 3 → 4; 4 o más → 3.
  const historyPreviewLimit = routesToday.length === 0
    ? 3
    : Math.max(3, 7 - Math.min(routesToday.length, 4));

  // Rutas en el modal. La vista "Rutas de hoy" usa un alcance real,
  // independiente del buscador, para no convertir la fecha en texto de búsqueda.
  const historyBaseRoutes = useMemo(() => {
    if (historyScope === 'today') {
      const todayKey = getTodayKey();
      return routes.filter(item => item.fecha?.startsWith(todayKey));
    }
    return routes;
  }, [historyScope, routes]);

  const filteredHistoryModal = useMemo(() => {
    return historyBaseRoutes.filter((item) => {
      if (!searchQueryHistory) return true;
      const needle = searchQueryHistory.toLowerCase();
      const haystack = [item.nombre_lote, item.origen, item.sede_nombre, item.zona, `MYG-${item.id}`, routeStatusLabel(item.estado)]
        .map(v => String(v || '').toLowerCase()).join(' ');
      return haystack.includes(needle);
    });
  }, [historyBaseRoutes, searchQueryHistory]);

  const historyStats = useMemo(() => {
    const totalRutas = historyBaseRoutes.length;
    const totalPaquetes = historyBaseRoutes.reduce((sum, r) => sum + (r.total_registros || 0), 0);
    const promedio = totalRutas > 0 ? Math.round(totalPaquetes / totalRutas) : 0;
    return { totalRutas, totalPaquetes, promedio };
  }, [historyBaseRoutes]);

  return (
    <main className={`main ${pageStyles.page} rutas-page`} id="main-content">
      <PageHeader
        icon={<MapPin />}
        title="Rutas"
        subtitle="Gestión de rutas diarias por sede"
        metadata={(
          <div className={pageStyles.headerMeta}>
            <span>{currentDate}</span>
            <span className={pageStyles.role}>
              {user?.tipo_usuario === 'SISTEMA' ? 'Administrador del Sistema' : (user?.rol ? (ROLES_MAP[user.rol] || user.rol) : 'Operador')}
            </span>
          </div>
        )}
      />

      {/* CUERPO DEL CONTENIDO */}
      <section className={pageStyles.content}>
        {loading && routes.length === 0 ? (
          <div className={pageStyles.loadState}>
            <PageLoader compact label="Cargando rutas" />
            <strong>Cargando información de rutas</strong>
            <p>Estamos consultando los datos de tu sede.</p>
          </div>
        ) : error && routes.length === 0 ? (
          <div className={`${pageStyles.loadState} ${pageStyles.errorState}`} role="alert">
            <span className={pageStyles.stateIcon}><AlertTriangle aria-hidden="true" /></span>
            <strong>No se pudieron cargar las rutas</strong>
            <p>{getApiErrorMessage(error, 'Verifica la conexión con el servidor e inténtalo nuevamente.')}</p>
            <Button size="sm" icon={<RefreshCw aria-hidden="true" />} onClick={() => void reload()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
        {error && (
          <div className={pageStyles.refreshWarning} role="alert">
            <AlertTriangle aria-hidden="true" />
            <span>No se pudo actualizar la información. Se muestran los últimos datos disponibles.</span>
            <button type="button" onClick={() => void reload()}>Reintentar</button>
          </div>
        )}
        <RoutesOverview routes={routes} />


        {/* BARRA DE HERRAMIENTAS ORIGINAL */}
        <RoutesToolbar
          search={searchQuery}
          dateFilter={filterDate}
          statusFilter={filterStatus}
          onSearchChange={setSearchQuery}
          onDateFilterChange={setFilterDate}
          onStatusFilterChange={setFilterStatus}
          onCreate={() => setShowCreateModal(true)}
          canCreate={canManageRoutes}
        />


        <RouteListSection
          id="titulo-rutas-hoy"
          title="Rutas de hoy"
          routes={routesToday}
          dateHeading="Creada"
          getDate={route => route.created_at}
          emptyTitle="No hay rutas registradas hoy"
          emptyDescription="Crea una nueva ruta para comenzar."
          renderActions={renderRowActions}
          onViewOverflow={() => {
            setHistoryScope('today');
            setSearchQueryHistory('');
            setShowHistoryModal(true);
          }}
        />

        <RouteListSection
          id="titulo-rutas-historial"
          title="Rutas finalizadas / Historial"
          routes={routesHistory}
          dateHeading="Finalizada"
          getDate={route => route.finished_at || route.fecha_finalizacion || route.updated_at || route.created_at || route.fecha}
          emptyTitle="No hay historial de rutas anteriores"
          renderActions={renderRowActions}
          limit={historyPreviewLimit}
          onViewAll={() => {
            setHistoryScope('all');
            setSearchQueryHistory('');
            setShowHistoryModal(true);
          }}
        />
          </>
        )}
      </section>

      <RouteEditorModal
        open={showCreateModal}
        editing={editandoId !== null}
        zones={zones}
        selectedName={selectedZoneName}
        onSelectedNameChange={setSelectedZoneName}
        onSubmit={() => editandoId !== null ? handleSaveRouteName(editandoId) : handleCreateRoute()}
        onCreateZone={handleCreateZone}
        onDeleteZone={handleDeleteZone}
        onClose={closeRouteEditor}
      />


      <RoutesHistoryModal
        open={showHistoryModal}
        routes={filteredHistoryModal}
        query={searchQueryHistory}
        stats={historyStats}
        scope={historyScope}
        onQueryChange={setSearchQueryHistory}
        onClose={() => setShowHistoryModal(false)}
        getDate={route => String(route.fecha || '').startsWith(getTodayKey())
          ? (route.created_at || route.fecha)
          : (route.fecha_finalizacion || route.finished_at || route.updated_at || route.created_at || route.fecha)}
        renderActions={renderRowActions}
      />


      <RouteReportModal
        open={showReportModal}
        loading={reportLoading}
        routeName={reportRouteName}
        data={reportData}
        onClose={() => setShowReportModal(false)}
      />


    </main>
  );
};

// ============================================================
// frontend-react/src/features/logistica/Logistica.tsx
// Módulo de Logística (Gestión de Rutas) - React + TS
// Estructura y clases exactas de rutas.html original
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/authState';
import apiClient from '../../core/api/apiClient';
import { showToast, showConfirm } from '../../core/utils/toast';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { 
  MapPin, 
  BarChart2, 
  Edit3, 
  MoreVertical, 
  ChevronRight 
} from 'lucide-react';

type RouteItem = {
  id: number;
  nombre_lote: string;
  zona?: string;
  origen?: string;
  sede_nombre?: string;
  total_registros: number;
  estado: string;
  fecha: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
  fecha_finalizacion?: string;
  entregas_habilitado: number;
};

type ZoneItem = {
  id: number;
  nombre: string;
};

type ReportSummary = {
  total: number;
  enviados: number;
  pendientes: number;
  fallidos: number;
  manuales: number;
  sinWhatsapp: number;
  manualList: any[];
  nowaList: any[];
};

const ROLES_MAP: Record<string, string> = {
  SysAdmin: 'Administrador del Sistema',
  AdminEmpresa: 'Administrador General',
  EncargadoOficina: 'Encargado de Oficina'
};

export const Logistica: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [, setLoading] = useState(false);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Datos del Reporte
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportSummary | null>(null);
  const [reportRouteName, setReportRouteName] = useState('');
  const [showReportManualDetail, setShowReportManualDetail] = useState(false);
  const [showReportNowaDetail, setShowReportNowaDetail] = useState(false);

  // Buscador interno del modal de historial
  const [searchQueryHistory, setSearchQueryHistory] = useState('');

  // Creación de zonas y lotes
  const [newZoneName, setNewZoneName] = useState('');
  const [selectedZoneName, setSelectedZoneName] = useState('');
  
  // Acciones en fila (Dropdown / Opciones)
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number } | null>(null);
  
  // Edición de nombre
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [showZoneEditor, setShowZoneEditor] = useState(false);

  // Obtener fecha actual en formato topbar
  const [currentDate] = useState(() => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('es-ES', options);
  });

  function getRouteSortTime(route: RouteItem) {
    const candidates = [route?.created_at, route?.updated_at, route?.fecha];
    for (const value of candidates) {
      if (!value) continue;
      const time = new Date(value).getTime();
      if (!isNaN(time)) return time;
    }
    return 0;
  }

  function compareRoutesNewestFirst(a: RouteItem, b: RouteItem) {
    const byDate = getRouteSortTime(b) - getRouteSortTime(a);
    if (byDate !== 0) return byDate;
    return Number(b?.id || 0) - Number(a?.id || 0);
  }

  // Cargar datos
  const loadData = async () => {
    setLoading(true);
    try {
      const [routesRes, zonesRes] = await Promise.all([
        apiClient.get('/lotes'),
        apiClient.get('/zonas')
      ]);
      if (routesRes.data?.ok) {
        const sorted = (routesRes.data.data || []).slice().sort(compareRoutesNewestFirst);
        setRoutes(sorted);
      }
      if (zonesRes.data?.ok) setZones(zonesRes.data.data || []);
    } catch (e) {
      console.error('Error al cargar datos logísticos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Cerrar el menú dropdown si se hace click fuera
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.btn-options') && !target.closest('.options-dropdown-menu')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  const activeRoute = useMemo(() => {
    return routes.find((r) => r.id === activeDropdownId);
  }, [routes, activeDropdownId]);

  const renderRowActions = (route: RouteItem) => {
    return (
      <div className="action-buttons">
        <button 
          className="btn-action-premium btn-reporte" 
          onClick={() => handleOpenReport(route.id, route.nombre_lote)}
          title="Ver reporte"
        >
          <BarChart2 size={16} />
        </button>
        {String(route.fecha || '').startsWith(getTodayKey()) && (
          <button 
            className="btn-action-premium btn-editar" 
            onClick={() => {
              setEditandoId(route.id);
              setSelectedZoneName(route.nombre_lote);
              setShowCreateModal(true);
            }}
            title="Editar nombre"
          >
            <Edit3 size={16} />
          </button>
        )}
        
        {/* Botón de opciones adicionales */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button 
            className="btn-action-premium btn-options" 
            onClick={(e) => {
              e.stopPropagation();
              const isCurrentlyActive = activeDropdownId === route.id;
              if (isCurrentlyActive) {
                setActiveDropdownId(null);
                setDropdownCoords(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownCoords({
                  top: rect.bottom + window.scrollY + 6,
                  left: rect.right - 190
                });
                setActiveDropdownId(route.id);
              }
            }}
            title="Opciones"
          >
            <MoreVertical size={16} />
          </button>
        </div>

        <a 
          href="#" 
          onClick={(e) => { 
            e.preventDefault(); 
            setShowHistoryModal(false);
            navigate(`/rutas/${route.id}`); 
          }}
          className="btn-action-premium btn-ver-detalle"
        >
          Ver detalle
          <ChevronRight size={11} strokeWidth={2.5} style={{ marginLeft: '2px' }} />
        </a>
      </div>
    );
  };



  // Crear Lote/Ruta
  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZoneName) return;

    try {
      const response = await apiClient.post('/lotes', {
        origen: 'Temu',
        nombre_lote: selectedZoneName
      });
      if (response.data?.ok) {
        setShowCreateModal(false);
        setSelectedZoneName('');
        showToast('Ruta creada correctamente.', 'success', { title: 'Ruta creada' });
        loadData();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al crear la ruta', 'error', { title: 'Error' });
    }
  };

  // Habilitar entregas
  const handleEnableDeliveries = async (id: number) => {
    try {
      const response = await apiClient.post(`/lotes/${id}/entregas`);
      if (response.data?.ok) {
        setActiveDropdownId(null);
        showToast('Entregas habilitadas correctamente.', 'success', { title: 'Entregas habilitadas' });
        loadData();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al habilitar las entregas', 'error', { title: 'Error' });
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
      const response = await apiClient.delete(`/lotes/${id}`);
      if (response.data?.ok) {
        setActiveDropdownId(null);
        showToast('Ruta eliminada correctamente.', 'success', { title: 'Eliminado' });
        loadData();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al eliminar la ruta', 'error', { title: 'Error' });
    }
  };

  // Guardar Edición de Nombre
  const handleSaveRouteName = async (id: number) => {
    if (!selectedZoneName.trim()) return;
    try {
      const response = await apiClient.put(`/lotes/${id}`, {
        nombre_lote: selectedZoneName
      });
      if (response.data?.ok) {
        setEditandoId(null);
        setSelectedZoneName('');
        setShowCreateModal(false);
        showToast('Ruta renombrada correctamente.', 'success', { title: 'Guardado' });
        loadData();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al renombrar la ruta', 'error', { title: 'Error' });
    }
  };

  // Crear Zona
  const handleCreateZone = async () => {
    if (!newZoneName.trim()) return;
    try {
      const response = await apiClient.post('/zonas', {
        nombre: newZoneName
      });
      if (response.data?.ok) {
        setNewZoneName('');
        showToast('Zona creada correctamente.', 'success', { title: 'Zona creada' });
        const res = await apiClient.get('/zonas');
        if (res.data?.ok) setZones(res.data.data || []);
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al crear la zona', 'error', { title: 'Error' });
    }
  };

  // Eliminar Zona
  const handleDeleteZone = async (id: number) => {
    try {
      const response = await apiClient.delete(`/zonas/${id}`);
      if (response.data?.ok) {
        showToast('Zona eliminada correctamente.', 'success', { title: 'Eliminado' });
        const res = await apiClient.get('/zonas');
        if (res.data?.ok) setZones(res.data.data || []);
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al eliminar la zona', 'error', { title: 'Error' });
    }
  };

  // Cargar Reporte
  const handleOpenReport = async (routeId: number, routeName: string) => {
    setReportRouteName(routeName);
    setReportData(null);
    setReportLoading(true);
    setShowReportModal(true);
    setShowReportManualDetail(false);
    setShowReportNowaDetail(false);

    try {
      const response = await apiClient.get(`/avisos/lote/${routeId}`);
      const avisos = response.data?.data || [];
      
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

      avisos.forEach((aviso: any) => {
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

  // Rutas en el Modal de Historial Completo
  const filteredHistoryModal = useMemo(() => {
    return routes.filter((item) => {
      if (!searchQueryHistory) return true;
      const needle = searchQueryHistory.toLowerCase();
      const haystack = [item.nombre_lote, item.origen, item.sede_nombre, item.zona, `MYG-${item.id}`, getStatusLabel(item.estado)]
        .map(v => String(v || '').toLowerCase()).join(' ');
      return haystack.includes(needle);
    });
  }, [routes, searchQueryHistory]);

  const historyStats = useMemo(() => {
    const totalRutas = routesHistory.length;
    const totalPaquetes = routesHistory.reduce((sum, r) => sum + (r.total_registros || 0), 0);
    const promedio = totalRutas > 0 ? Math.round(totalPaquetes / totalRutas) : 0;
    return { totalRutas, totalPaquetes, promedio };
  }, [routesHistory]);

  const chartData = useMemo(() => {
    const buckets: { label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
      const count = routes.filter((r) => {
        const ts = r.created_at || r.fecha || r.updated_at || '';
        return ts.slice(0, 10) === dayStr;
      }).length;
      buckets.push({ label, count });
    }
    return {
      categories: buckets.map(b => b.label),
      series: [{ name: 'Rutas', data: buckets.map(b => b.count) }]
    };
  }, [routes]);

  const chartOptions: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      sparkline: { enabled: false },
      fontFamily: 'Inter, system-ui, sans-serif',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
        animateGradually: { enabled: true, delay: 150 },
        dynamicAnimation: { enabled: true, speed: 350 }
      },
      dropShadow: {
        enabled: true,
        top: 0,
        left: 0,
        blur: 3,
        color: '#16A34A',
        opacity: 0.1
      },
      selection: { enabled: false },
    },
    colors: ['#16A34A'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.1,
        opacityTo: 0.02,
        type: 'vertical',
        stops: [0, 60, 100],
        colorStops: [
          { offset: 0, color: '#16A34A', opacity: 0.1 },
          { offset: 60, color: '#16A34A', opacity: 0.04 },
          { offset: 100, color: '#16A34A', opacity: 0 }
        ]
      }
    },
    stroke: {
      curve: 'smooth',
      width: 3,
      lineCap: 'round' as any,
    },
    markers: {
      size: 4,
      colors: ['#ffffff'],
      strokeColors: ['#16A34A'],
      strokeWidth: 2,
      strokeOpacity: 1,
      fillOpacity: 1,
      shape: 'circle',
      hover: {
        size: 7,
        sizeOffset: 3,
      }
    },
    grid: {
      show: true,
      borderColor: '#f1f5f9',
      strokeDashArray: 0,
      position: 'back',
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 0, bottom: 0, left: 0 }
    },
    xaxis: {
      type: 'category',
      categories: chartData.categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        show: true,
        style: {
          colors: '#b0b8c4',
          fontSize: '10px',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 'normal',
        },
        offsetY: 6,
        formatter: (value: string, index: number) => {
          const total = chartData.categories.length;
          const showIndices = [0, Math.floor(total / 2), total - 1];
          if (showIndices.includes(index)) return value;
          return '';
        },
      },
      crosshairs: {
        show: true,
        width: 1,
        position: 'back',
        opacity: 0.25,
        stroke: { color: '#94a3b8', width: 1, dashArray: 4 }
      },
      tooltip: { enabled: false }
    },
    yaxis: {
      show: true,
      min: 0,
      tickAmount: 4,
      labels: {
        show: true,
        style: {
          colors: '#b0b8c4',
          fontSize: '10px',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 'normal',
        },
        offsetX: 0,
        formatter: (val: number) => Math.round(val).toString(),
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    tooltip: {
      enabled: true,
      theme: 'light',
      style: {
        fontSize: '12px',
        fontFamily: 'system-ui, sans-serif',
      },
      x: { show: false },
      marker: { show: false },
      custom: ({ series, seriesIndex, dataPointIndex, w }: any) => {
        const value = series[seriesIndex][dataPointIndex];
        const date = w.globals.labels[dataPointIndex];
        const prev = dataPointIndex > 0 ? series[seriesIndex][dataPointIndex - 1] : null;
        const variation = prev !== null ? value - prev : 0;
        const varSign = variation > 0 ? '+' : '';
        const varColor = variation > 0 ? '#16A34A' : variation < 0 ? '#EF4444' : '#64748b';
        return `<div style="
          background: #ffffff;
          border-radius: 6px;
          padding: 5px 8px;
          box-shadow: 0 1px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.01);
          border: 1px solid #f1f5f9;
          min-width: 70px;
        ">
          <div style="font-size: 8px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px;">
            ${date}
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 11px; font-weight: 700; color: #0f172a;">
              ${value}
            </span>
            <span style="font-size: 8px; font-weight: 600; color: ${varColor};">
              ${varSign}${variation}
            </span>
          </div>
          <div style="font-size: 7px; color: #94a3b8; font-weight: 500; margin-top: 0;">
            rutas creadas
          </div>
        </div>`;
      },
      fixed: { enabled: false },
      followCursor: true,
      intersect: false,
    },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const formatDateTime = (value: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;

    const day = date.getDate().toString().padStart(2, '0');
    const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'p. m.' : 'a. m.';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours.toString().padStart(2, '0');

    return `${day} ${month} ${year}, ${strHours}:${minutes} ${ampm}`;
  };

  const getStatusLabel = (val: string) => {
    if (val === 'completado') return 'Finalizada';
    if (val === 'procesando') return 'En proceso';
    if (val === 'cancelado') return 'Cancelado';
    if (val === 'pausado') return 'Pausado';
    return 'Pendiente';
  };

  const getStatusClass = (val: string) => {
    const status = String(val || 'pendiente').toLowerCase();
    return status === 'borrador' ? 'pendiente' : status;
  };

  return (
    <main className="main rutas-page" id="main-content">
      {/* HEADER ORIGINAL */}
      <header className="topbar">
        <div className="header-title-container">
          <div className="header-icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          <div>
            <div className="topbar-title">Rutas</div>
            <div className="topbar-sub">Gestión de rutas diarias por sede</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-date" id="current-date">{currentDate}</span>
          <div className="user-role-badge">
            <span className="status-dot"></span>
            <span id="user-rol-topbar">{user?.es_superadmin ? 'Super Administrador' : (user?.rol ? (ROLES_MAP[user.rol] || user.rol) : 'Operador')}</span>
          </div>
        </div>
      </header>

      {/* CUERPO DEL CONTENIDO */}
      <section className="content">
        
        {/* DASHBOARD KPI + CHART CARD ─ two-column layout */}
        <section 
          className="kpi-chart-card" 
          aria-label="Resumen y tendencia de rutas"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            boxShadow: '0 4px 18px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.03)',
            display: 'grid',
            gridTemplateColumns: '210px 1px 1fr',
            alignItems: 'stretch',
            overflow: 'hidden',
            height: '210px',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >

          {/* ── LEFT: KPI summary ── */}
            <div 
              className="kpi-left"
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '10px',
                padding: '16px 14px',
                boxSizing: 'border-box',
                height: '100%'
              }}
            >
              <div 
                className="kpi-icon-wrap" 
                aria-hidden="true"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#e8f5ec',
                  border: '1.5px solid #c3e6cb',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0
                }}
              >
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#137333" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M9 15l2 2 4-4"/>
                </svg>
              </div>
            <div 
              className="kpi-data"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                minWidth: 0,
                flex: 1
              }}
            >
              <span 
                className="kpi-label"
                style={{
                  fontSize: '0.63rem',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.3
                }}
              >
                Total de rutas creadas
              </span>
              <div 
                className="kpi-value-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '2px'
                }}
              >
                <strong 
                  className="kpi-value" 
                  id="kpi-total-count"
                  style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                    fontFamily: 'Inter, system-ui, sans-serif'
                  }}
                >
                  {routes.length}
                </strong>
                <span 
                  className="kpi-trend-badge" 
                  id="kpi-trend-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 9px',
                    borderRadius: '999px',
                    background: '#dcfce7',
                    color: '#15803d',
                    fontSize: '0.64rem',
                    fontWeight: 700,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    whiteSpace: 'nowrap',
                    border: '1px solid #bbf7d0'
                  }}
                >
                  {(() => {
                    const tk = getTodayKey();
                    const yk = getYesterdayKey();
                    const tc = routes.filter(r => r.fecha?.startsWith(tk)).length;
                    const yc = routes.filter(r => r.fecha?.startsWith(yk)).length;
                    let pct = 0;
                    if (yc > 0) pct = Math.round(((tc - yc) / yc) * 100);
                    else if (tc > 0) pct = 100;
                    const sign = pct >= 0 ? '+' : '';
                    return (
                      <>
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          {pct >= 0
                            ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
                            : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>
                          }
                        </svg>
                        <span>{sign}{pct}% vs ayer</span>
                      </>
                    );
                  })()}
                </span>
              </div>
              <span 
                className="kpi-subtext"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.68rem',
                  color: '#94a3b8',
                  fontWeight: 500,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  marginTop: '6px'
                }}
              >
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Todas las sedes
              </span>
            </div>
          </div>

          {/* ── DIVIDER ── */}
          <div 
            className="kpi-chart-divider" 
            aria-hidden="true"
            style={{
              width: '1px',
              background: '#e8edf3',
              alignSelf: 'stretch'
            }}
          />

          {/* ── RIGHT: Area chart ── */}
          <div 
            className="kpi-right"
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '14px 18px 12px 18px',
              minWidth: 0,
              height: '100%',
              boxSizing: 'border-box'
            }}
          >
            {/* Chart header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.3 }}>
                  Tendencia de rutas
                </span>
                <span style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif', marginTop: '1px' }}>
                  Últimos 14 días
                </span>
              </div>
            </div>

            {/* ApexCharts */}
            <div className="trend-chart-body" style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <Chart
                options={chartOptions}
                series={chartData.series}
                type="area"
                height="100%"
                width="100%"
              />
            </div>
          </div>

        </section>


        {/* BARRA DE HERRAMIENTAS ORIGINAL */}
        <section className="toolbar-premium" aria-label="Filtros de rutas">
          <div className="toolbar-left">
            <div className="search-wrap-premium">
              <span className="search-icon-left" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
              </span>
              <input 
                id="input-buscar" 
                type="search" 
                placeholder="Buscar ruta..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-select-wrapper">
              <span className="filter-select-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path></svg>
              </span>
              <select className="select-premium" id="filter-date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                <option value="todos">Todas las fechas</option>
                <option value="hoy">Hoy</option>
                <option value="ayer">Ayer</option>
                <option value="7d">Últimos 7 días</option>
              </select>
              <span className="select-arrow-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>
              </span>
            </div>

            <div className="filter-select-wrapper">
              <span className="filter-select-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M7 12h10"></path><path d="M10 17h4"></path></svg>
              </span>
              <select className="select-premium" id="filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="todos">Todos los estados</option>
                <option value="pendiente">Pendiente</option>
                <option value="procesando">Procesando</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <span className="select-arrow-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>
              </span>
            </div>
          </div>

          <button className="btn-primary-premium" id="btn-nuevo-lote" type="button" onClick={() => setShowCreateModal(true)}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            Nueva ruta
          </button>
        </section>

        {/* TABLA RUTAS DE HOY */}
        <section className="routes-section" aria-labelledby="titulo-rutas-hoy">
          <div className="section-header-premium">
            <div className="section-title-stack">
              <span className="section-indicator-bar" aria-hidden="true"></span>
              <h2 className="section-title-text" id="titulo-rutas-hoy">Rutas de hoy</h2>
              <span className="section-count-badge" id="today-count-badge">{routesToday.length} rutas</span>
            </div>
          </div>

          <div className="table-card-premium">
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Ruta</th>
                    <th>Zona</th>
                    <th>Paquetes</th>
                    <th>Estado</th>
                    <th>Creada</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody id="tabla-lotes-hoy">
                  {routesToday.length > 0 ? (
                    routesToday.slice(0, 5).map((route, index) => (
                      <tr key={route.id}>
                        <td className="col-num">
                          <div className="col-flex-align" style={{ justifyContent: 'center' }}>
                            <span className="route-id-badge">{index + 1}</span>
                          </div>
                        </td>
                        <td className="col-route-code">
                          <div className="col-flex-align">
                            <span>MYG-{route.id}</span>
                          </div>
                        </td>
                        <td className="col-route-name">
                          <div className="col-flex-align">
                            <MapPin className="zone-pin-icon" size={14} style={{ color: '#64748b' }} />
                            <span>{route.nombre_lote}</span>
                          </div>
                        </td>
                        <td className="col-paquetes">
                          <div className="col-flex-align" style={{ justifyContent: 'center' }}>
                            {route.total_registros}
                          </div>
                        </td>
                        <td>
                          <div className="col-flex-align">
                            <span className={`estado-badge estado-${getStatusClass(route.estado)}`}>
                              <span className="estado-dot"></span>
                              {getStatusLabel(route.estado)}
                            </span>
                          </div>
                        </td>
                        <td className="col-date">
                          <div className="col-flex-align">
                            {formatDateTime(route.created_at)}
                          </div>
                        </td>
                        <td>
                          <div className="col-flex-align" style={{ justifyContent: 'flex-end' }}>
                            {renderRowActions(route)}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="empty-row">
                        <div className="empty-icon-box">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                          </svg>
                        </div>
                        <div className="empty-title">No hay rutas registradas hoy.</div>
                        <div className="empty-subtitle">Crea una nueva ruta para comenzar.</div>
                      </td>
                    </tr>
                  )}

                  {routesToday.length > 5 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Mostrando 5 de {routesToday.length} rutas de hoy</span>
                          <button 
                            type="button" 
                            className="btn-ver-mas-historial" 
                            style={{ background: 'none', border: 'none', color: '#1d7d48', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => {
                              setSearchQueryHistory(getTodayKey());
                              setShowHistoryModal(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Ver todas las rutas de hoy
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* TABLA HISTORIAL */}
        <section className="routes-section" aria-labelledby="titulo-rutas-historial">
          <div className="section-header-premium">
            <div className="section-title-stack">
              <span className="section-indicator-bar" aria-hidden="true"></span>
              <h2 className="section-title-text" id="titulo-rutas-historial">Rutas finalizadas / Historial</h2>
              <span className="section-count-badge">{routesHistory.length} rutas</span>
            </div>
            <button className="btn-section-link" id="btn-ver-todo-historial" type="button" onClick={() => { setSearchQueryHistory(''); setShowHistoryModal(true); }}>
              Ver historial completo
              <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
          </div>

          <div className="table-card-premium">
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Ruta</th>
                    <th>Zona</th>
                    <th>Paquetes</th>
                    <th>Estado</th>
                    <th>Finalizada</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody id="tabla-lotes-historial">
                  {routesHistory.length > 0 ? (
                    routesHistory.slice(0, 5).map((route, index) => (
                      <tr key={route.id}>
                        <td className="col-num">
                          <div className="col-flex-align" style={{ justifyContent: 'center' }}>
                            <span className="route-id-badge">{index + 1}</span>
                          </div>
                        </td>
                        <td className="col-route-code">
                          <div className="col-flex-align">
                            <span>MYG-{route.id}</span>
                          </div>
                        </td>
                        <td className="col-route-name">
                          <div className="col-flex-align">
                            <MapPin className="zone-pin-icon" size={14} style={{ color: '#64748b' }} />
                            <span>{route.nombre_lote}</span>
                          </div>
                        </td>
                        <td className="col-paquetes">
                          <div className="col-flex-align" style={{ justifyContent: 'center' }}>
                            {route.total_registros}
                          </div>
                        </td>
                        <td>
                          <div className="col-flex-align">
                            <span className={`estado-badge estado-${getStatusClass(route.estado)}`}>
                              <span className="estado-dot"></span>
                              {getStatusLabel(route.estado)}
                            </span>
                          </div>
                        </td>
                        <td className="col-date">
                          <div className="col-flex-align">
                            {formatDateTime(route.finished_at || route.fecha_finalizacion || route.updated_at || route.created_at || route.fecha)}
                          </div>
                        </td>
                        <td>
                          <div className="col-flex-align" style={{ justifyContent: 'flex-end' }}>
                            {renderRowActions(route)}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="empty-row">
                        <div className="empty-icon-box">
                          <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                        </div>
                        <div>No hay historial de rutas anteriores.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>

      {/* MODAL ORIGINAL: CREAR O EDITAR RUTA CON GESTIÓN DE ZONAS INLINE */}
      {showCreateModal && (
        <div className="modal-overlay open" id="modal-lote" aria-hidden="false">
          <div className="modal-box route-modal" role="dialog" aria-modal="true" aria-labelledby="modal-lote-title">
            <div className="modal-header">
              <div>
                <h2 className="modal-title" id="modal-lote-title">
                  {editandoId ? 'Editar ruta' : 'Crear nueva ruta'}
                </h2>
                <p className="modal-subtitle">
                  {editandoId ? 'Modifica el nombre de ruta.' : 'Selecciona el nombre de ruta. El número se genera automáticamente.'}
                </p>
              </div>
              <button 
                className="modal-close" 
                onClick={() => {
                  setShowCreateModal(false);
                  setEditandoId(null);
                  setSelectedZoneName('');
                  setShowZoneEditor(false);
                }} 
                type="button" 
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={editandoId ? (e) => { e.preventDefault(); handleSaveRouteName(editandoId); } : handleCreateRoute} id="form-lote" className="route-form">
              <div className="modal-body">
                <div className="field">
                  <label htmlFor="select-nombre-lote">Nombre de la ruta</label>
                  <select 
                    id="select-nombre-lote" 
                    value={selectedZoneName}
                    onChange={(e) => setSelectedZoneName(e.target.value)}
                    required
                  >
                    <option value="">Selecciona una ruta</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.nombre}>
                        {zone.nombre}
                      </option>
                    ))}
                  </select>
                  <small>Solo nombres. El sistema mantiene el número de ruta por separado.</small>
                </div>

                <button 
                  className="btn-link-muted" 
                  id="btn-gestionar-opciones" 
                  type="button"
                  onClick={() => setShowZoneEditor(!showZoneEditor)}
                >
                  Gestionar nombres de ruta
                </button>

                {showZoneEditor && (
                  <div className="route-options-panel" id="panel-opciones-editor">
                    <div className="route-option-input">
                      <input 
                        id="input-nueva-opcion" 
                        type="text" 
                        placeholder="Ej. Villa Rica" 
                        value={newZoneName}
                        onChange={(e) => setNewZoneName(e.target.value)}
                        autoComplete="off" 
                      />
                      <button className="btn-secondary" id="btn-agregar-opcion" type="button" onClick={handleCreateZone}>Agregar</button>
                    </div>
                    <div className="route-options-list" id="lista-opciones-gestion">
                      {zones.map((zone) => (
                        <div key={zone.id} className="route-zone-option">
                          <span className="route-zone-option-name">{zone.nombre}</span>
                          <button className="btn-delete-zone-option" type="button" onClick={() => handleDeleteZone(zone.id)} title="Eliminar opción">
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer modal-actions">
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditandoId(null);
                    setSelectedZoneName('');
                    setShowZoneEditor(false);
                  }} 
                  type="button"
                >
                  Cancelar
                </button>
                <button className="btn-primary-premium" id="btn-guardar-lote" type="submit">
                  {editandoId ? 'Guardar cambios' : 'Guardar ruta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ORIGINAL: HISTORIAL DE RUTAS COMPLETO */}
      {showHistoryModal && (
        <div className="modal-overlay history-modal-overlay open" id="modal-historial-completo" aria-hidden="false">
          <div className="modal-box history-modal" role="dialog" aria-modal="true" aria-labelledby="modal-historial-title" style={{ maxWidth: '1180px', width: '100%' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" id="modal-historial-title">Historial de rutas</h2>
                <p className="modal-subtitle">Consulta rutas registradas y su avance operativo.</p>
              </div>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)} type="button" aria-label="Cerrar">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="history-toolbar">
                <div className="search-wrap-premium">
                  <span className="search-icon-left" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
                  </span>
                  <input 
                    id="input-buscar-historial" 
                    type="search" 
                    placeholder="Buscar en historial..." 
                    value={searchQueryHistory}
                    onChange={(e) => setSearchQueryHistory(e.target.value)}
                  />
                </div>
                <div className="history-kpis">
                  <div><span>Total rutas</span><strong>{historyStats.totalRutas}</strong></div>
                  <div><span>Paquetes</span><strong>{historyStats.totalPaquetes}</strong></div>
                  <div><span>Promedio</span><strong>{historyStats.promedio}</strong></div>
                </div>
              </div>

              <div className="table-card-premium">
                <div className="table-responsive" style={{ maxHeight: '400px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Ruta</th>
                        <th>Zona</th>
                        <th>Paquetes</th>
                        <th>Estado</th>
                        <th>Creada</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistoryModal.length > 0 ? (
                        filteredHistoryModal.map((route, index) => {
                          const isTodayRoute = String(route.fecha || '').startsWith(getTodayKey());
                          const displayDate = isTodayRoute
                            ? (route.created_at || route.fecha)
                            : (route.fecha_finalizacion || route.finished_at || route.updated_at || route.created_at || route.fecha);
                          return (
                            <tr key={route.id}>
                              <td className="col-num">
                                <div className="col-flex-align" style={{ justifyContent: 'center' }}>
                                  <span className="route-id-badge">{index + 1}</span>
                                </div>
                              </td>
                              <td className="col-route-code">
                                <div className="col-flex-align">
                                  <span>MYG-{route.id}</span>
                                </div>
                              </td>
                              <td className="col-route-name">
                                <div className="col-flex-align">
                                  <MapPin className="zone-pin-icon" size={14} style={{ color: '#64748b' }} />
                                  <span>{route.nombre_lote}</span>
                                </div>
                              </td>
                              <td className="col-paquetes">
                                <div className="col-flex-align" style={{ justifyContent: 'center' }}>
                                  {route.total_registros}
                                </div>
                              </td>
                              <td>
                                <div className="col-flex-align">
                                  <span className={`estado-badge estado-${getStatusClass(route.estado)}`}>
                                    <span className="estado-dot"></span>
                                    {getStatusLabel(route.estado)}
                                  </span>
                                </div>
                              </td>
                              <td className="col-date">
                                <div className="col-flex-align">
                                  {formatDateTime(displayDate)}
                                </div>
                              </td>
                              <td>
                                <div className="col-flex-align" style={{ justifyContent: 'flex-end' }}>
                                  {renderRowActions(route)}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="empty-row">No hay rutas en el historial que coincidan con la búsqueda.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ORIGINAL: REPORTE DE RUTA */}
      {showReportModal && (
        <div className="modal-overlay open" id="modal-reporte" aria-hidden="false">
          <div className="modal-box report-modal" role="dialog" aria-modal="true" aria-labelledby="modal-reporte-title" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" id="modal-reporte-title">Reporte de ruta: {reportRouteName}</h2>
                <p className="modal-subtitle">Resumen operativo y detalle de avisos.</p>
              </div>
              <button className="modal-close" onClick={() => setShowReportModal(false)} type="button" aria-label="Cerrar">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
              </button>
            </div>

            <div className="modal-body">
              {reportLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
                  <span className="spinner"></span>
                </div>
              ) : reportData ? (
                <div className="report-body">
                  <div className="report-summary">
                    <div className="report-summary-card report-summary-card--total">
                      <div className="report-summary-value">{reportData.total}</div>
                      <div className="report-summary-label">Total registros</div>
                    </div>
                    <div className="report-summary-card report-summary-card--procesados">
                      <div className="report-summary-value">
                        {reportData.enviados + reportData.manuales}
                      </div>
                      <div className="report-summary-label">
                        Procesados <span style={{ fontWeight: 400, fontFamily: 'Outfit' }}> · {reportData.total > 0 ? Math.round(((reportData.enviados + reportData.manuales) / reportData.total) * 100) : 0}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="report-divider">Desglose de estados</div>
                  
                  <div className="report-breakdown">
                    {/* Pendientes */}
                    <div className="report-item" data-type="pending">
                      <span className="report-item-dot" style={{ background: '#d97706' }}></span>
                      <span className="report-item-label">Pendientes</span>
                      <div className="report-item-bar">
                        <div className="report-item-bar-fill" style={{ width: `${reportData.total > 0 ? Math.round((reportData.pendientes / reportData.total) * 100) : 0}%`, background: '#d97706' }}></div>
                      </div>
                      <strong className="report-item-value">{reportData.pendientes}</strong>
                    </div>

                    {/* Enviados */}
                    <div className="report-item" data-type="sent">
                      <span className="report-item-dot" style={{ background: '#15803d' }}></span>
                      <span className="report-item-label">Enviados</span>
                      <div className="report-item-bar">
                        <div className="report-item-bar-fill" style={{ width: `${reportData.total > 0 ? Math.round((reportData.enviados / reportData.total) * 100) : 0}%`, background: '#15803d' }}></div>
                      </div>
                      <strong className="report-item-value">{reportData.enviados}</strong>
                    </div>

                    {/* Envío manual */}
                    <div 
                      className={`report-item${reportData.manuales > 0 ? ' report-item--clickable' : ''}${showReportManualDetail ? ' report-item--expanded' : ''}`}
                      data-type="manual"
                      onClick={() => { if (reportData.manuales > 0) setShowReportManualDetail(!showReportManualDetail); }}
                    >
                      <span className="report-item-dot" style={{ background: '#0f766e' }}></span>
                      <span className="report-item-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Envío manual
                        {reportData.manuales > 0 && (
                          <svg viewBox="0 0 24 24" className="report-item-chevron" style={{ width: '12px', height: '12px', fill: 'none', stroke: 'var(--text-muted)', strokeWidth: 3, transition: 'transform 0.2s ease', transform: showReportManualDetail ? 'rotate(180deg)' : 'rotate(0)' }}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        )}
                      </span>
                      <div className="report-item-bar">
                        <div className="report-item-bar-fill" style={{ width: `${reportData.total > 0 ? Math.round((reportData.manuales / reportData.total) * 100) : 0}%`, background: '#0f766e' }}></div>
                      </div>
                      <strong className="report-item-value">{reportData.manuales}</strong>
                    </div>

                    {/* Detalle Envíos Manuales */}
                    {showReportManualDetail && reportData.manuales > 0 && (
                      <div className="report-nowa-detail" style={{ display: 'block' }}>
                        <div className="report-nowa-header">
                          <div className="report-nowa-header-left">
                            <div className="report-nowa-header-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/><path d="M21 12a9 9 0 1 1-2.64-6.36"/></svg>
                            </div>
                            <span className="report-nowa-header-title">Envíos manuales</span>
                            <span className="report-nowa-badge">{reportData.manuales}</span>
                          </div>
                          <div className="report-nowa-header-actions">
                            {reportData.manuales > 1 && (
                              <button 
                                className="btn-copy-nowa-all" 
                                type="button"
                                onClick={() => {
                                  const allManualText = reportData.manualList.map((aviso, i) =>
                                    `${i + 1}. ${aviso.nombre || '-'}\n   • Teléfono: ${aviso.telefono || '-'}\n   • Código: ${aviso.codigo_paquete || '-'}`
                                  ).join('\n\n');
                                  navigator.clipboard.writeText(allManualText);
                                  showToast('Todos los envíos manuales han sido copiados al portapapeles.', 'success', { title: 'Copiado' });
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                Copiar todo
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="report-nowa-table-wrapper">
                          <table className="report-nowa-table">
                            <thead>
                              <tr>
                                <th>Nombre</th>
                                <th>Teléfono</th>
                                <th>Código</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportData.manualList.map((aviso, idx) => (
                                <tr key={idx}>
                                  <td>{aviso.nombre || '-'}</td>
                                  <td><span className="report-nowa-phone">{aviso.telefono || '-'}</span></td>
                                  <td><span className="report-nowa-code">{aviso.codigo_paquete || '-'}</span></td>
                                  <td>
                                    <button 
                                      className="btn-copy-nowa-row" 
                                      type="button" 
                                      onClick={() => {
                                        navigator.clipboard.writeText(`${aviso.nombre || '-'}\t${aviso.telefono || '-'}\t${aviso.codigo_paquete || '-'}`);
                                        showToast('Fila copiada al portapapeles.', 'success', { title: 'Copiado' });
                                      }}
                                      title="Copiar fila"
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Sin WhatsApp */}
                    <div 
                      className={`report-item${reportData.sinWhatsapp > 0 ? ' report-item--clickable' : ''}${showReportNowaDetail ? ' report-item--expanded' : ''}`}
                      data-type="nowa"
                      onClick={() => { if (reportData.sinWhatsapp > 0) setShowReportNowaDetail(!showReportNowaDetail); }}
                    >
                      <span className="report-item-dot" style={{ background: '#a855f7' }}></span>
                      <span className="report-item-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Sin WhatsApp
                        {reportData.sinWhatsapp > 0 && (
                          <svg viewBox="0 0 24 24" className="report-item-chevron" style={{ width: '12px', height: '12px', fill: 'none', stroke: 'var(--text-muted)', strokeWidth: 3, transition: 'transform 0.2s ease', transform: showReportNowaDetail ? 'rotate(180deg)' : 'rotate(0)' }}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        )}
                      </span>
                      <div className="report-item-bar">
                        <div className="report-item-bar-fill" style={{ width: `${reportData.total > 0 ? Math.round((reportData.sinWhatsapp / reportData.total) * 100) : 0}%`, background: '#a855f7' }}></div>
                      </div>
                      <strong className="report-item-value">{reportData.sinWhatsapp}</strong>
                    </div>

                    {/* Detalle Sin WhatsApp */}
                    {showReportNowaDetail && reportData.sinWhatsapp > 0 && (
                      <div className="report-nowa-detail" style={{ display: 'block' }}>
                        <div className="report-nowa-header">
                          <div className="report-nowa-header-left">
                            <div className="report-nowa-header-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                            </div>
                            <span className="report-nowa-header-title">Clientes sin WhatsApp</span>
                            <span className="report-nowa-badge">{reportData.sinWhatsapp}</span>
                          </div>
                          <div className="report-nowa-header-actions">
                            {reportData.sinWhatsapp > 1 && (
                              <button 
                                className="btn-copy-nowa-all" 
                                type="button"
                                onClick={() => {
                                  const allNowaText = reportData.nowaList.map((aviso, i) =>
                                    `${i + 1}. ${aviso.nombre || '-'}\n   • Teléfono: ${aviso.telefono || '-'}\n   • Código: ${aviso.codigo_paquete || '-'}`
                                  ).join('\n\n');
                                  navigator.clipboard.writeText(allNowaText);
                                  showToast('Todos los registros sin WhatsApp han sido copiados al portapapeles.', 'success', { title: 'Copiado' });
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                Copiar todo
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="report-nowa-table-wrapper">
                          <table className="report-nowa-table">
                            <thead>
                              <tr>
                                <th>Nombre</th>
                                <th>Teléfono</th>
                                <th>Código</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportData.nowaList.map((aviso, idx) => (
                                <tr key={idx}>
                                  <td>{aviso.nombre || '-'}</td>
                                  <td><span className="report-nowa-phone">{aviso.telefono || '-'}</span></td>
                                  <td><span className="report-nowa-code">{aviso.codigo_paquete || '-'}</span></td>
                                  <td>
                                    <button 
                                      className="btn-copy-nowa-row" 
                                      type="button" 
                                      onClick={() => {
                                        navigator.clipboard.writeText(`${aviso.nombre || '-'}\t${aviso.telefono || '-'}\t${aviso.codigo_paquete || '-'}`);
                                        showToast('Fila copiada al portapapeles.', 'success', { title: 'Copiado' });
                                      }}
                                      title="Copiar fila"
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Fallidos */}
                    <div className="report-item report-item--danger" data-type="fail">
                      <span className="report-item-dot" style={{ background: '#dc2626' }}></span>
                      <span className="report-item-label">Fallidos / errores</span>
                      <div className="report-item-bar">
                        <div className="report-item-bar-fill" style={{ width: `${reportData.total > 0 ? Math.round((reportData.fallidos / reportData.total) * 100) : 0}%`, background: '#dc2626' }}></div>
                      </div>
                      <strong className="report-item-value">{reportData.fallidos}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: '#ef4444' }}>
                  Error al calcular las métricas.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PORTAL: MENÚ DE OPCIONES ADICIONALES (3 PUNTOS) */}
      {activeDropdownId && activeRoute && dropdownCoords && createPortal(
        <div 
          className="options-dropdown-menu open" 
          style={{ 
            position: 'absolute', 
            top: `${dropdownCoords.top}px`, 
            left: `${dropdownCoords.left}px`, 
            zIndex: 9999, 
            minWidth: '200px', 
            padding: '6px', 
            border: '1px solid var(--r-border)', 
            borderRadius: 'var(--r-r-lg)', 
            background: 'var(--r-surface)', 
            boxShadow: 'var(--r-shadow-xl)',
            pointerEvents: 'auto'
          }}
        >
          {(() => {
            const deliveriesEnabled = activeRoute.entregas_habilitado === 1;
            const totalPackages = activeRoute.total_registros || 0;
            const isDeliveriesDisabled = deliveriesEnabled || totalPackages <= 0;
            const deliveryLabel = deliveriesEnabled
              ? 'Ya está en entregas'
              : (totalPackages <= 0 ? 'Sin paquetes para entregas' : 'Enviar a entregas');
            return (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDeliveriesDisabled) { handleEnableDeliveries(activeRoute.id); }
                  }}
                  disabled={isDeliveriesDisabled}
                  className={`options-dropdown-item ${deliveriesEnabled ? 'is-success' : ''}`}
                  style={{ cursor: isDeliveriesDisabled ? 'not-allowed' : 'pointer', opacity: isDeliveriesDisabled ? 0.5 : 1 }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v2"></path><path d="M14 3v5h5"></path><path d="m16 18 2 2 4-4"></path></svg>
                  {deliveryLabel}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRoute(activeRoute.id);
                  }}
                  className="options-dropdown-item options-dropdown-item--danger"
                  style={{ cursor: 'pointer' }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: '14px', height: '14px', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  Eliminar ruta
                </button>
              </>
            );
          })()}
        </div>,
        document.body
      )}
    </main>
  );
};

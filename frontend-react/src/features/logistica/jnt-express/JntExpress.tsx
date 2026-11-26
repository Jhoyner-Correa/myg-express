import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileUp,
  History,
  FileSpreadsheet,
  Send,
  Search,
  Package,
  Users,
  MapPin,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Phone,
  PhoneOff,
  FileText,
  Clock,
  Copy,
  Check,
  X,
  Layers,
  Smartphone,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import { showToast } from '../../../core/utils/toast';
import { useAuth } from '../../../core/auth/authState';
import { jntService } from './jnt.service';
import { exportJntPackagesToExcel, exportJntConsigneesToExcel } from './excel';
import { JntUploadModal } from './components/JntUploadModal';
import { JntBatchHistoryModal } from './components/JntBatchHistoryModal';
import { JntWhatsAppModal } from './components/JntWhatsAppModal';
import type { JntBatchDetailData } from './types';
import styles from './JntExpress.module.css';

type SortField = 'pagina' | 'guia' | 'consignado' | 'distrito' | 'pesoKg';
type SortDirection = 'asc' | 'desc';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'JT';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 9) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return phone;
}

export const JntExpress: React.FC = () => {
  const { user } = useAuth();
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [batchData, setBatchData] = useState<JntBatchDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Filters, sorting, pagination & tabs
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('TODOS');
  const [quickFilter, setQuickFilter] = useState<'all' | 'multi' | 'with_phone' | 'no_phone'>('all');
  const [activeTab, setActiveTab] = useState<'paquetes' | 'consignados' | 'distritos'>('paquetes');
  const [expandedConsignee, setExpandedConsignee] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>('pagina');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMostRecentBatch();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDistrict, quickFilter, activeBatchId, pageSize]);

  const loadMostRecentBatch = async () => {
    try {
      setLoading(true);
      const batches = await jntService.listBatches();
      if (batches.length > 0 && batches[0]) {
        const latest = batches[0];
        setActiveBatchId(latest.id);
        const data = await jntService.getBatchDetails(latest.id);
        setBatchData(data);
      }
    } catch (err: unknown) {
      console.warn('No se pudo cargar el lote reciente de J&T:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSelected = async (id: number) => {
    try {
      setLoading(true);
      setActiveBatchId(id);
      const data = await jntService.getBatchDetails(id);
      setBatchData(data);
      setSelectedDistrict('TODOS');
      setQuickFilter('all');
      setSearchQuery('');
      setExpandedConsignee(null);
      showToast('Lote cargado exitosamente', 'info');
    } catch (err: unknown) {
      console.error(err);
      showToast('Error al cargar datos del lote', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = (newBatchId: number, data: JntBatchDetailData) => {
    setActiveBatchId(newBatchId);
    setBatchData(data);
    setSelectedDistrict('TODOS');
    setQuickFilter('all');
    setSearchQuery('');
    setExpandedConsignee(null);
    showToast(`Manifiesto procesado: ${data.totalPaquetes} paquetes extraídos`, 'success');
  };

  const copyToClipboard = (text: string, label = 'Guía') => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
    showToast(`${label} copiada al portapapeles`, 'success');
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Precomputed accurate stats & multi-package lookup
  const { stats, consigneePackageCounts } = useMemo(() => {
    const countsMap = new Map<string, number>();
    if (!batchData) {
      return {
        stats: {
          totalWeight: 0,
          packagesWithPhone: 0,
          packagesNoPhone: 0,
          consigneesWithPhone: 0,
          consigneePhonePct: 0,
          multiPackagesTotal: 0,
          topDistrictName: '-',
          topDistrictCount: 0,
          topDistrictPct: 0,
        },
        consigneePackageCounts: countsMap,
      };
    }

    batchData.consignados.forEach(c => {
      countsMap.set(c.consignado.toUpperCase(), c.totalPaquetes);
    });

    let totalWeight = 0;
    let packagesWithPhone = 0;
    let packagesNoPhone = 0;

    batchData.paquetes.forEach(p => {
      if (p.pesoKg) totalWeight += p.pesoKg;
      if (p.telefono && p.telefono.replace(/\D/g, '').length >= 9) {
        packagesWithPhone++;
      } else {
        packagesNoPhone++;
      }
    });

    const consigneesWithPhone = batchData.consignados.filter(
      c => c.telefono && c.telefono.replace(/\D/g, '').length >= 9
    ).length;

    const consigneePhonePct = batchData.totalConsignados > 0
      ? Math.min(100, Math.round((consigneesWithPhone / batchData.totalConsignados) * 100))
      : 0;

    const multiPackagesTotal = batchData.consignados
      .filter(c => c.totalPaquetes > 1)
      .reduce((acc, c) => acc + c.totalPaquetes, 0);

    const distEntries = Object.entries(batchData.distritos || {}).sort((a, b) => b[1] - a[1]);
    const topDistrictName = distEntries[0]?.[0] || '-';
    const topDistrictCount = distEntries[0]?.[1] || 0;
    const topDistrictPct = batchData.totalPaquetes > 0
      ? Math.round((topDistrictCount / batchData.totalPaquetes) * 100)
      : 0;

    return {
      stats: {
        totalWeight: Math.round(totalWeight * 100) / 100,
        packagesWithPhone,
        packagesNoPhone,
        consigneesWithPhone,
        consigneePhonePct,
        multiPackagesTotal,
        topDistrictName,
        topDistrictCount,
        topDistrictPct,
      },
      consigneePackageCounts: countsMap,
    };
  }, [batchData]);

  // Sorted district entries
  const sortedDistrictEntries = useMemo(() => {
    if (!batchData?.distritos) return [];
    return Object.entries(batchData.distritos).sort((a, b) => b[1] - a[1]);
  }, [batchData]);

  // Filtered and sorted packages
  const filteredPackages = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.paquetes;

    if (quickFilter === 'multi') {
      list = list.filter(p => (consigneePackageCounts.get(p.consignado.toUpperCase()) || 0) > 1);
    } else if (quickFilter === 'with_phone') {
      list = list.filter(p => p.telefono && p.telefono.replace(/\D/g, '').length >= 9);
    } else if (quickFilter === 'no_phone') {
      list = list.filter(p => !p.telefono || p.telefono.replace(/\D/g, '').length < 9);
    }

    if (selectedDistrict !== 'TODOS') {
      list = list.filter(p => (p.distrito || 'DESCONOCIDO').toUpperCase() === selectedDistrict.toUpperCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.guia.toLowerCase().includes(q) ||
        p.consignado.toLowerCase().includes(q) ||
        p.telefono.includes(q) ||
        p.distrito.toLowerCase().includes(q) ||
        p.direccion.toLowerCase().includes(q) ||
        p.contenido.toLowerCase().includes(q)
      );
    }

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'pagina') {
        cmp = a.pagina - b.pagina;
      } else if (sortField === 'pesoKg') {
        cmp = (a.pesoKg || 0) - (b.pesoKg || 0);
      } else if (sortField === 'guia') {
        cmp = a.guia.localeCompare(b.guia);
      } else if (sortField === 'consignado') {
        cmp = a.consignado.localeCompare(b.consignado, 'es');
      } else if (sortField === 'distrito') {
        cmp = (a.distrito || '').localeCompare(b.distrito || '', 'es');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [batchData, quickFilter, selectedDistrict, searchQuery, sortField, sortDir, consigneePackageCounts]);

  // Paginated packages
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredPackages.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPackages = useMemo(() => {
    if (pageSize === 0) return filteredPackages;
    const start = (safePage - 1) * pageSize;
    return filteredPackages.slice(start, start + pageSize);
  }, [filteredPackages, safePage, pageSize]);

  // Filtered consignees
  const filteredConsignees = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.consignados;

    if (quickFilter === 'multi') {
      list = list.filter(c => c.totalPaquetes > 1);
    } else if (quickFilter === 'with_phone') {
      list = list.filter(c => c.telefono && c.telefono.replace(/\D/g, '').length >= 9);
    } else if (quickFilter === 'no_phone') {
      list = list.filter(c => !c.telefono || c.telefono.replace(/\D/g, '').length < 9);
    }

    if (selectedDistrict !== 'TODOS') {
      list = list.filter(c => (c.distrito || 'DESCONOCIDO').toUpperCase() === selectedDistrict.toUpperCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c =>
        c.consignado.toLowerCase().includes(q) ||
        c.telefono.includes(q) ||
        c.distrito.toLowerCase().includes(q) ||
        c.guias.some(g => g.toLowerCase().includes(q))
      );
    }

    return list;
  }, [batchData, quickFilter, selectedDistrict, searchQuery]);

  const handleExportExcel = () => {
    if (!batchData || batchData.paquetes.length === 0) {
      showToast('No hay paquetes para exportar', 'warning');
      return;
    }
    const name = batchData.lote?.nombre_archivo
      ? `JNT_${batchData.lote.nombre_archivo.replace(/\.pdf$/i, '')}.xlsx`
      : 'paquetes_jnt.xlsx';
    exportJntPackagesToExcel(filteredPackages, name);
    showToast('Exportación completada a Excel', 'success');
  };

  const handleExportConsigneesExcel = () => {
    if (!batchData || batchData.consignados.length === 0) {
      showToast('No hay consignados para exportar', 'warning');
      return;
    }
    exportJntConsigneesToExcel(filteredConsignees, 'consignados_jnt_resumen.xlsx');
    showToast('Resumen de consignados exportado a Excel', 'success');
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} className={styles.sortIconMuted} />;
    return sortDir === 'asc'
      ? <ArrowUp size={12} className={styles.sortIconActive} />
      : <ArrowDown size={12} className={styles.sortIconActive} />;
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      {/* Top Corporate PageHeader */}
      <PageHeader
        tone="corporate"
        icon={<Package size={20} />}
        title="J&T Express"
        subtitle="Gestión de manifiestos PDF, consolidación de consignados y despacho corporativo por WhatsApp"
        metadata={
          <div className={styles.headerMeta}>
            <span className={styles.statusOnline}>
              <span className={styles.statusDot} />
              Operativo
            </span>
            <span className={styles.metaSep}>|</span>
            <span>{user?.sede_nombre || 'Sede Central'}</span>
          </div>
        }
      />

      <div className={styles.content}>
        {/* Active Batch Command Bar */}
        {batchData && batchData.lote ? (
          <section className={styles.manifestBar} aria-label="Lote activo">
            <div className={styles.manifestIdentity}>
              <div className={styles.manifestIconBox} aria-hidden="true">
                <FileText size={19} />
              </div>
              <div className={styles.manifestMeta}>
                <div className={styles.manifestTitleRow}>
                  <span className={styles.manifestFileName} title={batchData.lote.nombre_archivo}>
                    {batchData.lote.nombre_archivo}
                  </span>
                  <span className={styles.statusPillActive}>
                    <span className={styles.statusDot} />
                    Lote activo
                  </span>
                  {batchData.lote.ruta_whatsapp_nombre && (
                    <span className={styles.statusPillNeutral}>
                      <Check size={11} />
                      Ruta: {batchData.lote.ruta_whatsapp_nombre}
                    </span>
                  )}
                </div>
                <div className={styles.manifestSubRow}>
                  <span><strong>{batchData.totalPaquetes}</strong> guías</span>
                  <span className={styles.subDivider}>·</span>
                  <span><strong>{batchData.totalPaginas}</strong> páginas</span>
                  <span className={styles.subDivider}>·</span>
                  <span><strong>{batchData.totalConsignados}</strong> consignados</span>
                  <span className={styles.subDivider}>·</span>
                  <span className={styles.timestampInline}>
                    <Clock size={12} />
                    {new Date(batchData.lote.created_at).toLocaleString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.manifestActions}>
              <Button
                variant="secondary"
                size="sm"
                icon={<History size={14} />}
                onClick={() => setShowHistoryModal(true)}
                disabled={loading}
              >
                Historial
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet size={14} />}
                onClick={handleExportExcel}
                disabled={loading || filteredPackages.length === 0}
              >
                Exportar Excel
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={<FileUp size={14} />}
                onClick={() => setShowUploadModal(true)}
                disabled={loading}
              >
                Cargar PDF
              </Button>

              {activeBatchId && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  onClick={() => setShowWhatsAppModal(true)}
                  disabled={loading}
                >
                  Enviar WhatsApp
                  <span className={styles.btnCountBadge}>{batchData.totalConsignados}</span>
                </Button>
              )}
            </div>
          </section>
        ) : null}

        {/* Enterprise KPI Telemetry Cards */}
        {batchData && (
          <section className={styles.kpiGrid} aria-label="Indicadores del manifiesto">
            <article className={styles.kpiCard}>
              <header className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Total Paquetes</span>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Package size={16} />
                </span>
              </header>
              <div className={styles.kpiBody}>
                <strong className={styles.kpiValue}>{batchData.totalPaquetes}</strong>
                <span className={styles.kpiDatum}>
                  {stats.totalWeight > 0 ? `${stats.totalWeight} kg` : 'Peso n/d'}
                </span>
              </div>
              <footer className={styles.kpiFooter}>
                <span>{batchData.totalPaginas} páginas procesadas</span>
                <span className={styles.kpiFooterMeta}>100% lectura</span>
              </footer>
            </article>

            <article className={styles.kpiCard}>
              <header className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Destinatarios</span>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Users size={16} />
                </span>
              </header>
              <div className={styles.kpiBody}>
                <strong className={styles.kpiValue}>{batchData.totalConsignados}</strong>
                <span className={`${styles.kpiDatum} ${styles.kpiDatumGood}`}>
                  {stats.consigneePhonePct}% contactable
                </span>
              </div>
              <footer className={styles.kpiFooter}>
                <span>{stats.consigneesWithPhone} clientes con móvil</span>
                <span className={styles.kpiFooterMeta}>{stats.packagesNoPhone} sin telf.</span>
              </footer>
            </article>

            <article
              className={`${styles.kpiCard} ${styles.kpiInteractive} ${quickFilter === 'multi' ? styles.kpiSelected : ''}`}
              onClick={() => {
                setQuickFilter(quickFilter === 'multi' ? 'all' : 'multi');
                setActiveTab('consignados');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setQuickFilter(quickFilter === 'multi' ? 'all' : 'multi');
                  setActiveTab('consignados');
                }
              }}
              title="Filtrar consignados con múltiples guías"
            >
              <header className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Consolidados</span>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <Layers size={16} />
                </span>
              </header>
              <div className={styles.kpiBody}>
                <strong className={styles.kpiValue}>{batchData.consignadosMultiples}</strong>
                <span className={styles.kpiDatum}>
                  {stats.multiPackagesTotal} guías
                </span>
              </div>
              <footer className={styles.kpiFooter}>
                <span>Clientes con 2 o más paquetes</span>
                <span className={styles.kpiFooterAction}>
                  {quickFilter === 'multi' ? 'Quitar filtro' : 'Ver grupo'}
                  <ArrowRight size={12} />
                </span>
              </footer>
            </article>

            <article
              className={`${styles.kpiCard} ${styles.kpiInteractive} ${activeTab === 'distritos' ? styles.kpiSelected : ''}`}
              onClick={() => setActiveTab('distritos')}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('distritos');
                }
              }}
              title="Ver distribución por distritos"
            >
              <header className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Cobertura Distrital</span>
                <span className={styles.kpiIcon} aria-hidden="true">
                  <MapPin size={16} />
                </span>
              </header>
              <div className={styles.kpiBody}>
                <strong className={styles.kpiValue}>{sortedDistrictEntries.length}</strong>
                <span className={styles.kpiDatum}>{stats.topDistrictPct}% en principal</span>
              </div>
              <footer className={styles.kpiFooter}>
                <span>Principal: {stats.topDistrictName} ({stats.topDistrictCount})</span>
                <span className={styles.kpiFooterAction}>
                  Distribución
                  <ArrowRight size={12} />
                </span>
              </footer>
            </article>
          </section>
        )}

        {/* Unified Enterprise Data Workspace */}
        {batchData ? (
          <section className={styles.workspaceCard} aria-label="Explorador de manifiesto">
            {/* Primary Toolbar: Search + View Mode Switcher */}
            <div className={styles.workspaceToolbar}>
              <div className={styles.searchBox}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder="Buscar por guía JPE, consignado, celular, dirección o contenido..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className={styles.searchClearBtn}
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className={styles.segmentedTabs} role="tablist" aria-label="Modo de visualización">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'paquetes'}
                  className={`${styles.segmentedTabBtn} ${activeTab === 'paquetes' ? styles.segmentedTabActive : ''}`}
                  onClick={() => setActiveTab('paquetes')}
                >
                  <Package size={14} />
                  <span>Por Paquete</span>
                  <span className={styles.tabBadge}>{filteredPackages.length}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'consignados'}
                  className={`${styles.segmentedTabBtn} ${activeTab === 'consignados' ? styles.segmentedTabActive : ''}`}
                  onClick={() => setActiveTab('consignados')}
                >
                  <Users size={14} />
                  <span>Por Consignado</span>
                  <span className={styles.tabBadge}>{filteredConsignees.length}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'distritos'}
                  className={`${styles.segmentedTabBtn} ${activeTab === 'distritos' ? styles.segmentedTabActive : ''}`}
                  onClick={() => setActiveTab('distritos')}
                >
                  <MapPin size={14} />
                  <span>Por Distrito</span>
                  <span className={styles.tabBadge}>{sortedDistrictEntries.length}</span>
                </button>
              </div>
            </div>

            {/* Secondary Filter Bar: Operational Criteria & District Selector */}
            <div className={styles.filterStrip}>
              <div className={styles.quickFilterGroup} role="group" aria-label="Filtros rápidos">
                <span className={styles.filterGroupLabel}>Criterio:</span>

                <button
                  type="button"
                  className={`${styles.filterChip} ${quickFilter === 'all' ? styles.filterChipActive : ''}`}
                  onClick={() => setQuickFilter('all')}
                >
                  <span>Todos</span>
                  <span className={styles.filterChipCount}>{batchData.totalPaquetes}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.filterChip} ${quickFilter === 'multi' ? styles.filterChipActive : ''}`}
                  onClick={() => setQuickFilter(quickFilter === 'multi' ? 'all' : 'multi')}
                >
                  <Layers size={13} />
                  <span>Multipaquetes</span>
                  <span className={styles.filterChipCount}>{batchData.consignadosMultiples}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.filterChip} ${quickFilter === 'with_phone' ? styles.filterChipActive : ''}`}
                  onClick={() => setQuickFilter(quickFilter === 'with_phone' ? 'all' : 'with_phone')}
                >
                  <Smartphone size={13} />
                  <span>Con Celular</span>
                  <span className={styles.filterChipCount}>{stats.packagesWithPhone}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.filterChip} ${quickFilter === 'no_phone' ? styles.filterChipActive : ''}`}
                  onClick={() => setQuickFilter(quickFilter === 'no_phone' ? 'all' : 'no_phone')}
                >
                  <PhoneOff size={13} />
                  <span>Sin Teléfono</span>
                  <span className={styles.filterChipCount}>{stats.packagesNoPhone}</span>
                </button>
              </div>

              <div className={styles.filterDivider} aria-hidden="true" />

              <div className={styles.districtStrip} role="group" aria-label="Filtro por distrito">
                <button
                  type="button"
                  className={`${styles.districtChip} ${selectedDistrict === 'TODOS' ? styles.districtChipActive : ''}`}
                  onClick={() => setSelectedDistrict('TODOS')}
                >
                  <span>Todos los distritos</span>
                  <span className={styles.districtChipBadge}>{batchData.totalPaquetes}</span>
                </button>

                {sortedDistrictEntries.map(([dist, count]) => (
                  <button
                    key={dist}
                    type="button"
                    className={`${styles.districtChip} ${selectedDistrict.toUpperCase() === dist.toUpperCase() ? styles.districtChipActive : ''}`}
                    onClick={() => setSelectedDistrict(selectedDistrict.toUpperCase() === dist.toUpperCase() ? 'TODOS' : dist)}
                  >
                    <span>{dist}</span>
                    <span className={styles.districtChipBadge}>{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 1: High-Density Enterprise Data Grid */}
            {activeTab === 'paquetes' && (
              <div className={styles.panelBody}>
                <div className={styles.gridSubToolbar}>
                  <div className={styles.gridSummaryText}>
                    Mostrando <strong>{paginatedPackages.length}</strong> de <strong>{filteredPackages.length}</strong> registros
                    {filteredPackages.length !== batchData.totalPaquetes && ` (total lote: ${batchData.totalPaquetes})`}
                    {selectedDistrict !== 'TODOS' && ` · Distrito: ${selectedDistrict}`}
                  </div>
                  <div className={styles.gridSubActions}>
                    <label className={styles.pageSizeLabel}>
                      <span>Filas:</span>
                      <select
                        value={pageSize}
                        onChange={e => setPageSize(Number(e.target.value))}
                        className={styles.pageSizeSelect}
                        aria-label="Filas por página"
                      >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={0}>Todas ({filteredPackages.length})</option>
                      </select>
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FileSpreadsheet size={14} />}
                      onClick={handleExportExcel}
                      disabled={filteredPackages.length === 0}
                    >
                      Exportar vista
                    </Button>
                  </div>
                </div>

                <div className={styles.tableViewport}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th className={styles.colIndex}>#</th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('guia')}>
                            <span>Guía / Tracking</span>
                            {renderSortIcon('guia')}
                          </button>
                        </th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('consignado')}>
                            <span>Consignado</span>
                            {renderSortIcon('consignado')}
                          </button>
                        </th>
                        <th>Teléfono</th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('distrito')}>
                            <span>Distrito</span>
                            {renderSortIcon('distrito')}
                          </button>
                        </th>
                        <th>Dirección</th>
                        <th>Contenido</th>
                        <th style={{ textAlign: 'right' }}>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('pesoKg')}>
                            <span>Peso</span>
                            {renderSortIcon('pesoKg')}
                          </button>
                        </th>
                        <th style={{ textAlign: 'center' }}>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('pagina')}>
                            <span>Pág.</span>
                            {renderSortIcon('pagina')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPackages.length === 0 ? (
                        <tr>
                          <td colSpan={9} className={styles.emptyTableCell}>
                            <Package size={32} className={styles.emptyTableIcon} />
                            <strong>No hay registros que coincidan</strong>
                            <span>Ajusta los términos de búsqueda o restablece los filtros seleccionados.</span>
                          </td>
                        </tr>
                      ) : (
                        paginatedPackages.map((pkg, idx) => {
                          const globalIndex = (safePage - 1) * (pageSize || filteredPackages.length) + idx + 1;
                          const isCopied = copiedCode === pkg.guia;
                          const multiCount = consigneePackageCounts.get(pkg.consignado.toUpperCase()) || 1;
                          const cleanPhone = pkg.telefono ? pkg.telefono.replace(/\D/g, '') : '';

                          return (
                            <tr key={`${pkg.guia}-${globalIndex}`}>
                              <td className={styles.colIndex}>{globalIndex}</td>
                              <td>
                                <div className={styles.trackingCell}>
                                  <span className={styles.trackingCode}>{pkg.guia}</span>
                                  <button
                                    type="button"
                                    className={styles.btnCopyMini}
                                    onClick={() => copyToClipboard(pkg.guia, 'Guía')}
                                    title="Copiar número de guía"
                                    aria-label={`Copiar guía ${pkg.guia}`}
                                  >
                                    {isCopied ? <Check size={12} className={styles.iconSuccess} /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <div className={styles.consigneeCell}>
                                  <span className={styles.consigneeNameText} title={pkg.consignado}>
                                    {pkg.consignado}
                                  </span>
                                  {multiCount > 1 && (
                                    <span className={styles.inlineMultiBadge} title={`Este consignado tiene ${multiCount} paquetes en el lote`}>
                                      {multiCount} guías
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {cleanPhone.length >= 9 ? (
                                  <a
                                    href={`https://wa.me/51${cleanPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.whatsappLinkBtn}
                                    title={`Abrir WhatsApp con ${pkg.consignado}`}
                                  >
                                    <Phone size={12} />
                                    <span>{formatPhone(pkg.telefono)}</span>
                                  </a>
                                ) : (
                                  <span className={styles.noPhoneText}>Sin registro</span>
                                )}
                              </td>
                              <td>
                                <span className={styles.districtTag}>
                                  {pkg.distrito || 'DESCONOCIDO'}
                                </span>
                              </td>
                              <td className={styles.truncateCell} title={pkg.direccion}>
                                {pkg.direccion || '—'}
                              </td>
                              <td className={styles.truncateCellSm} title={pkg.contenido}>
                                {pkg.contenido || '—'}
                              </td>
                              <td className={styles.numericRight}>
                                {pkg.pesoKg ? `${pkg.pesoKg.toFixed(2)} kg` : '—'}
                              </td>
                              <td className={styles.numericCenter}>
                                {pkg.pagina}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination & Summary Footer */}
                <footer className={styles.gridFooter}>
                  <span className={styles.gridFooterHint}>
                    Haz clic en cualquier encabezado para ordenar · Haz clic en un teléfono para abrir WhatsApp Web
                  </span>
                  {totalPages > 1 && (
                    <div className={styles.paginationControls}>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className={styles.pageIndicator}>
                        Página <strong>{safePage}</strong> de <strong>{totalPages}</strong>
                      </span>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        aria-label="Página siguiente"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </footer>
              </div>
            )}

            {/* Tab 2: Consignees Consolidated View */}
            {activeTab === 'consignados' && (
              <div className={styles.panelBody}>
                <div className={styles.gridSubToolbar}>
                  <div className={styles.gridSummaryText}>
                    Mostrando <strong>{filteredConsignees.length}</strong> consignados únicos
                    {quickFilter === 'multi' && ' con múltiples paquetes'}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<FileSpreadsheet size={14} />}
                    onClick={handleExportConsigneesExcel}
                    disabled={filteredConsignees.length === 0}
                  >
                    Exportar resumen consignados
                  </Button>
                </div>

                <div className={styles.consigneeList}>
                  {filteredConsignees.length === 0 ? (
                    <div className={styles.emptyPanelState}>
                      <Users size={32} className={styles.emptyTableIcon} />
                      <strong>No se encontraron consignados</strong>
                      <span>Modifica los filtros o la búsqueda para visualizar destinatarios.</span>
                    </div>
                  ) : (
                    filteredConsignees.map(c => {
                      const isExpanded = expandedConsignee === c.consignado;
                      const isMulti = c.totalPaquetes > 1;
                      const cleanPhone = c.telefono ? c.telefono.replace(/\D/g, '') : '';

                      return (
                        <div
                          key={c.consignado}
                          className={`${styles.consigneeRowCard} ${isMulti ? styles.consigneeRowMulti : ''}`}
                        >
                          <div
                            className={styles.consigneeHeader}
                            onClick={() => setExpandedConsignee(isExpanded ? null : c.consignado)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedConsignee(isExpanded ? null : c.consignado);
                              }
                            }}
                          >
                            <div className={styles.consigneeLeft}>
                              <div className={styles.monogramBadge} aria-hidden="true">
                                {getInitials(c.consignado)}
                              </div>
                              <div className={styles.consigneeMeta}>
                                <div className={styles.consigneeTitleRow}>
                                  <span className={styles.consigneeNameLg}>{c.consignado}</span>
                                  {isMulti && (
                                    <span className={styles.multiBadgeCorporate}>
                                      <Layers size={11} />
                                      Consolidado · {c.totalPaquetes} guías
                                    </span>
                                  )}
                                </div>
                                <div className={styles.consigneeSubtitleRow}>
                                  <span>
                                    Tel: <strong>{c.telefono ? formatPhone(c.telefono) : 'Sin registro'}</strong>
                                  </span>
                                  <span className={styles.subDivider}>·</span>
                                  <span>
                                    Distrito: <strong>{c.distrito || 'DESCONOCIDO'}</strong>
                                  </span>
                                  <span className={styles.subDivider}>·</span>
                                  <span className={styles.monoInline}>
                                    {c.guias.join(', ')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className={styles.consigneeRight}>
                              {cleanPhone.length >= 9 && (
                                <a
                                  href={`https://wa.me/51${cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.whatsappLinkBtn}
                                  onClick={e => e.stopPropagation()}
                                  title="Enviar mensaje directo por WhatsApp"
                                >
                                  <Phone size={12} />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                              <span className={styles.packageCountPill}>
                                {c.totalPaquetes} {c.totalPaquetes === 1 ? 'paquete' : 'paquetes'}
                              </span>
                              <span className={styles.chevronBox}>
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className={styles.consigneeExpandedBody}>
                              <table className={styles.subTable}>
                                <thead>
                                  <tr>
                                    <th>Guía</th>
                                    <th>Dirección</th>
                                    <th>Contenido</th>
                                    <th style={{ textAlign: 'right' }}>Peso</th>
                                    <th style={{ textAlign: 'center' }}>Pág.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.paquetes.map((p, pIdx) => (
                                    <tr key={`${p.guia}-${pIdx}`}>
                                      <td>
                                        <div className={styles.trackingCell}>
                                          <span className={styles.trackingCode}>{p.guia}</span>
                                          <button
                                            type="button"
                                            className={styles.btnCopyMini}
                                            onClick={() => copyToClipboard(p.guia, 'Guía')}
                                            title="Copiar guía"
                                          >
                                            {copiedCode === p.guia ? <Check size={12} className={styles.iconSuccess} /> : <Copy size={12} />}
                                          </button>
                                        </div>
                                      </td>
                                      <td>{p.direccion || '—'}</td>
                                      <td>{p.contenido || '—'}</td>
                                      <td className={styles.numericRight}>{p.pesoKg ? `${p.pesoKg.toFixed(2)} kg` : '—'}</td>
                                      <td className={styles.numericCenter}>{p.pagina}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Geographic Distribution Breakdown */}
            {activeTab === 'distritos' && (
              <div className={styles.panelBody}>
                <div className={styles.gridSubToolbar}>
                  <div className={styles.gridSummaryText}>
                    Distribución en <strong>{sortedDistrictEntries.length}</strong> distritos ({batchData.totalPaquetes} paquetes totales)
                  </div>
                </div>

                <div className={styles.geoGrid}>
                  {sortedDistrictEntries.map(([dist, count]) => {
                    const percent = Math.round((count / Math.max(batchData.totalPaquetes, 1)) * 100);
                    const isSelected = selectedDistrict.toUpperCase() === dist.toUpperCase();

                    return (
                      <div
                        key={dist}
                        className={`${styles.geoCard} ${isSelected ? styles.geoCardSelected : ''}`}
                        onClick={() => {
                          setSelectedDistrict(dist);
                          setActiveTab('paquetes');
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDistrict(dist);
                            setActiveTab('paquetes');
                          }
                        }}
                      >
                        <div className={styles.geoCardHeader}>
                          <div className={styles.geoTitleGroup}>
                            <span className={styles.geoIconBox} aria-hidden="true">
                              <MapPin size={15} />
                            </span>
                            <span className={styles.geoDistrictName}>{dist}</span>
                          </div>
                          <span className={styles.geoCardBadge}>{count} paq.</span>
                        </div>

                        <div className={styles.geoProgressBarTrack}>
                          <div
                            className={styles.geoProgressBarFill}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <div className={styles.geoFooter}>
                          <span>{percent}% del manifiesto</span>
                          <span className={styles.geoActionLink}>
                            Ver paquetes <ArrowRight size={12} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        ) : (
          /* Clean Corporate Empty State */
          <section className={styles.emptyCard}>
            <div className={styles.emptyIconBox} aria-hidden="true">
              <Package size={28} />
            </div>

            <h2 className={styles.emptyTitle}>Ningún lote cargado</h2>
            <p className={styles.emptyText}>
              Carga el manifiesto de guías térmicas emitido por J&T Express en formato PDF para extraer automáticamente destinatarios, teléfonos móviles, localidades y pesos.
            </p>

            <div className={styles.stepGuide}>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>1</span>
                <span>Obtén el archivo PDF consolidado desde el sistema de J&T Express.</span>
              </div>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>2</span>
                <span>Importa el documento PDF aquí (soporte de 200 o más páginas).</span>
              </div>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>3</span>
                <span>Exporta reportes estructurados o crea la ruta de notificación por WhatsApp.</span>
              </div>
            </div>

            <div className={styles.emptyActions}>
              <Button
                variant="primary"
                icon={<FileUp size={15} />}
                onClick={() => setShowUploadModal(true)}
              >
                Cargar PDF de J&T
              </Button>
              <Button
                variant="secondary"
                icon={<History size={15} />}
                onClick={() => setShowHistoryModal(true)}
              >
                Abrir Historial de Lotes
              </Button>
            </div>
          </section>
        )}
      </div>

      {/* Modals */}
      <JntUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleUploadSuccess}
      />

      <JntBatchHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        onSelectBatch={handleBatchSelected}
      />

      {batchData && activeBatchId && (
        <JntWhatsAppModal
          isOpen={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          batchData={batchData}
          batchId={activeBatchId}
        />
      )}
    </main>
  );
};

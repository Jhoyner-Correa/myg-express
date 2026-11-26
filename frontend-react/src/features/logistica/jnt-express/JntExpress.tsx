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
  FileText,
  Clock,
  Copy,
  Check,
  X,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Eye,
  MessageCircle
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
import { JntPackageDrawer } from './components/JntPackageDrawer';
import type { JntBatchDetailData, JntBatchHeader, JntPackage } from './types';
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

function buildDirectWhatsAppUrl(pkg: JntPackage): string {
  const cleanPhone = pkg.telefono.replace(/\D/g, '');
  const districtText = pkg.distrito ? ` (${pkg.distrito})` : '';
  const text = `Hola ${pkg.consignado}, te saludamos de MyG Express. Tu paquete de J&T Express con guía ${pkg.guia}${districtText} ya se encuentra registrado para coordinación de entrega.`;
  return `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(text)}`;
}

export const JntExpress: React.FC = () => {
  const { user } = useAuth();
  const [batchesList, setBatchesList] = useState<JntBatchHeader[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [batchData, setBatchData] = useState<JntBatchDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  // Modals & Drawer
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [inspectedPackage, setInspectedPackage] = useState<JntPackage | null>(null);

  // Filters, selection, sorting, pagination & tabs
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('TODOS');
  const [quickFilter, setQuickFilter] = useState<'all' | 'multi' | 'with_phone' | 'no_phone'>('all');
  const [activeTab, setActiveTab] = useState<'paquetes' | 'consignados' | 'distritos'>('paquetes');
  const [expandedConsignee, setExpandedConsignee] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedGuias, setSelectedGuias] = useState<Set<string>>(new Set());

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
      setBatchesList(batches);
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
      setSelectedGuias(new Set());
      setInspectedPackage(null);
      showToast('Manifiesto cargado correctamente', 'info');
    } catch (err: unknown) {
      console.error(err);
      showToast('Error al cargar los datos del manifiesto', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = async (newBatchId: number, data: JntBatchDetailData) => {
    setActiveBatchId(newBatchId);
    setBatchData(data);
    setSelectedDistrict('TODOS');
    setQuickFilter('all');
    setSearchQuery('');
    setExpandedConsignee(null);
    setSelectedGuias(new Set());
    setInspectedPackage(null);
    try {
      const batches = await jntService.listBatches();
      setBatchesList(batches);
    } catch {
      // silent refresh
    }
    showToast(`Manifiesto procesado: ${data.totalPaquetes} paquetes extraídos`, 'success');
  };

  const copyToClipboard = (text: string, label = 'Guía') => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 1800);
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
          topDistrictName: '—',
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
    const topDistrictName = distEntries[0]?.[0] || '—';
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
        p.contenido.toLowerCase().includes(q) ||
        (p.codigoRuta || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
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
  }, [batchData, quickFilter, selectedDistrict, searchQuery, sortField, sortDir, consigneePackageCounts]);

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

  // Related packages for drawer
  const inspectedRelatedPackages = useMemo(() => {
    if (!inspectedPackage || !batchData) return [];
    const targetName = inspectedPackage.consignado.toUpperCase();
    return batchData.paquetes.filter(p => p.consignado.toUpperCase() === targetName);
  }, [inspectedPackage, batchData]);

  // Selection helpers
  const allVisibleSelected = paginatedPackages.length > 0 && paginatedPackages.every(p => selectedGuias.has(p.guia));

  const toggleSelectAllVisible = () => {
    setSelectedGuias(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        paginatedPackages.forEach(p => next.delete(p.guia));
      } else {
        paginatedPackages.forEach(p => next.add(p.guia));
      }
      return next;
    });
  };

  const toggleSelectGuia = (guia: string) => {
    setSelectedGuias(prev => {
      const next = new Set(prev);
      if (next.has(guia)) next.delete(guia);
      else next.add(guia);
      return next;
    });
  };

  const handleExportExcel = (onlySelected = false) => {
    if (!batchData || batchData.paquetes.length === 0) {
      showToast('No hay paquetes para exportar', 'warning');
      return;
    }
    const source = onlySelected
      ? filteredPackages.filter(p => selectedGuias.has(p.guia))
      : filteredPackages;

    if (source.length === 0) {
      showToast('No hay registros seleccionados para exportar', 'warning');
      return;
    }

    const baseName = batchData.lote?.nombre_archivo
      ? batchData.lote.nombre_archivo.replace(/\.pdf$/i, '')
      : 'manifiesto';
    const fileName = onlySelected ? `JNT_Seleccion_${baseName}.xlsx` : `JNT_${baseName}.xlsx`;
    exportJntPackagesToExcel(source, fileName);
    showToast(`Exportados ${source.length} registros a Excel`, 'success');
  };

  const handleExportConsigneesExcel = () => {
    if (!batchData || batchData.consignados.length === 0) {
      showToast('No hay consignados para exportar', 'warning');
      return;
    }
    exportJntConsigneesToExcel(filteredConsignees, 'consignados_jnt_resumen.xlsx');
    showToast('Resumen de consignados exportado a Excel', 'success');
  };

  const handleCopySelectedGuias = () => {
    const selectedList = Array.from(selectedGuias);
    if (!selectedList.length) return;
    navigator.clipboard.writeText(selectedList.join('\n'));
    showToast(`${selectedList.length} guías copiadas al portapapeles`, 'success');
  };

  const hasActiveFilters = searchQuery.trim() !== '' || selectedDistrict !== 'TODOS' || quickFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDistrict('TODOS');
    setQuickFilter('all');
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={11} className={styles.sortIconMuted} />;
    return sortDir === 'asc'
      ? <ArrowUp size={11} className={styles.sortIconActive} />
      : <ArrowDown size={11} className={styles.sortIconActive} />;
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      {/* Corporate Page Header matching RRHH / Rutas */}
      <PageHeader
        tone="corporate"
        icon={<Package size={19} />}
        title="J&T Express"
        subtitle="Control de manifiestos PDF, auditoría de consignados y despacho corporativo por WhatsApp"
        metadata={
          <div className={styles.headerScope}>
            <span className={styles.statusLive}>
              <i />
              Operativo
            </span>
            <span className={styles.scopeDivider}>|</span>
            <span>{user?.sede_nombre || 'Sede Central'}</span>
          </div>
        }
      />

      <div className={styles.content}>
        {/* Unified Executive KPI Strip (matching RRHH .metrics architecture) */}
        {batchData && (
          <section className={styles.metricsStrip} aria-label="Indicadores del manifiesto">
            <article>
              <span className={styles.metricIconBlue} aria-hidden="true">
                <Package size={21} />
              </span>
              <div className={styles.metricCopy}>
                <p>Total Paquetes</p>
                <strong>{batchData.totalPaquetes}</strong>
                <small>
                  {batchData.totalPaginas} páginas · {stats.totalWeight > 0 ? `${stats.totalWeight} kg` : 'Sin peso'}
                </small>
              </div>
            </article>

            <article>
              <span className={styles.metricIconGreen} aria-hidden="true">
                <Users size={21} />
              </span>
              <div className={styles.metricCopy}>
                <p>Destinatarios</p>
                <strong>{batchData.totalConsignados}</strong>
                <small>
                  {stats.consigneesWithPhone} con móvil ({stats.consigneePhonePct}% contactable)
                </small>
              </div>
            </article>

            <article
              className={`${styles.metricInteractive} ${quickFilter === 'multi' ? styles.metricFocused : ''}`}
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
              title="Haz clic para filtrar clientes con múltiples paquetes"
            >
              <span className={styles.metricIconAmber} aria-hidden="true">
                <Layers size={21} />
              </span>
              <div className={styles.metricCopy}>
                <p>Consolidados</p>
                <strong>{batchData.consignadosMultiples}</strong>
                <small>
                  {stats.multiPackagesTotal} guías acumuladas · Ver grupo
                </small>
              </div>
            </article>

            <article
              className={`${styles.metricInteractive} ${activeTab === 'distritos' ? styles.metricFocused : ''}`}
              onClick={() => setActiveTab('distritos')}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('distritos');
                }
              }}
              title="Haz clic para ver el desglose por distritos"
            >
              <span className={styles.metricIconSlate} aria-hidden="true">
                <MapPin size={21} />
              </span>
              <div className={styles.metricCopy}>
                <p>Cobertura Distrital</p>
                <strong>{sortedDistrictEntries.length}</strong>
                <small>
                  Principal: {stats.topDistrictName} ({stats.topDistrictPct}%)
                </small>
              </div>
            </article>
          </section>
        )}

        {/* Main Enterprise Directory Workspace */}
        {batchData ? (
          <section className={styles.directoryPanel} aria-label="Directorio de paquetes J&T Express">
            {/* Directory Header: Active Manifest Context + Switcher + Primary Actions */}
            <header className={styles.directoryHeader}>
              <div className={styles.directoryIdentity}>
                <div className={styles.sectionContext}>
                  <span>Manifiesto Activo</span>
                  <div className={styles.batchTitleInline}>
                    <FileText size={15} />
                    {batchesList.length > 1 ? (
                      <select
                        className={styles.batchQuickSelect}
                        value={activeBatchId || ''}
                        onChange={e => handleBatchSelected(Number(e.target.value))}
                        aria-label="Cambiar manifiesto activo"
                        disabled={loading}
                      >
                        {batchesList.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.nombre_archivo} ({b.total_paquetes} guías)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong title={batchData.lote?.nombre_archivo}>
                        {batchData.lote?.nombre_archivo || 'Manifiesto actual'}
                      </strong>
                    )}
                  </div>
                </div>

                {batchData.lote && (
                  <div className={styles.directoryMetaRow}>
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
                    {batchData.lote.ruta_whatsapp_nombre && (
                      <span className={styles.routeLinkedBadge}>
                        <Check size={11} />
                        Ruta WhatsApp: {batchData.lote.ruta_whatsapp_nombre}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.directoryControls}>
                <div className={styles.viewSwitcher} role="tablist" aria-label="Modo de visualización">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'paquetes'}
                    className={activeTab === 'paquetes' ? styles.viewActive : ''}
                    onClick={() => setActiveTab('paquetes')}
                  >
                    <Package size={14} />
                    <span>Por Paquete ({filteredPackages.length})</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'consignados'}
                    className={activeTab === 'consignados' ? styles.viewActive : ''}
                    onClick={() => setActiveTab('consignados')}
                  >
                    <Users size={14} />
                    <span>Por Consignado ({filteredConsignees.length})</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'distritos'}
                    className={activeTab === 'distritos' ? styles.viewActive : ''}
                    onClick={() => setActiveTab('distritos')}
                  >
                    <MapPin size={14} />
                    <span>Distritos ({sortedDistrictEntries.length})</span>
                  </button>
                </div>

                <div className={styles.headerActionButtons}>
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
                    onClick={() => handleExportExcel(false)}
                    disabled={loading || filteredPackages.length === 0}
                  >
                    Excel
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
                    </Button>
                  )}
                </div>
              </div>
            </header>

            {/* Structured Labeled Filter Strip (RRHH .personnelFilters style) */}
            <div className={styles.filtersBar}>
              <label className={styles.filterSearchField}>
                <span>Buscar en manifiesto</span>
                <div className={styles.searchInputWrap}>
                  <Search size={15} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar por código JPE, consignado, celular, ruta o dirección..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className={styles.clearSearchBtn}
                      onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Limpiar búsqueda"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </label>

              <label className={styles.filterSelectField}>
                <span>Distrito de entrega</span>
                <select
                  value={selectedDistrict}
                  onChange={e => setSelectedDistrict(e.target.value)}
                >
                  <option value="TODOS">Todos los distritos ({batchData.totalPaquetes})</option>
                  {sortedDistrictEntries.map(([dist, count]) => (
                    <option key={dist} value={dist}>
                      {dist} ({count})
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.filterSelectField}>
                <span>Criterio operativo</span>
                <select
                  value={quickFilter}
                  onChange={e => setQuickFilter(e.target.value as typeof quickFilter)}
                >
                  <option value="all">Todos los paquetes ({batchData.totalPaquetes})</option>
                  <option value="multi">Solo multipaquete ({batchData.consignadosMultiples} clientes)</option>
                  <option value="with_phone">Con celular válido ({stats.packagesWithPhone})</option>
                  <option value="no_phone">Sin teléfono registrado ({stats.packagesNoPhone})</option>
                </select>
              </label>

              <label className={styles.filterSelectFieldCompact}>
                <span>Filas</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  aria-label="Registros por página"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>Todas ({filteredPackages.length})</option>
                </select>
              </label>
            </div>

            {/* Selection or Active Filter Context Bar */}
            {(selectedGuias.size > 0 || hasActiveFilters) && (
              <div className={styles.contextToolbar}>
                {selectedGuias.size > 0 ? (
                  <div className={styles.selectionGroup}>
                    <span className={styles.selectionBadge}>
                      {selectedGuias.size} {selectedGuias.size === 1 ? 'paquete seleccionado' : 'paquetes seleccionados'}
                    </span>
                    <button
                      type="button"
                      className={styles.contextActionBtn}
                      onClick={handleCopySelectedGuias}
                    >
                      <Copy size={13} />
                      Copiar guías
                    </button>
                    <button
                      type="button"
                      className={styles.contextActionBtn}
                      onClick={() => handleExportExcel(true)}
                    >
                      <FileSpreadsheet size={13} />
                      Exportar selección
                    </button>
                    <button
                      type="button"
                      className={styles.contextClearBtn}
                      onClick={() => setSelectedGuias(new Set())}
                    >
                      Limpiar selección
                    </button>
                  </div>
                ) : (
                  <div className={styles.filterStatusInfo}>
                    <span>
                      Mostrando <strong>{filteredPackages.length}</strong> de {batchData.totalPaquetes} registros filtrados
                    </span>
                    <button type="button" className={styles.contextClearBtn} onClick={resetFilters}>
                      Restablecer filtros
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 1: Package Directory Table */}
            {activeTab === 'paquetes' && (
              <div className={styles.tabContentBody}>
                <div className={styles.tableWrap}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th className={styles.colCheck}>
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            aria-label="Seleccionar todos los registros visibles"
                          />
                        </th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('guia')}>
                            <span>Guía / Ruta</span>
                            {renderSortIcon('guia')}
                          </button>
                        </th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('consignado')}>
                            <span>Consignado</span>
                            {renderSortIcon('consignado')}
                          </button>
                        </th>
                        <th>Contacto WhatsApp</th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('distrito')}>
                            <span>Destino y Dirección</span>
                            {renderSortIcon('distrito')}
                          </button>
                        </th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('pesoKg')}>
                            <span>Contenido / Peso</span>
                            {renderSortIcon('pesoKg')}
                          </button>
                        </th>
                        <th className={styles.colPage}>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('pagina')}>
                            <span>Pág.</span>
                            {renderSortIcon('pagina')}
                          </button>
                        </th>
                        <th className={styles.colActions}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPackages.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={styles.emptyTableCell}>
                            <Package size={32} className={styles.emptyTableIcon} />
                            <strong>No hay registros que coincidan con la consulta</strong>
                            <span>Ajusta los criterios de búsqueda o restablece los filtros activos.</span>
                          </td>
                        </tr>
                      ) : (
                        paginatedPackages.map((pkg, idx) => {
                          const globalIndex = (safePage - 1) * (pageSize || filteredPackages.length) + idx + 1;
                          const isSelected = selectedGuias.has(pkg.guia);
                          const isCopied = copiedCode === pkg.guia;
                          const multiCount = consigneePackageCounts.get(pkg.consignado.toUpperCase()) || 1;
                          const cleanPhone = pkg.telefono ? pkg.telefono.replace(/\D/g, '') : '';
                          const hasPhone = cleanPhone.length >= 9;

                          return (
                            <tr
                              key={`${pkg.guia}-${globalIndex}`}
                              className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                              onClick={() => setInspectedPackage(pkg)}
                            >
                              <td className={styles.colCheck} onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectGuia(pkg.guia)}
                                  aria-label={`Seleccionar guía ${pkg.guia}`}
                                />
                              </td>
                              <td>
                                <div className={styles.codeIdentity}>
                                  <strong>{pkg.guia}</strong>
                                  <small>{pkg.codigoRuta || `Reg. #${globalIndex}`}</small>
                                </div>
                              </td>
                              <td>
                                <div className={styles.personIdentity}>
                                  <strong title={pkg.consignado}>{pkg.consignado}</strong>
                                  {multiCount > 1 ? (
                                    <small className={styles.multiSubTag}>
                                      {multiCount} paquetes consolidados
                                    </small>
                                  ) : (
                                    <small>Entrega individual</small>
                                  )}
                                </div>
                              </td>
                              <td onClick={e => e.stopPropagation()}>
                                {hasPhone ? (
                                  <a
                                    href={buildDirectWhatsAppUrl(pkg)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.phoneLink}
                                    title={`Enviar WhatsApp a ${pkg.consignado}`}
                                  >
                                    <span className={styles.phoneDot} />
                                    <span>{formatPhone(pkg.telefono)}</span>
                                  </a>
                                ) : (
                                  <span className={styles.noPhoneLabel}>Sin teléfono</span>
                                )}
                              </td>
                              <td>
                                <div className={styles.addressCell}>
                                  <strong>{pkg.distrito || 'DESCONOCIDO'}</strong>
                                  <small title={pkg.direccion}>{pkg.direccion || 'Sin dirección'}</small>
                                </div>
                              </td>
                              <td>
                                <div className={styles.contentCell}>
                                  <strong title={pkg.contenido}>{pkg.contenido || 'Sin descripción'}</strong>
                                  <small>{pkg.pesoKg ? `${pkg.pesoKg.toFixed(2)} kg` : 'Peso n/d'}</small>
                                </div>
                              </td>
                              <td className={styles.colPage}>
                                <span className={styles.pageNum}>{pkg.pagina}</span>
                              </td>
                              <td className={styles.colActions} onClick={e => e.stopPropagation()}>
                                <div className={styles.rowActions}>
                                  <button
                                    type="button"
                                    title="Ver detalle completo de la guía"
                                    aria-label={`Ver detalle de ${pkg.guia}`}
                                    onClick={() => setInspectedPackage(pkg)}
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Copiar número de guía"
                                    aria-label={`Copiar ${pkg.guia}`}
                                    onClick={() => copyToClipboard(pkg.guia, 'Guía')}
                                  >
                                    {isCopied ? <Check size={14} className={styles.iconSuccess} /> : <Copy size={14} />}
                                  </button>
                                  {hasPhone && (
                                    <a
                                      href={buildDirectWhatsAppUrl(pkg)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={styles.rowActionLink}
                                      title={`Escribir por WhatsApp a ${pkg.consignado}`}
                                      aria-label={`WhatsApp a ${pkg.consignado}`}
                                    >
                                      <MessageCircle size={14} />
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <footer className={styles.gridFooter}>
                  <span className={styles.footerCountText}>
                    Mostrando <strong>{paginatedPackages.length}</strong> de <strong>{filteredPackages.length}</strong> paquetes
                    {' '}· Haz clic en cualquier fila para inspeccionar su detalle completo
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
              <div className={styles.tabContentBody}>
                <div className={styles.subViewToolbar}>
                  <span>
                    Mostrando <strong>{filteredConsignees.length}</strong> consignados únicos
                    {quickFilter === 'multi' && ' con 2 o más paquetes'}
                  </span>
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
                                      Consolidado · {c.totalPaquetes} guías
                                    </span>
                                  )}
                                </div>
                                <div className={styles.consigneeSubtitleRow}>
                                  <span>Tel: <strong>{c.telefono ? formatPhone(c.telefono) : 'Sin registro'}</strong></span>
                                  <span className={styles.scopeDivider}>·</span>
                                  <span>Distrito: <strong>{c.distrito || 'DESCONOCIDO'}</strong></span>
                                  <span className={styles.scopeDivider}>·</span>
                                  <span className={styles.guiasListText}>{c.guias.join(', ')}</span>
                                </div>
                              </div>
                            </div>

                            <div className={styles.consigneeRight}>
                              {cleanPhone.length >= 9 && (
                                <a
                                  href={`https://wa.me/51${cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.phoneLink}
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
                                    <th style={{ textAlign: 'right' }}>Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.paquetes.map((p, pIdx) => (
                                    <tr key={`${p.guia}-${pIdx}`}>
                                      <td><strong>{p.guia}</strong></td>
                                      <td>{p.direccion || '—'}</td>
                                      <td>{p.contenido || '—'}</td>
                                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {p.pesoKg ? `${p.pesoKg.toFixed(2)} kg` : '—'}
                                      </td>
                                      <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.pagina}</td>
                                      <td style={{ textAlign: 'right' }}>
                                        <button
                                          type="button"
                                          className={styles.subTableInspectBtn}
                                          onClick={() => setInspectedPackage(p)}
                                        >
                                          Inspeccionar
                                        </button>
                                      </td>
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

            {/* Tab 3: Districts Breakdown */}
            {activeTab === 'distritos' && (
              <div className={styles.tabContentBody}>
                <div className={styles.subViewToolbar}>
                  <span>
                    Distribución en <strong>{sortedDistrictEntries.length}</strong> distritos ({batchData.totalPaquetes} paquetes totales)
                  </span>
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
          <section className={styles.emptyCard}>
            <div className={styles.emptyIconBox} aria-hidden="true">
              <Package size={26} />
            </div>

            <h2 className={styles.emptyTitle}>Ningún lote cargado</h2>
            <p className={styles.emptyText}>
              Carga el manifiesto de guías térmicas emitido por J&amp;T Express en formato PDF para extraer destinatarios, teléfonos móviles, localidades y pesos.
            </p>

            <div className={styles.stepGuide}>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>1</span>
                <span>Descarga el PDF consolidado desde el sistema de J&amp;T Express.</span>
              </div>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>2</span>
                <span>Sube el archivo PDF aquí (soporta 200 o más páginas en segundos).</span>
              </div>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>3</span>
                <span>Audita los paquetes, exporta a Excel o crea la ruta de notificación por WhatsApp.</span>
              </div>
            </div>

            <div className={styles.emptyActions}>
              <Button
                variant="primary"
                icon={<FileUp size={15} />}
                onClick={() => setShowUploadModal(true)}
              >
                Cargar PDF de J&amp;T
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

      {/* Interactive Package Detail Drawer */}
      <JntPackageDrawer
        pkg={inspectedPackage}
        relatedPackages={inspectedRelatedPackages}
        onClose={() => setInspectedPackage(null)}
        onSelectPackage={setInspectedPackage}
        onCopy={copyToClipboard}
        buildWhatsAppUrl={buildDirectWhatsAppUrl}
      />

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

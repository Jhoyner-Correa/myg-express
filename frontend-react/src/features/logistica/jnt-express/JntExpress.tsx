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
  Copy,
  Check,
  X,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Eye,
  MessageCircle,
  Pencil
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import { showToast } from '../../../core/utils/toast';
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
type ActiveTab = 'todos' | 'consolidados' | 'consignados' | 'distritos';

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
  const [phoneFilter, setPhoneFilter] = useState<'all' | 'with_phone' | 'no_phone'>('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('todos');
  const [expandedConsignee, setExpandedConsignee] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedGuias, setSelectedGuias] = useState<Set<string>>(new Set());
  const [renamingActive, setRenamingActive] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

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
  }, [searchQuery, selectedDistrict, phoneFilter, activeTab, activeBatchId, pageSize]);

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
      setPhoneFilter('all');
      setSearchQuery('');
      setExpandedConsignee(null);
      setSelectedGuias(new Set());
      setInspectedPackage(null);
      showToast('Manifiesto cargado', 'info');
    } catch (err: unknown) {
      console.error(err);
      showToast('Error al cargar el manifiesto', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = async (newBatchId: number, data: JntBatchDetailData) => {
    setActiveBatchId(newBatchId);
    setBatchData(data);
    setSelectedDistrict('TODOS');
    setPhoneFilter('all');
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
    showToast(`PDF procesado: ${data.totalPaquetes} paquetes`, 'success');
  };

  const copyToClipboard = (text: string, label = 'Guía') => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 1600);
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

  const { stats, consigneePackageCounts } = useMemo(() => {
    const countsMap = new Map<string, number>();
    if (!batchData) {
      return {
        stats: { totalWeight: 0, packagesNoPhone: 0 },
        consigneePackageCounts: countsMap,
      };
    }

    batchData.consignados.forEach(c => {
      countsMap.set(c.consignado.toUpperCase(), c.totalPaquetes);
    });

    let totalWeight = 0;
    let packagesNoPhone = 0;
    batchData.paquetes.forEach(p => {
      if (p.pesoKg) totalWeight += p.pesoKg;
      if (!p.telefono || p.telefono.replace(/\D/g, '').length < 9) {
        packagesNoPhone++;
      }
    });

    return {
      stats: {
        totalWeight: Math.round(totalWeight * 100) / 100,
        packagesNoPhone,
      },
      consigneePackageCounts: countsMap,
    };
  }, [batchData]);

  const sortedDistrictEntries = useMemo(() => {
    if (!batchData?.distritos) return [];
    return Object.entries(batchData.distritos).sort((a, b) => b[1] - a[1]);
  }, [batchData]);

  // Filtered and sorted packages (for 'todos' tab)
  const filteredPackages = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.paquetes;

    if (phoneFilter === 'with_phone') {
      list = list.filter(p => p.telefono && p.telefono.replace(/\D/g, '').length >= 9);
    } else if (phoneFilter === 'no_phone') {
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

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'pagina') cmp = a.pagina - b.pagina;
      else if (sortField === 'pesoKg') cmp = (a.pesoKg || 0) - (b.pesoKg || 0);
      else if (sortField === 'guia') cmp = a.guia.localeCompare(b.guia);
      else if (sortField === 'consignado') cmp = a.consignado.localeCompare(b.consignado, 'es');
      else if (sortField === 'distrito') cmp = (a.distrito || '').localeCompare(b.distrito || '', 'es');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [batchData, phoneFilter, selectedDistrict, searchQuery, sortField, sortDir]);

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredPackages.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPackages = useMemo(() => {
    if (pageSize === 0) return filteredPackages;
    const start = (safePage - 1) * pageSize;
    return filteredPackages.slice(start, start + pageSize);
  }, [filteredPackages, safePage, pageSize]);

  // Filtered consignees (both 'consignados' and 'consolidados' tabs)
  const filteredConsignees = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.consignados;

    if (activeTab === 'consolidados') {
      list = list.filter(c => c.totalPaquetes > 1);
    }

    if (phoneFilter === 'with_phone') {
      list = list.filter(c => c.telefono && c.telefono.replace(/\D/g, '').length >= 9);
    } else if (phoneFilter === 'no_phone') {
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
  }, [batchData, activeTab, phoneFilter, selectedDistrict, searchQuery]);

  const inspectedRelatedPackages = useMemo(() => {
    if (!inspectedPackage || !batchData) return [];
    const targetName = inspectedPackage.consignado.toUpperCase();
    return batchData.paquetes.filter(p => p.consignado.toUpperCase() === targetName);
  }, [inspectedPackage, batchData]);

  const allVisibleSelected = paginatedPackages.length > 0 && paginatedPackages.every(p => selectedGuias.has(p.guia));

  const toggleSelectAllVisible = () => {
    setSelectedGuias(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) paginatedPackages.forEach(p => next.delete(p.guia));
      else paginatedPackages.forEach(p => next.add(p.guia));
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
      showToast('No hay registros seleccionados', 'warning');
      return;
    }

    const rawBase = batchData.lote?.nombre_archivo
      ? batchData.lote.nombre_archivo.replace(/\.pdf$/i, '')
      : 'manifiesto';
    const baseName = rawBase.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'manifiesto';
    exportJntPackagesToExcel(source, onlySelected ? `JNT_Seleccion_${baseName}.xlsx` : `JNT_${baseName}.xlsx`);
    showToast(`Exportados ${source.length} registros a Excel`, 'success');
  };

  const handleRenameSync = (id: number, newName: string) => {
    setBatchesList(prev => prev.map(b => (b.id === id ? { ...b, nombre_archivo: newName } : b)));
    setBatchData(prev => (prev?.lote?.id === id ? { ...prev, lote: { ...prev.lote, nombre_archivo: newName } } : prev));
  };

  const handleSaveHeaderRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatchId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', 'warning');
      return;
    }
    try {
      const updated = await jntService.renameBatch(activeBatchId, trimmed);
      handleRenameSync(activeBatchId, updated.nombre_archivo);
      setRenamingActive(false);
      showToast('Manifiesto renombrado', 'success');
    } catch (err: unknown) {
      console.error(err);
      showToast('Error al renombrar manifiesto', 'error');
    }
  };

  const handleExportConsigneesExcel = () => {
    if (!batchData || batchData.consignados.length === 0) {
      showToast('No hay consignados para exportar', 'warning');
      return;
    }
    exportJntConsigneesToExcel(filteredConsignees, 'consignados_jnt_resumen.xlsx');
    showToast('Resumen exportado a Excel', 'success');
  };

  const handleCopySelectedGuias = () => {
    const selectedList = Array.from(selectedGuias);
    if (!selectedList.length) return;
    navigator.clipboard.writeText(selectedList.join('\n'));
    showToast(`${selectedList.length} guías copiadas`, 'success');
  };

  const hasActiveFilters = searchQuery.trim() !== '' || selectedDistrict !== 'TODOS' || phoneFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDistrict('TODOS');
    setPhoneFilter('all');
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={11} className={styles.sortIconMuted} />;
    return sortDir === 'asc'
      ? <ArrowUp size={11} className={styles.sortIconActive} />
      : <ArrowDown size={11} className={styles.sortIconActive} />;
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      {/* Single Compact Header with Global Actions */}
      <PageHeader
        tone="corporate"
        icon={<Package size={19} />}
        title="J&T Express"
        subtitle="Manifiestos PDF y despacho corporativo por WhatsApp"
        metadata={
          <div className={styles.headerToolbar}>
            {batchesList.length > 0 && (
              renamingActive ? (
                <form className={styles.renameInlineBox} onSubmit={handleSaveHeaderRename}>
                  <input
                    type="text"
                    className={styles.batchSelect}
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    maxLength={180}
                    autoFocus
                    aria-label="Nuevo nombre del manifiesto"
                  />
                  <button type="submit" className={styles.inlineIconBtn} title="Guardar">
                    <Check size={14} className={styles.iconOk} />
                  </button>
                  <button
                    type="button"
                    className={styles.inlineIconBtn}
                    onClick={() => setRenamingActive(false)}
                    title="Cancelar"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <div className={styles.batchSelectWrap}>
                  <select
                    className={styles.batchSelect}
                    value={activeBatchId || ''}
                    onChange={e => handleBatchSelected(Number(e.target.value))}
                    aria-label="Seleccionar manifiesto"
                    disabled={loading}
                  >
                    {batchesList.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.nombre_archivo}
                      </option>
                    ))}
                  </select>
                  {activeBatchId && (
                    <button
                      type="button"
                      className={styles.inlineIconBtn}
                      onClick={() => {
                        setRenameDraft(batchData?.lote?.nombre_archivo || '');
                        setRenamingActive(true);
                      }}
                      title="Renombrar manifiesto"
                      aria-label="Renombrar manifiesto"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )
            )}

            <Button
              variant="secondary"
              size="sm"
              icon={<History size={14} />}
              onClick={() => setShowHistoryModal(true)}
              disabled={loading}
            >
              Historial
            </Button>

            {batchData && (
              <Button
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet size={14} />}
                onClick={() => (activeTab === 'consolidados' || activeTab === 'consignados') ? handleExportConsigneesExcel() : handleExportExcel(false)}
                disabled={loading || filteredPackages.length === 0}
              >
                Exportar
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              icon={<FileUp size={14} />}
              onClick={() => setShowUploadModal(true)}
              disabled={loading}
            >
              Cargar PDF
            </Button>

            {activeBatchId && batchData && (
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
        }
      />

      <div className={styles.content}>
        {batchData ? (
          <section className={styles.workbenchCard} aria-label="Listado de paquetes J&T Express">
            {/* Single Underline Tab Navigation + Concise Summary */}
            <header className={styles.workbenchTabsRow}>
              <nav className={styles.underlineTabs} role="tablist" aria-label="Vistas del manifiesto">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'todos'}
                  className={activeTab === 'todos' ? styles.tabActive : ''}
                  onClick={() => setActiveTab('todos')}
                >
                  <span>Todos</span>
                  <span className={styles.tabCount}>{batchData.totalPaquetes}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'consolidados'}
                  className={activeTab === 'consolidados' ? styles.tabActive : ''}
                  onClick={() => setActiveTab('consolidados')}
                >
                  <span>Consolidados</span>
                  <span className={styles.tabCount}>{batchData.consignadosMultiples}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'consignados'}
                  className={activeTab === 'consignados' ? styles.tabActive : ''}
                  onClick={() => setActiveTab('consignados')}
                >
                  <span>Consignados</span>
                  <span className={styles.tabCount}>{batchData.totalConsignados}</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'distritos'}
                  className={activeTab === 'distritos' ? styles.tabActive : ''}
                  onClick={() => setActiveTab('distritos')}
                >
                  <span>Distritos</span>
                  <span className={styles.tabCount}>{sortedDistrictEntries.length}</span>
                </button>
              </nav>

              <div className={styles.inlineMetaSummary}>
                <span>{batchData.totalPaginas} págs.</span>
                <span>·</span>
                <span>{stats.totalWeight} kg</span>
                {batchData.lote?.ruta_whatsapp_nombre && (
                  <>
                    <span>·</span>
                    <span className={styles.linkedRouteText}>
                      <Check size={12} />
                      {batchData.lote.ruta_whatsapp_nombre}
                    </span>
                  </>
                )}
              </div>
            </header>

            {/* Clean Compact Filter Row */}
            {activeTab !== 'distritos' && (
              <div className={styles.filterToolbar}>
                <div className={styles.searchField}>
                  <Search size={15} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar guía, consignado, teléfono o dirección..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className={styles.clearBtn}
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

                <div className={styles.filterControlsRight}>
                  <select
                    className={styles.compactSelect}
                    value={selectedDistrict}
                    onChange={e => setSelectedDistrict(e.target.value)}
                    aria-label="Filtrar por distrito"
                  >
                    <option value="TODOS">Todos los distritos</option>
                    {sortedDistrictEntries.map(([dist, count]) => (
                      <option key={dist} value={dist}>
                        {dist} ({count})
                      </option>
                    ))}
                  </select>

                  <select
                    className={styles.compactSelect}
                    value={phoneFilter}
                    onChange={e => setPhoneFilter(e.target.value as typeof phoneFilter)}
                    aria-label="Filtrar por disponibilidad de teléfono"
                  >
                    <option value="all">Teléfono: Todos</option>
                    <option value="with_phone">Solo con celular</option>
                    <option value="no_phone">Sin celular ({stats.packagesNoPhone})</option>
                  </select>

                  {activeTab === 'todos' && (
                    <select
                      className={styles.compactSelectSmall}
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                      aria-label="Filas por página"
                    >
                      <option value={50}>50 / pág</option>
                      <option value={100}>100 / pág</option>
                      <option value={0}>Todas</option>
                    </select>
                  )}

                  {hasActiveFilters && (
                    <button type="button" className={styles.resetFilterLink} onClick={resetFilters}>
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bulk Selection Strip (only visible when rows are checked) */}
            {selectedGuias.size > 0 && activeTab === 'todos' && (
              <div className={styles.bulkActionStrip}>
                <span><strong>{selectedGuias.size}</strong> seleccionados</span>
                <button type="button" onClick={handleCopySelectedGuias}>
                  <Copy size={13} /> Copiar guías
                </button>
                <button type="button" onClick={() => handleExportExcel(true)}>
                  <FileSpreadsheet size={13} /> Exportar selección
                </button>
                <button type="button" className={styles.bulkClear} onClick={() => setSelectedGuias(new Set())}>
                  Deseleccionar
                </button>
              </div>
            )}

            {/* Tab 1: Clean Single-Datum Table */}
            {activeTab === 'todos' && (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.colCheck}>
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            aria-label="Seleccionar filas visibles"
                          />
                        </th>
                        <th className={styles.colIndex}>#</th>
                        <th>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('guia')}>
                            <span>Guía</span>
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
                        <th className={styles.colRight}>
                          <button type="button" className={styles.sortBtn} onClick={() => toggleSort('pesoKg')}>
                            <span>Peso</span>
                            {renderSortIcon('pesoKg')}
                          </button>
                        </th>
                        <th className={styles.colActions}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPackages.length === 0 ? (
                        <tr>
                          <td colSpan={9} className={styles.emptyCell}>
                            <Package size={28} />
                            <strong>No se encontraron registros</strong>
                            <span>Prueba cambiando la búsqueda o el distrito seleccionado.</span>
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
                              className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                              onClick={() => setInspectedPackage(pkg)}
                            >
                              <td className={styles.colCheck} onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectGuia(pkg.guia)}
                                  aria-label={`Seleccionar ${pkg.guia}`}
                                />
                              </td>
                              <td className={styles.colIndex}>{globalIndex}</td>
                              <td className={styles.codeCell}>{pkg.guia}</td>
                              <td>
                                <div className={styles.consigneeCell}>
                                  <span className={styles.consigneeName} title={pkg.consignado}>
                                    {pkg.consignado}
                                  </span>
                                  {multiCount > 1 && (
                                    <span className={styles.multiPill}>{multiCount} paq.</span>
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
                                    title={`Abrir WhatsApp con ${pkg.consignado}`}
                                  >
                                    {formatPhone(pkg.telefono)}
                                  </a>
                                ) : (
                                  <span className={styles.mutedText}>—</span>
                                )}
                              </td>
                              <td className={styles.districtCell}>{pkg.distrito || '—'}</td>
                              <td className={styles.addressTruncate} title={pkg.direccion}>
                                {pkg.direccion || '—'}
                              </td>
                              <td className={styles.colRight}>
                                {pkg.pesoKg ? `${pkg.pesoKg.toFixed(2)} kg` : '—'}
                              </td>
                              <td className={styles.colActions} onClick={e => e.stopPropagation()}>
                                <div className={styles.rowActions}>
                                  <button
                                    type="button"
                                    title="Inspeccionar detalle completo"
                                    aria-label={`Inspeccionar ${pkg.guia}`}
                                    onClick={() => setInspectedPackage(pkg)}
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Copiar guía"
                                    aria-label={`Copiar ${pkg.guia}`}
                                    onClick={() => copyToClipboard(pkg.guia, 'Guía')}
                                  >
                                    {isCopied ? <Check size={14} className={styles.iconOk} /> : <Copy size={14} />}
                                  </button>
                                  {hasPhone && (
                                    <a
                                      href={buildDirectWhatsAppUrl(pkg)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={styles.waBtn}
                                      title="Enviar WhatsApp directo"
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

                <footer className={styles.tableFooter}>
                  <span>
                    {paginatedPackages.length} de {filteredPackages.length} registros
                  </span>
                  {totalPages > 1 && (
                    <div className={styles.pagination}>
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>{safePage} / {totalPages}</span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        aria-label="Página siguiente"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </footer>
              </>
            )}

            {/* Tab 2 & 3: Consolidados & Consignados */}
            {(activeTab === 'consolidados' || activeTab === 'consignados') && (
              <div className={styles.listBody}>
                {filteredConsignees.length === 0 ? (
                  <div className={styles.emptyBlock}>
                    <Users size={28} />
                    <strong>No se encontraron consignados</strong>
                    <span>Ajusta los filtros aplicados para ver resultados.</span>
                  </div>
                ) : (
                  filteredConsignees.map(c => {
                    const isExpanded = expandedConsignee === c.consignado;
                    const isMulti = c.totalPaquetes > 1;
                    const cleanPhone = c.telefono ? c.telefono.replace(/\D/g, '') : '';

                    return (
                      <div key={c.consignado} className={styles.consigneeItem}>
                        <div
                          className={styles.consigneeRow}
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
                          <div className={styles.consigneeInfo}>
                            <span className={styles.initials}>{getInitials(c.consignado)}</span>
                            <div className={styles.consigneeMain}>
                              <div className={styles.consigneeTitle}>
                                <strong>{c.consignado}</strong>
                                {isMulti && (
                                  <span className={styles.multiPill}>
                                    <Layers size={11} /> {c.totalPaquetes} paquetes
                                  </span>
                                )}
                              </div>
                              <div className={styles.consigneeSub}>
                                <span>{c.telefono ? formatPhone(c.telefono) : 'Sin teléfono'}</span>
                                <span>·</span>
                                <span>{c.distrito || 'Sin distrito'}</span>
                                <span>·</span>
                                <span className={styles.guiasText}>{c.guias.join(', ')}</span>
                              </div>
                            </div>
                          </div>

                          <div className={styles.consigneeEnd}>
                            {cleanPhone.length >= 9 && (
                              <a
                                href={`https://wa.me/51${cleanPhone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.waLinkPill}
                                onClick={e => e.stopPropagation()}
                              >
                                <Phone size={12} /> WhatsApp
                              </a>
                            )}
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className={styles.consigneeDetails}>
                            <table className={styles.subTable}>
                              <thead>
                                <tr>
                                  <th>Guía</th>
                                  <th>Dirección</th>
                                  <th>Contenido</th>
                                  <th className={styles.colRight}>Peso</th>
                                  <th className={styles.colRight}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.paquetes.map((p, pIdx) => (
                                  <tr key={`${p.guia}-${pIdx}`}>
                                    <td><strong>{p.guia}</strong></td>
                                    <td>{p.direccion || '—'}</td>
                                    <td>{p.contenido || '—'}</td>
                                    <td className={styles.colRight}>{p.pesoKg ? `${p.pesoKg.toFixed(2)} kg` : '—'}</td>
                                    <td className={styles.colRight}>
                                      <button
                                        type="button"
                                        className={styles.inspectBtn}
                                        onClick={() => setInspectedPackage(p)}
                                      >
                                        Ver ficha
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
            )}

            {/* Tab 4: Distritos */}
            {activeTab === 'distritos' && (
              <div className={styles.geoGrid}>
                {sortedDistrictEntries.map(([dist, count]) => {
                  const percent = Math.round((count / Math.max(batchData.totalPaquetes, 1)) * 100);
                  return (
                    <div
                      key={dist}
                      className={styles.geoCard}
                      onClick={() => {
                        setSelectedDistrict(dist);
                        setActiveTab('todos');
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDistrict(dist);
                          setActiveTab('todos');
                        }
                      }}
                    >
                      <div className={styles.geoTop}>
                        <div className={styles.geoName}>
                          <MapPin size={15} />
                          <strong>{dist}</strong>
                        </div>
                        <span>{count} paq.</span>
                      </div>
                      <div className={styles.geoBar}>
                        <div style={{ width: `${percent}%` }} />
                      </div>
                      <div className={styles.geoBottom}>
                        <span>{percent}% del total</span>
                        <span className={styles.geoLink}>Ver paquetes <ArrowRight size={12} /></span>
                      </div>
                    </div>
                  );
                })}
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
              Carga el manifiesto de guías térmicas emitido por J&amp;T Express en formato PDF para consultar consignados, exportar reportes y enviar avisos por WhatsApp.
            </p>
            <div className={styles.emptyActions}>
              <Button variant="primary" icon={<FileUp size={15} />} onClick={() => setShowUploadModal(true)}>
                Cargar PDF de J&amp;T
              </Button>
              <Button variant="secondary" icon={<History size={15} />} onClick={() => setShowHistoryModal(true)}>
                Ver Historial
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
        onBatchRenamed={handleRenameSync}
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

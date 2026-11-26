import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileUp,
  History,
  FileSpreadsheet,
  Send,
  Search,
  Package,
  Users,
  AlertTriangle,
  MapPin,
  ChevronDown,
  ChevronUp,
  Phone,
  FileText,
  Clock,
  Copy,
  Check,
  X,
  Layers,
  Sparkles,
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

const AVATAR_PALETTES = [
  { bg: '#e11d48', color: '#ffffff' },
  { bg: '#0284c7', color: '#ffffff' },
  { bg: '#059669', color: '#ffffff' },
  { bg: '#d97706', color: '#ffffff' },
  { bg: '#7c3aed', color: '#ffffff' },
  { bg: '#db2777', color: '#ffffff' },
  { bg: '#4f46e5', color: '#ffffff' },
  { bg: '#0891b2', color: '#ffffff' },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index]!;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'J&T';
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

  // Filters & Tabs
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('TODOS');
  const [quickFilter, setQuickFilter] = useState<'all' | 'multi' | 'with_phone' | 'no_phone'>('all');
  const [activeTab, setActiveTab] = useState<'paquetes' | 'consignados' | 'distritos'>('paquetes');
  const [expandedConsignee, setExpandedConsignee] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initial load
  useEffect(() => {
    loadMostRecentBatch();
  }, []);

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
    } catch (err: any) {
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
      showToast('Lote cargado exitosamente', 'info');
    } catch (err: any) {
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
    showToast(`PDF procesado: ${data.totalPaquetes} paquetes extraídos`, 'success');
  };

  const copyToClipboard = (text: string, label = 'Guía') => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
    showToast(`${label} copiada al portapapeles`, 'success');
  };

  // Precomputed stats
  const stats = useMemo(() => {
    if (!batchData) return { totalWeight: 0, withPhone: 0, noPhone: 0, multiCount: 0, topDistrict: '-' };
    let totalWeight = 0;
    let withPhone = 0;
    let noPhone = 0;

    batchData.paquetes.forEach(p => {
      if (p.pesoKg) totalWeight += p.pesoKg;
      if (p.telefono && p.telefono.length >= 9) {
        withPhone++;
      } else {
        noPhone++;
      }
    });

    const distEntries = Object.entries(batchData.distritos || {});
    distEntries.sort((a, b) => b[1] - a[1]);
    const topDistrict = distEntries[0] ? `${distEntries[0][0]} (${distEntries[0][1]})` : '-';

    return {
      totalWeight: Math.round(totalWeight * 100) / 100,
      withPhone,
      noPhone,
      multiCount: batchData.consignadosMultiples,
      topDistrict
    };
  }, [batchData]);

  // Filtered packages
  const filteredPackages = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.paquetes;

    // Quick filter
    if (quickFilter === 'multi') {
      const multiNames = new Set(
        batchData.consignados.filter(c => c.totalPaquetes > 1).map(c => c.consignado.toUpperCase())
      );
      list = list.filter(p => multiNames.has(p.consignado.toUpperCase()));
    } else if (quickFilter === 'with_phone') {
      list = list.filter(p => p.telefono && p.telefono.trim().length >= 9);
    } else if (quickFilter === 'no_phone') {
      list = list.filter(p => !p.telefono || p.telefono.trim().length < 9);
    }

    // District filter
    if (selectedDistrict !== 'TODOS') {
      list = list.filter(p => (p.distrito || 'DESCONOCIDO').toUpperCase() === selectedDistrict.toUpperCase());
    }

    // Search query
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

    return list;
  }, [batchData, quickFilter, selectedDistrict, searchQuery]);

  // Filtered consignees
  const filteredConsignees = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.consignados;

    if (quickFilter === 'multi') {
      list = list.filter(c => c.totalPaquetes > 1);
    } else if (quickFilter === 'with_phone') {
      list = list.filter(c => c.telefono && c.telefono.trim().length >= 9);
    } else if (quickFilter === 'no_phone') {
      list = list.filter(c => !c.telefono || c.telefono.trim().length < 9);
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

  return (
    <div className={styles.page}>
      {/* Top Corporate PageHeader */}
      <PageHeader
        tone="brand"
        icon={<Package size={22} />}
        title="J&T Express"
        subtitle="Extracción de guías PDF multi-página, validación de consignados y despacho masivo por WhatsApp"
        metadata={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#059669', fontSize: '0.75rem', fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Operativo
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>{user?.sede_nombre || 'Sede Central'}</span>
          </div>
        }
      />

      <main className={styles.content}>
        {/* Active Batch Command Strip */}
        {batchData && batchData.lote ? (
          <section className={styles.batchHero} aria-label="Lote activo">
            <div className={styles.batchHeroInfo}>
              <div className={styles.batchIconBadge}>
                <FileText size={22} />
              </div>
              <div className={styles.batchMetaBlock}>
                <div className={styles.batchTitleRow}>
                  <span className={styles.batchFileName} title={batchData.lote.nombre_archivo}>
                    {batchData.lote.nombre_archivo}
                  </span>
                  <span className={`${styles.batchStatusPill} ${styles.batchStatusPillActive}`}>
                    <Sparkles size={11} />
                    Lote Activo
                  </span>
                  {batchData.lote.ruta_whatsapp_nombre && (
                    <span className={styles.batchStatusPill} style={{ background: '#ecfdf5', color: '#059669' }}>
                      <Send size={11} />
                      WhatsApp Creado
                    </span>
                  )}
                </div>
                <div className={styles.batchStatsRow}>
                  <span><strong>{batchData.totalPaquetes}</strong> guías</span>
                  <span className={styles.statsDivider}>•</span>
                  <span><strong>{batchData.totalPaginas}</strong> páginas</span>
                  <span className={styles.statsDivider}>•</span>
                  <span><strong>{batchData.totalConsignados}</strong> consignados</span>
                  <span className={styles.statsDivider}>•</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={12} />
                    {new Date(batchData.lote.created_at).toLocaleString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.batchHeroActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowHistoryModal(true)}
                disabled={loading}
              >
                <History size={14} />
                Historial
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportExcel}
                disabled={loading || filteredPackages.length === 0}
              >
                <FileSpreadsheet size={14} />
                Exportar Excel
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUploadModal(true)}
                disabled={loading}
              >
                <FileUp size={14} />
                Cargar Otro PDF
              </Button>

              {activeBatchId && (
                <button
                  type="button"
                  className={styles.btnWhatsAppPrimary}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.84375rem',
                    border: 'none'
                  }}
                  onClick={() => setShowWhatsAppModal(true)}
                  disabled={loading}
                >
                  <Send size={15} />
                  <span>Enviar WhatsApp</span>
                  <span className={styles.actionCountBadge}>
                    {batchData.totalConsignados}
                  </span>
                </button>
              )}
            </div>
          </section>
        ) : null}

        {/* Executive KPI Cards Grid */}
        {batchData && (
          <section className={styles.kpiGrid} aria-label="Métricas del lote">
            {/* Card 1: Total Packages */}
            <div className={`${styles.kpiCard} ${styles.kpiToneRed}`}>
              <div className={styles.kpiTop}>
                <div className={styles.kpiLabelArea}>
                  <span className={styles.kpiCategory}>Total Paquetes</span>
                  <span className={styles.kpiValue}>{batchData.totalPaquetes}</span>
                </div>
                <div className={styles.kpiIconWrapper}>
                  <Package size={20} />
                </div>
              </div>
              <div className={styles.kpiBottom}>
                <span>{batchData.totalPaginas} páginas leídas</span>
                <span className={`${styles.kpiBadgeSmall} ${styles.kpiBadgeRed}`}>
                  {stats.totalWeight > 0 ? `${stats.totalWeight} kg total` : '100% leídas'}
                </span>
              </div>
            </div>

            {/* Card 2: Consignees */}
            <div className={`${styles.kpiCard} ${styles.kpiToneBlue}`}>
              <div className={styles.kpiTop}>
                <div className={styles.kpiLabelArea}>
                  <span className={styles.kpiCategory}>Destinatarios</span>
                  <span className={styles.kpiValue}>{batchData.totalConsignados}</span>
                </div>
                <div className={styles.kpiIconWrapper}>
                  <Users size={20} />
                </div>
              </div>
              <div className={styles.kpiBottom}>
                <span>{stats.withPhone} celulares 9 dígitos</span>
                <span className={`${styles.kpiBadgeSmall} ${styles.kpiBadgeBlue}`}>
                  {Math.round((stats.withPhone / Math.max(batchData.totalConsignados, 1)) * 100)}% con móvil
                </span>
              </div>
            </div>

            {/* Card 3: Multi-Packages */}
            <div
              className={`${styles.kpiCard} ${styles.kpiToneAmber} ${styles.kpiCardInteractive}`}
              onClick={() => {
                setQuickFilter(quickFilter === 'multi' ? 'all' : 'multi');
                setActiveTab('consignados');
              }}
              title="Haz clic para ver solo clientes con 2 o más paquetes"
            >
              <div className={styles.kpiTop}>
                <div className={styles.kpiLabelArea}>
                  <span className={styles.kpiCategory}>Consolidados</span>
                  <span className={styles.kpiValue}>{batchData.consignadosMultiples}</span>
                </div>
                <div className={styles.kpiIconWrapper}>
                  <Layers size={20} />
                </div>
              </div>
              <div className={styles.kpiBottom}>
                <span>Clientes con 2+ paquetes</span>
                <span className={`${styles.kpiBadgeSmall} ${styles.kpiBadgeAmber}`}>
                  Ahorro en ruta
                </span>
              </div>
            </div>

            {/* Card 4: Geographic Coverage */}
            <div
              className={`${styles.kpiCard} ${styles.kpiToneEmerald} ${styles.kpiCardInteractive}`}
              onClick={() => setActiveTab('distritos')}
              title="Haz clic para ver la distribución geográfica"
            >
              <div className={styles.kpiTop}>
                <div className={styles.kpiLabelArea}>
                  <span className={styles.kpiCategory}>Zonas / Distritos</span>
                  <span className={styles.kpiValue}>{Object.keys(batchData.distritos || {}).length}</span>
                </div>
                <div className={styles.kpiIconWrapper}>
                  <MapPin size={20} />
                </div>
              </div>
              <div className={styles.kpiBottom}>
                <span>Mayoría: {stats.topDistrict}</span>
                <span className={`${styles.kpiBadgeSmall} ${styles.kpiBadgeGreen}`}>
                  Ver zonas
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Content Hub: Search, Tabs and Data */}
        {batchData ? (
          <section className={styles.hubCard}>
            <div className={styles.hubControlsRow}>
              {/* Search Box */}
              <div className={styles.searchBox}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className={styles.searchInput}
                  placeholder="Buscar guía JPE..., consignado, celular, dirección o contenido..."
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
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Segmented View Tabs */}
              <div className={styles.segmentedTabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'paquetes'}
                  className={`${styles.segmentedTabBtn} ${activeTab === 'paquetes' ? styles.segmentedTabActive : ''}`}
                  onClick={() => setActiveTab('paquetes')}
                >
                  <Package size={15} />
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
                  <Users size={15} />
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
                  <MapPin size={15} />
                  <span>Por Distrito</span>
                </button>
              </div>
            </div>

            {/* Quick Filters Row */}
            <div className={styles.quickFiltersRow}>
              <span className={styles.filterLabelText}>Filtro rápido:</span>

              <button
                type="button"
                className={`${styles.quickChip} ${quickFilter === 'all' ? styles.quickChipActive : ''}`}
                onClick={() => setQuickFilter('all')}
              >
                Todos
                <span className={styles.chipCounter}>{batchData.totalPaquetes}</span>
              </button>

              <button
                type="button"
                className={`${styles.quickChip} ${quickFilter === 'multi' ? styles.quickChipActive : ''}`}
                onClick={() => setQuickFilter(quickFilter === 'multi' ? 'all' : 'multi')}
              >
                🔥 Solo Multipaquetes
                <span className={styles.chipCounter}>{batchData.consignadosMultiples}</span>
              </button>

              <button
                type="button"
                className={`${styles.quickChip} ${quickFilter === 'with_phone' ? styles.quickChipActive : ''}`}
                onClick={() => setQuickFilter(quickFilter === 'with_phone' ? 'all' : 'with_phone')}
              >
                📱 Con Celular
                <span className={styles.chipCounter}>{stats.withPhone}</span>
              </button>

              <button
                type="button"
                className={`${styles.quickChip} ${quickFilter === 'no_phone' ? styles.quickChipActive : ''}`}
                onClick={() => setQuickFilter(quickFilter === 'no_phone' ? 'all' : 'no_phone')}
              >
                ⚠️ Sin Teléfono
                <span className={styles.chipCounter}>{stats.noPhone}</span>
              </button>
            </div>

            {/* District Horizontal Carousel */}
            <div className={styles.districtBar}>
              <button
                type="button"
                className={`${styles.districtChip} ${selectedDistrict === 'TODOS' ? styles.districtChipActive : ''}`}
                onClick={() => setSelectedDistrict('TODOS')}
              >
                <span>Todos los distritos</span>
                <span className={styles.districtChipBadge}>{batchData.totalPaquetes}</span>
              </button>

              {Object.entries(batchData.distritos || {}).map(([dist, count]) => (
                <button
                  key={dist}
                  type="button"
                  className={`${styles.districtChip} ${selectedDistrict.toUpperCase() === dist.toUpperCase() ? styles.districtChipActive : ''}`}
                  onClick={() => setSelectedDistrict(dist)}
                >
                  <span>{dist}</span>
                  <span className={styles.districtChipBadge}>{count}</span>
                </button>
              ))}
            </div>

            {/* Tab 1: Detailed Package Data Grid */}
            {activeTab === 'paquetes' && (
              <div className={styles.tableCard}>
                <div className={styles.tableToolbar}>
                  <span>
                    Mostrando <strong>{filteredPackages.length}</strong> de <strong>{batchData.totalPaquetes}</strong> paquetes
                    {selectedDistrict !== 'TODOS' && ` en ${selectedDistrict}`}
                    {quickFilter !== 'all' && ` (filtrado)`}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleExportExcel}
                  >
                    <FileSpreadsheet size={14} />
                    Exportar esta vista
                  </Button>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th className={styles.colIndex}>#</th>
                        <th>Guía / Tracking</th>
                        <th>Consignado</th>
                        <th>Celular WhatsApp</th>
                        <th>Lugar / Distrito</th>
                        <th>Dirección</th>
                        <th>Contenido</th>
                        <th>Peso</th>
                        <th style={{ textAlign: 'center' }}>Pág</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPackages.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#64748b' }}>
                            <Package size={36} style={{ color: '#cbd5e1', margin: '0 auto 0.5rem', display: 'block' }} />
                            <strong style={{ display: 'block', color: '#1e293b', marginBottom: '0.25rem' }}>
                              No se encontraron paquetes
                            </strong>
                            <span>Intenta ajustar la búsqueda o los filtros de distrito seleccionados.</span>
                          </td>
                        </tr>
                      ) : (
                        filteredPackages.map((pkg, idx) => {
                          const avatarStyle = getAvatarStyle(pkg.consignado);
                          const isCopied = copiedCode === pkg.guia;

                          return (
                            <tr key={`${pkg.guia}-${idx}`}>
                              <td className={styles.colIndex}>{idx + 1}</td>
                              <td>
                                <div className={styles.trackingCell}>
                                  <span className={styles.trackingCode}>{pkg.guia}</span>
                                  <button
                                    type="button"
                                    className={styles.btnCopyMini}
                                    onClick={() => copyToClipboard(pkg.guia, 'Guía')}
                                    title="Copiar guía al portapapeles"
                                  >
                                    {isCopied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <div className={styles.consigneeCell}>
                                  <div
                                    className={styles.avatarInitial}
                                    style={{ background: avatarStyle.bg }}
                                    aria-hidden="true"
                                  >
                                    {getInitials(pkg.consignado)}
                                  </div>
                                  <span className={styles.consigneeNameText} title={pkg.consignado}>
                                    {pkg.consignado}
                                  </span>
                                </div>
                              </td>
                              <td>
                                {pkg.telefono && pkg.telefono.trim().length >= 9 ? (
                                  <a
                                    href={`https://wa.me/51${pkg.telefono.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.whatsappLinkBtn}
                                    title={`Chatear con ${pkg.consignado} por WhatsApp`}
                                  >
                                    <Phone size={12} />
                                    <span>{formatPhone(pkg.telefono)}</span>
                                  </a>
                                ) : (
                                  <span className={styles.noPhoneBadge}>
                                    <AlertTriangle size={12} />
                                    Sin celular
                                  </span>
                                )}
                              </td>
                              <td>
                                <span className={styles.districtTag}>
                                  {pkg.distrito || 'Satipo'}
                                </span>
                              </td>
                              <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pkg.direccion}>
                                {pkg.direccion || '-'}
                              </td>
                              <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pkg.contenido}>
                                {pkg.contenido || '-'}
                              </td>
                              <td>
                                {pkg.pesoKg ? (
                                  <span className={styles.weightBadge}>{pkg.pesoKg} kg</span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>-</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                                pág. {pkg.pagina}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={styles.tableSummaryFooter}>
                  <span>
                    Total en vista: <strong>{filteredPackages.length}</strong> paquetes
                  </span>
                  <span>
                    Consejo: Puedes hacer clic en el número celular para iniciar un chat directo de WhatsApp.
                  </span>
                </div>
              </div>
            )}

            {/* Tab 2: Grouped by Consignee Cards */}
            {activeTab === 'consignados' && (
              <div className={styles.consigneeCardGrid}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    Mostrando <strong>{filteredConsignees.length}</strong> consignados únicos
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleExportConsigneesExcel}
                  >
                    <FileSpreadsheet size={14} />
                    Exportar Resumen Consignados
                  </Button>
                </div>

                {filteredConsignees.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <Users size={36} style={{ color: '#cbd5e1', margin: '0 auto 0.5rem', display: 'block' }} />
                    <strong style={{ display: 'block', color: '#1e293b' }}>No se encontraron consignados</strong>
                    <span style={{ color: '#64748b', fontSize: '0.8125rem' }}>Revisa la consulta de búsqueda o selecciona otro filtro.</span>
                  </div>
                ) : (
                  filteredConsignees.map(c => {
                    const isExpanded = expandedConsignee === c.consignado;
                    const avatarStyle = getAvatarStyle(c.consignado);
                    const isMulti = c.totalPaquetes > 1;

                    return (
                      <div
                        key={c.consignado}
                        className={`${styles.consigneeCard} ${isMulti ? styles.consigneeCardMulti : ''}`}
                      >
                        <div
                          className={styles.consigneeHeader}
                          onClick={() => setExpandedConsignee(isExpanded ? null : c.consignado)}
                        >
                          <div className={styles.consigneeLeft}>
                            <div
                              className={styles.consigneeAvatarLg}
                              style={{ background: avatarStyle.bg }}
                              aria-hidden="true"
                            >
                              {getInitials(c.consignado)}
                            </div>
                            <div className={styles.consigneeMeta}>
                              <div className={styles.consigneeTitleRow}>
                                <span className={styles.consigneeNameLg}>{c.consignado}</span>
                                {isMulti && (
                                  <span className={styles.multiPackageTag}>
                                    <Layers size={12} />
                                    {c.totalPaquetes} paquetes consolidados
                                  </span>
                                )}
                              </div>
                              <div className={styles.consigneeSubtitleRow}>
                                <span>
                                  Cel: <strong>{c.telefono ? formatPhone(c.telefono) : 'Sin número'}</strong>
                                </span>
                                <span className={styles.statsDivider}>•</span>
                                <span>
                                  Lugar: <strong>{c.distrito || 'Satipo'}</strong>
                                </span>
                                <span className={styles.statsDivider}>•</span>
                                <span>
                                  Guías: <strong>{c.guias.join(', ')}</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className={styles.consigneeRight}>
                            {c.telefono && (
                              <a
                                href={`https://wa.me/51${c.telefono.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.whatsappLinkBtn}
                                onClick={e => e.stopPropagation()}
                                title="Enviar mensaje directo"
                              >
                                <Phone size={13} />
                                <span>WhatsApp</span>
                              </a>
                            )}
                            <span className={styles.packageCountPill}>
                              {c.totalPaquetes} {c.totalPaquetes === 1 ? 'paquete' : 'paquetes'}
                            </span>
                            <div style={{ color: '#94a3b8' }}>
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className={styles.consigneeExpandedBody}>
                            <table className={styles.dataTable} style={{ background: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
                              <thead>
                                <tr>
                                  <th>Guía</th>
                                  <th>Dirección</th>
                                  <th>Contenido</th>
                                  <th>Peso</th>
                                  <th style={{ textAlign: 'center' }}>Pág</th>
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
                                          {copiedCode === p.guia ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                                        </button>
                                      </div>
                                    </td>
                                    <td>{p.direccion || '-'}</td>
                                    <td>{p.contenido || '-'}</td>
                                    <td>{p.pesoKg ? `${p.pesoKg} kg` : '-'}</td>
                                    <td style={{ textAlign: 'center', color: '#64748b' }}>{p.pagina}</td>
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

            {/* Tab 3: Geographic Distribution Grid */}
            {activeTab === 'distritos' && (
              <div className={styles.geoGrid}>
                {Object.entries(batchData.distritos || {}).map(([dist, count]) => {
                  const percent = Math.round((count / Math.max(batchData.totalPaquetes, 1)) * 100);
                  const isSelected = selectedDistrict.toUpperCase() === dist.toUpperCase();

                  return (
                    <div
                      key={dist}
                      className={styles.geoCard}
                      onClick={() => {
                        setSelectedDistrict(dist);
                        setActiveTab('paquetes');
                      }}
                      style={isSelected ? { borderColor: '#e11d48', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.15)' } : undefined}
                    >
                      <div className={styles.geoCardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MapPin size={16} />
                          </div>
                          <span className={styles.geoDistrictName}>{dist}</span>
                        </div>
                        <span className={styles.geoCardBadge}>{count} paquetes</span>
                      </div>

                      <div className={styles.geoProgressBarTrack}>
                        <div
                          className={styles.geoProgressBarFill}
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className={styles.geoFooter}>
                        <span>{percent}% del total del lote</span>
                        <span style={{ color: '#0284c7', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          Ver paquetes <ArrowRight size={12} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          /* Empty State: Clean Corporate Welcome */
          <div className={styles.emptyCard}>
            <div className={styles.emptyIconRing}>
              <Package size={36} />
            </div>

            <h2 className={styles.emptyTitle}>Ningún lote cargado</h2>
            <p className={styles.emptyText}>
              Carga un archivo PDF de guías térmicas emitido por J&T Express para extraer automáticamente los destinatarios, números telefónicos, pesos y localidades de entrega.
            </p>

            <div className={styles.stepGuide}>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>1</span>
                <span>Descarga el PDF consolidado con todas las guías de J&T Express.</span>
              </div>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>2</span>
                <span>Sube el PDF en este módulo (admite 200 o más páginas).</span>
              </div>
              <div className={styles.stepGuideItem}>
                <span className={styles.stepNumber}>3</span>
                <span>Descarga reportes en Excel o despacha notificaciones masivas por WhatsApp.</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button
                variant="primary"
                onClick={() => setShowUploadModal(true)}
              >
                <FileUp size={16} />
                Cargar PDF de J&T
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowHistoryModal(true)}
              >
                <History size={16} />
                Abrir Historial de Lotes
              </Button>
            </div>
          </div>
        )}
      </main>

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
    </div>
  );
};

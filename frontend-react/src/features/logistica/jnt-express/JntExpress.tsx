import React, { useState, useMemo, useEffect } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { showToast } from '../../../core/utils/toast';
import { jntService } from './jnt.service';
import { exportJntPackagesToExcel, exportJntConsigneesToExcel } from './excel';
import { JntUploadModal } from './components/JntUploadModal';
import { JntBatchHistoryModal } from './components/JntBatchHistoryModal';
import { JntWhatsAppModal } from './components/JntWhatsAppModal';
import type { JntBatchDetailData } from './types';
import styles from './JntExpress.module.css';

export const JntExpress: React.FC = () => {
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
  const [activeTab, setActiveTab] = useState<'paquetes' | 'consignados' | 'distritos'>('paquetes');
  const [expandedConsignee, setExpandedConsignee] = useState<string | null>(null);

  // Initial load: check if there's a recent batch
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
      setSearchQuery('');
      showToast('Lote de J&T Express cargado', 'info');
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
    setSearchQuery('');
    showToast(`PDF procesado: ${data.totalPaquetes} paquetes extraídos`, 'success');
  };

  // Filtered packages
  const filteredPackages = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.paquetes;

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

    return list;
  }, [batchData, selectedDistrict, searchQuery]);

  // Filtered consignees
  const filteredConsignees = useMemo(() => {
    if (!batchData) return [];
    let list = batchData.consignados;

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
  }, [batchData, selectedDistrict, searchQuery]);

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
    showToast('Consignados exportados a Excel', 'success');
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.brandInfo}>
          <div className={styles.brandLogo}>J&T</div>
          <div className={styles.titleArea}>
            <h1>
              J&T Express
              <span className={styles.badgeLive}>Extractor PDF</span>
            </h1>
            <p className={styles.subtitle}>
              Extracción inteligente de consignados, números celulares y lugares desde guías PDF multi-página
            </p>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            onClick={() => setShowHistoryModal(true)}
            disabled={loading}
          >
            <History size={16} />
            Historial
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportExcel}
            disabled={loading || !batchData || batchData.paquetes.length === 0}
          >
            <FileSpreadsheet size={16} />
            Exportar Excel
          </Button>

          <Button
            variant="primary"
            onClick={() => setShowUploadModal(true)}
            disabled={loading}
          >
            <FileUp size={16} />
            Cargar PDF
          </Button>

          {batchData && batchData.paquetes.length > 0 && activeBatchId && (
            <Button
              variant="primary"
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
              onClick={() => setShowWhatsAppModal(true)}
              disabled={loading}
            >
              <Send size={16} />
              Enviar WhatsApp
            </Button>
          )}
        </div>
      </div>

      {/* Active Batch Banner (if loaded) */}
      {batchData?.lote && (
        <div className={styles.batchBanner}>
          <div className={styles.batchBannerContent}>
            <FileText size={16} color="#dc2626" />
            <span>
              Lote activo: <strong>{batchData.lote.nombre_archivo}</strong> ({batchData.totalPaquetes} paquetes en {batchData.totalPaginas} páginas)
            </span>
            <Clock size={14} style={{ marginLeft: '0.5rem' }} />
            <span>{new Date(batchData.lote.created_at).toLocaleString('es-PE')}</span>
          </div>

          {batchData.lote.ruta_whatsapp_nombre && (
            <div className={styles.metaBadge}>
              <ExternalLink size={12} />
              WhatsApp: {batchData.lote.ruta_whatsapp_nombre}
            </div>
          )}
        </div>
      )}

      {/* KPI Metric Cards */}
      {batchData && (
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={`${styles.metricIconWrapper} ${styles.iconRed}`}>
              <Package size={22} />
            </div>
            <div className={styles.metricDetails}>
              <span className={styles.metricLabel}>Total Paquetes</span>
              <span className={styles.metricValue}>{batchData.totalPaquetes}</span>
              <span className={styles.metricSubtext}>Extraídos en {batchData.totalPaginas} páginas</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={`${styles.metricIconWrapper} ${styles.iconBlue}`}>
              <Users size={22} />
            </div>
            <div className={styles.metricDetails}>
              <span className={styles.metricLabel}>Consignados Únicos</span>
              <span className={styles.metricValue}>{batchData.totalConsignados}</span>
              <span className={styles.metricSubtext}>Destinatarios reconocidos</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={`${styles.metricIconWrapper} ${styles.iconAmber}`}>
              <AlertTriangle size={22} />
            </div>
            <div className={styles.metricDetails}>
              <span className={styles.metricLabel}>Varios Paquetes</span>
              <span className={styles.metricValue}>{batchData.consignadosMultiples}</span>
              <span className={styles.metricSubtext}>Clientes con 2+ paquetes</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={`${styles.metricIconWrapper} ${styles.iconEmerald}`}>
              <MapPin size={22} />
            </div>
            <div className={styles.metricDetails}>
              <span className={styles.metricLabel}>Lugares / Distritos</span>
              <span className={styles.metricValue}>{Object.keys(batchData.distritos || {}).length}</span>
              <span className={styles.metricSubtext}>Zonas geográficas</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {batchData ? (
        <>
          {/* Controls Bar: Search & Tabs */}
          <div className={styles.controlsBar}>
            <div className={styles.searchBox}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por guía, consignado, celular, dirección..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.tabButtons}>
              <button
                className={`${styles.tabButton} ${activeTab === 'paquetes' ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab('paquetes')}
              >
                <Package size={15} />
                Por Paquete ({filteredPackages.length})
              </button>
              <button
                className={`${styles.tabButton} ${activeTab === 'consignados' ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab('consignados')}
              >
                <Users size={15} />
                Por Consignado ({filteredConsignees.length})
              </button>
              <button
                className={`${styles.tabButton} ${activeTab === 'distritos' ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab('distritos')}
              >
                <MapPin size={15} />
                Por Distrito
              </button>
            </div>
          </div>

          {/* District Filter Pills */}
          <div className={styles.districtFilterBar}>
            <button
              className={`${styles.districtPill} ${selectedDistrict === 'TODOS' ? styles.districtPillActive : ''}`}
              onClick={() => setSelectedDistrict('TODOS')}
            >
              Todos los distritos
              <span className={styles.pillBadge}>{batchData.totalPaquetes}</span>
            </button>
            {Object.entries(batchData.distritos || {}).map(([dist, count]) => (
              <button
                key={dist}
                className={`${styles.districtPill} ${selectedDistrict.toUpperCase() === dist.toUpperCase() ? styles.districtPillActive : ''}`}
                onClick={() => setSelectedDistrict(dist)}
              >
                {dist}
                <span className={styles.pillBadge}>{count}</span>
              </button>
            ))}
          </div>

          {/* Tab 1: Detailed Packages Table */}
          {activeTab === 'paquetes' && (
            <div className={styles.tableContainer}>
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Código Guía</th>
                      <th>Consignado</th>
                      <th>Teléfono</th>
                      <th>Distrito / Lugar</th>
                      <th>Dirección</th>
                      <th>Contenido</th>
                      <th>Peso</th>
                      <th>Pág</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPackages.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem' }}>
                          No se encontraron paquetes con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      filteredPackages.map((pkg, idx) => (
                        <tr key={`${pkg.guia}-${idx}`}>
                          <td style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{idx + 1}</td>
                          <td>
                            <span className={styles.trackingCode}>{pkg.guia}</span>
                          </td>
                          <td>
                            <strong style={{ color: '#0f172a' }}>{pkg.consignado}</strong>
                          </td>
                          <td>
                            {pkg.telefono ? (
                              <a
                                href={`https://wa.me/51${pkg.telefono}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.phoneLink}
                              >
                                <Phone size={13} />
                                {pkg.telefono}
                              </a>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Sin número</span>
                            )}
                          </td>
                          <td>
                            <span className={styles.districtBadge}>
                              {pkg.distrito || 'Satipo'}
                            </span>
                          </td>
                          <td style={{ maxWidth: '280px', fontSize: '0.8125rem' }}>
                            {pkg.direccion || '-'}
                          </td>
                          <td style={{ fontSize: '0.8125rem' }}>
                            {pkg.contenido || '-'}
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                            {pkg.pesoKg ? `${pkg.pesoKg} kg` : '-'}
                          </td>
                          <td style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            {pkg.pagina}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Grouped by Consignee */}
          {activeTab === 'consignados' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <Button size="sm" variant="secondary" onClick={handleExportConsigneesExcel}>
                  <FileSpreadsheet size={14} />
                  Descargar Resumen Consignados
                </Button>
              </div>

              {filteredConsignees.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No se encontraron consignados con los filtros seleccionados.</p>
                </div>
              ) : (
                filteredConsignees.map(c => {
                  const isExpanded = expandedConsignee === c.consignado;
                  return (
                    <div key={c.consignado} className={styles.consigneeCard}>
                      <div
                        className={styles.consigneeHeader}
                        onClick={() => setExpandedConsignee(isExpanded ? null : c.consignado)}
                      >
                        <div className={styles.consigneeMainInfo}>
                          <div>
                            <span className={styles.consigneeName}>{c.consignado}</span>
                            <div className={styles.consigneeSubtext}>
                              <span>Cel: <strong>{c.telefono}</strong></span>
                              <span>•</span>
                              <span>Lugar: <strong>{c.distrito}</strong></span>
                            </div>
                          </div>

                          {c.totalPaquetes > 1 && (
                            <span className={styles.multiPackageBadge}>
                              <AlertTriangle size={12} />
                              {c.totalPaquetes} paquetes juntos
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                            {c.totalPaquetes === 1 ? '1 paquete' : `${c.totalPaquetes} paquetes`}
                          </span>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={styles.consigneePackagesList}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Guía</th>
                                <th>Dirección</th>
                                <th>Contenido</th>
                                <th>Peso</th>
                                <th>Pág.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.paquetes.map((p, idx) => (
                                <tr key={`${p.guia}-${idx}`}>
                                  <td>
                                    <span className={styles.trackingCode}>{p.guia}</span>
                                  </td>
                                  <td>{p.direccion}</td>
                                  <td>{p.contenido}</td>
                                  <td>{p.pesoKg ? `${p.pesoKg} kg` : '-'}</td>
                                  <td>{p.pagina}</td>
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

          {/* Tab 3: Geographic Distribution */}
          {activeTab === 'distritos' && (
            <div className={styles.metricsGrid}>
              {Object.entries(batchData.distritos || {}).map(([dist, count]) => {
                const percent = Math.round((count / batchData.totalPaquetes) * 100);
                return (
                  <div
                    key={dist}
                    className={styles.metricCard}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedDistrict(dist);
                      setActiveTab('paquetes');
                    }}
                  >
                    <div className={`${styles.metricIconWrapper} ${styles.iconEmerald}`}>
                      <MapPin size={22} />
                    </div>
                    <div className={styles.metricDetails}>
                      <span className={styles.metricLabel}>{dist}</span>
                      <span className={styles.metricValue}>{count} paquetes</span>
                      <span className={styles.metricSubtext}>{percent}% del lote • Clic para ver</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Empty Welcome State */
        <div className={styles.emptyState}>
          <Package size={64} className={styles.emptyIcon} />
          <h2 className={styles.emptyStateTitle}>Ningún lote cargado</h2>
          <p className={styles.emptyStateText}>
            Sube un archivo PDF de guías térmicas de J&T Express para comenzar a extraer automáticamente los destinatarios, números telefónicos, pesos y lugares.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="primary" onClick={() => setShowUploadModal(true)}>
              <FileUp size={16} />
              Cargar PDF de J&T
            </Button>
            <Button variant="secondary" onClick={() => setShowHistoryModal(true)}>
              <History size={16} />
              Abrir Historial
            </Button>
          </div>
        </div>
      )}

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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  MapPin,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Truck,
  User,
} from 'lucide-react';

import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { downloadAuditCsv, downloadAuditExcel } from './exportExcel';
import type { AuditedGuideResult, GuideAuditBatchResponse, UrbanoAuditSite } from './types';
import { urbanoGuideAuditService } from './urbanoGuideAudit.service';
import styles from './UrbanoGuideAudit.module.css';

const SAMPLE_WYB_CODES = `WYB473662620\nWYB465612843\nWYB470704756`;

type TabKey = 'ALL' | 'CLEAN' | 'MOTIVATED' | 'DISCREPANCY' | 'MANAGEMENT';

function present(val: unknown, fallback = '—'): string {
  const text = String(val ?? '').trim();
  return text || fallback;
}

function formatOutForDelivery(val: string | null | undefined, attempts: number, motives: number) {
  if (!val) return { dateText: 'Sin registro', explanation: 'No salió a ruta' };
  if (val.toUpperCase().includes('PEND')) {
    return { dateText: 'Pendiente', explanation: 'Aún en almacén' };
  }
  const cleanDate = val.replace(/\s*\(\d+\)/, '').trim();
  if (attempts <= 1) {
    return {
      dateText: cleanDate || val,
      explanation: '1ª salida · Entrega limpia (0 motivos)',
    };
  }
  return {
    dateText: cleanDate || val,
    explanation: `${attempts}ª salida · ${motives} ${motives === 1 ? 'motivo previo' : 'motivos previos'}`,
  };
}

export const UrbanoGuideAudit: React.FC = () => {
  const [sites, setSites] = useState<UrbanoAuditSite[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [loadingSites, setLoadingSites] = useState<boolean>(true);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [auditData, setAuditData] = useState<GuideAuditBatchResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const auditAbort = useRef<AbortController | null>(null);

  // Cargar sedes operativas con credenciales Urbano
  useEffect(() => {
    const controller = new AbortController();
    urbanoGuideAuditService
      .sites(controller.signal)
      .then((data) => {
        setSites(data);
        const availableSite = data.find((s) => s.available);
        if (availableSite) {
          setSiteId(String(availableSite.id));
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          showToast(getApiErrorMessage(err, 'No se pudieron cargar las sedes operativas.'), 'error');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSites(false);
      });

    return () => {
      controller.abort();
      auditAbort.current?.abort();
    };
  }, []);

  const selectedSite = sites.find((s) => String(s.id) === siteId);

  // Detección reactiva de códigos WYB/ENU
  const detectedGuideCount = useMemo(() => {
    if (!inputText.trim()) return 0;
    const matches = inputText.match(/\b(?:WYB|ENU)\d{6,20}\b/gi) || [];
    return new Set(matches.map((m) => m.toUpperCase())).size;
  }, [inputText]);

  // Ejecución de auditoría
  const handleRunAudit = async () => {
    if (!siteId) {
      showToast('Selecciona una sede con credenciales Urbano activas.', 'error');
      return;
    }
    const matches = inputText.match(/\b(?:WYB|ENU)\d{6,20}\b/gi) || [];
    if (matches.length === 0) {
      showToast('Ingresa o pega al menos un código de guía WYB válido.', 'error');
      return;
    }

    setLoadingAudit(true);
    auditAbort.current?.abort();
    const controller = new AbortController();
    auditAbort.current = controller;

    try {
      const response = await urbanoGuideAuditService.auditGuides(
        Number(siteId),
        inputText,
        controller.signal,
      );
      setAuditData(response);
      setActiveTab('ALL');
      setSearchQuery('');
      setExpandedGuide(null);
      showToast(`Auditoría finalizada: ${response.records.length} guías consultadas en Urbano.`, 'success');
    } catch (err: any) {
      if (!controller.signal.aborted) {
        showToast(getApiErrorMessage(err, 'No se pudo consultar la auditoría en Urbano.'), 'error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingAudit(false);
      }
    }
  };

  // Filtrado de registros según pestaña y búsqueda
  const filteredRecords = useMemo(() => {
    if (!auditData?.records) return [];

    let list = auditData.records;

    if (activeTab === 'CLEAN') {
      list = list.filter((r) => r.audit.classification === 'ENTREGA_DIRECTA');
    } else if (activeTab === 'MOTIVATED') {
      list = list.filter((r) => r.audit.classification === 'ENTREGA_CON_MOTIVOS');
    } else if (activeTab === 'DISCREPANCY') {
      list = list.filter((r) => r.audit.classification === 'DISCREPANCIA_NO_ENTREGADO');
    } else if (activeTab === 'MANAGEMENT') {
      list = list.filter((r) => r.audit.classification === 'EN_GESTION');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.guide.toLowerCase().includes(q) ||
          (r.declared.provider && r.declared.provider.toLowerCase().includes(q)) ||
          (r.declared.route && r.declared.route.toLowerCase().includes(q)) ||
          (r.urbano?.recipient && r.urbano.recipient.toLowerCase().includes(q)) ||
          (r.urbano?.phone && r.urbano.phone.includes(q)) ||
          (r.audit.recipientSignature && r.audit.recipientSignature.toLowerCase().includes(q)) ||
          (r.audit.recipientDni && r.audit.recipientDni.includes(q)) ||
          (r.urbano?.status && r.urbano.status.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [auditData, activeTab, searchQuery]);

  const toggleExpand = (guide: string) => {
    setExpandedGuide((prev) => (prev === guide ? null : guide));
  };

  const handleExportExcel = async () => {
    if (!auditData || filteredRecords.length === 0) return;
    setExportingExcel(true);
    try {
      await downloadAuditExcel(filteredRecords, `Auditoria_Urbano_${auditData.site.name}`);
      showToast('Reporte Excel (.xlsx) exportado correctamente.', 'success');
    } catch {
      showToast('Error al generar el archivo Excel.', 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  const renderStatusPill = (record: AuditedGuideResult) => {
    const c = record.audit.classification;
    if (c === 'ENTREGA_DIRECTA') {
      return (
        <span className={`${styles.pillStatus} ${styles.pillClean}`}>
          <i /> Entrega Limpia
        </span>
      );
    }
    if (c === 'ENTREGA_CON_MOTIVOS') {
      return (
        <span className={`${styles.pillStatus} ${styles.pillMotivated}`}>
          <i /> Con Motivos ({record.audit.motives})
        </span>
      );
    }
    if (c === 'DISCREPANCIA_NO_ENTREGADO') {
      return (
        <span className={`${styles.pillStatus} ${styles.pillDiscrepancy}`}>
          <i /> Discrepancia
        </span>
      );
    }
    if (c === 'EN_GESTION') {
      return (
        <span className={`${styles.pillStatus} ${styles.pillManagement}`}>
          <i /> En Gestión
        </span>
      );
    }
    return (
      <span className={`${styles.pillStatus} ${styles.pillNotFound}`}>
        <i /> No Registrada
      </span>
    );
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      <PageHeader
        icon={<FileSpreadsheet />}
        title="Auditoría Guías WYB"
        subtitle="Auditoría directa de motivos, re-salidas a ruta y entregas en Urbano"
        metadata={
          <div className={styles.headerMeta}>
            <span>
              <ShieldCheck size={14} color="#15803d" />
              Acceso Administrador
            </span>
            <span>
              <i />
              Urbano SCM API
            </span>
          </div>
        }
      />

      <div className={styles.content}>
        <div className={styles.workspace}>
          {/* ========================================================
              PANEL IZQUIERDO: INGESTA DE GUÍAS WYB
              ======================================================== */}
          <aside className={styles.sidebarPanel} aria-label="Ingesta de Guías">
            <div className={styles.controlCard}>
              <div className={styles.cardHeading}>
                <div className={styles.cardHeadingLeft}>
                  <div className={styles.cardIconWrap}>
                    <PackageSearch size={16} />
                  </div>
                  <div>
                    <span className={styles.eyebrow}>CONSULTA DIRECTA</span>
                    <h3>Auditoría Guías</h3>
                  </div>
                </div>
              </div>

              {/* Sede Operativa */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabel}>
                  <span>Sede Operativa</span>
                  {selectedSite && (
                    <span
                      className={
                        selectedSite.available
                          ? `${styles.statusIndicator} ${styles.statusIndicatorOk}`
                          : `${styles.statusIndicator} ${styles.statusIndicatorWarn}`
                      }
                    >
                      <i /> {selectedSite.available ? 'En línea' : 'Sin acceso'}
                    </span>
                  )}
                </div>
                <div className={styles.selectShell}>
                  <Building2 size={15} />
                  <select
                    id="audit-site-select"
                    className={styles.siteSelect}
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    disabled={loadingSites || loadingAudit}
                  >
                    {loadingSites ? (
                      <option value="">Cargando sedes...</option>
                    ) : sites.length === 0 ? (
                      <option value="">Sin sedes configuradas</option>
                    ) : (
                      sites.map((s) => (
                        <option key={s.id} value={s.id} disabled={!s.available}>
                          {s.name} {!s.available ? '(Sin credenciales)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Textarea para pegar códigos WYB */}
              <div className={styles.textareaSection}>
                <div className={styles.textareaHeader}>
                  <label htmlFor="wyb-input-textarea">Códigos de Guía (WYB)</label>
                  <span
                    className={
                      detectedGuideCount > 0
                        ? `${styles.detectedCountBadge} ${styles.badgeActive}`
                        : `${styles.detectedCountBadge} ${styles.badgeNeutral}`
                    }
                  >
                    {detectedGuideCount > 0 ? `✓ ${detectedGuideCount} guías` : '0 guías'}
                  </span>
                </div>

                <textarea
                  id="wyb-input-textarea"
                  className={styles.textarea}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={loadingAudit}
                  placeholder={`WYB473662620\nWYB465612843\nWYB470704756`}
                />

                <div className={styles.textareaActions}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setInputText(SAMPLE_WYB_CODES)}
                    disabled={loadingAudit}
                    title="Pegar 3 códigos de guía WYB de ejemplo"
                  >
                    Ejemplo WYB
                  </button>

                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => {
                      setInputText('');
                      setAuditData(null);
                    }}
                    disabled={loadingAudit || (!inputText && !auditData)}
                    title="Limpiar entrada y resultados"
                  >
                    <Trash2 size={12} />
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Botón Auditar */}
              <button
                type="button"
                className={styles.btnAuditPrimary}
                onClick={handleRunAudit}
                disabled={loadingAudit || detectedGuideCount === 0 || !siteId}
              >
                {loadingAudit ? (
                  <>
                    <RefreshCw size={15} className={styles.spin} />
                    Consultando en Urbano...
                  </>
                ) : (
                  <>
                    <Search size={15} />
                    Auditar {detectedGuideCount > 0 ? `${detectedGuideCount} Guías` : 'en Urbano'}
                  </>
                )}
              </button>
            </div>
          </aside>

          {/* ========================================================
              PANEL DERECHO: CONSOLA DE RESULTADOS
              ======================================================== */}
          <section className={styles.mainPanel} aria-label="Resultados de Auditoría">
            {/* Barra Superior de KPIs */}
            <div className={styles.metricsBar}>
              <div className={styles.metricCard}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Total Auditadas</span>
                  <Package size={13} color="#64748b" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{auditData ? auditData.kpis.total : 0}</span>
                  <span className={styles.metricPct} style={{ color: '#64748b' }}>
                    guías
                  </span>
                </div>
                <span className={styles.metricFoot}>
                  {auditData && auditData.kpis.totalDeclaredCost > 0
                    ? `Declarado: S/ ${auditData.kpis.totalDeclaredCost.toFixed(2)}`
                    : 'Total de guías consultadas'}
                </span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricClean}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Entregas Limpias</span>
                  <CheckCircle2 size={13} color="#15803d" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{auditData ? auditData.kpis.cleanDeliveries : 0}</span>
                  <span className={styles.metricPct}>
                    ({auditData ? auditData.kpis.cleanDeliveriesPct : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>1er intento (0 motivos)</span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricMotivated}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Con Motivos</span>
                  <Clock size={13} color="#b45309" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{auditData ? auditData.kpis.motivatedDeliveries : 0}</span>
                  <span className={styles.metricPct}>
                    ({auditData ? auditData.kpis.motivatedDeliveriesPct : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>
                  {auditData
                    ? `${auditData.kpis.motives1Attempt} con 1 motivo · ${auditData.kpis.motives2Attempts + auditData.kpis.motives3PlusAttempts} con 2+`
                    : '2 o más salidas a ruta'}
                </span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricDiscrepancy}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Discrepancias</span>
                  <AlertTriangle size={13} color="#b91c1c" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{auditData ? auditData.kpis.discrepancies : 0}</span>
                  <span className={styles.metricPct}>
                    ({auditData ? auditData.kpis.discrepanciesPct : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot} style={{ color: '#dc2626' }}>
                  {auditData && auditData.kpis.discrepantDeclaredCost > 0
                    ? `Riesgo: S/ ${auditData.kpis.discrepantDeclaredCost.toFixed(2)}`
                    : 'En devolución o no entregada'}
                </span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricManagement}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>En Gestión</span>
                  <Truck size={13} color="#1d4ed8" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{auditData ? auditData.kpis.inManagement : 0}</span>
                  <span className={styles.metricPct}>
                    ({auditData ? auditData.kpis.inManagementPct : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>En tránsito o almacén</span>
              </div>
            </div>

            {/* Barra de Herramientas: Pestañas de Filtro y Exportación */}
            <div className={styles.resultsToolbar}>
              <div className={styles.tabList} role="tablist">
                <button
                  type="button"
                  className={`${styles.tabButton} ${activeTab === 'ALL' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('ALL')}
                >
                  Todas <span className={styles.tabCount}>{auditData ? auditData.kpis.total : 0}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.tabButton} ${activeTab === 'CLEAN' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('CLEAN')}
                >
                  Limpias <span className={styles.tabCount}>{auditData ? auditData.kpis.cleanDeliveries : 0}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.tabButton} ${activeTab === 'MOTIVATED' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('MOTIVATED')}
                >
                  Motivadas{' '}
                  <span className={styles.tabCount}>{auditData ? auditData.kpis.motivatedDeliveries : 0}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.tabButton} ${activeTab === 'DISCREPANCY' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('DISCREPANCY')}
                >
                  Discrepancias{' '}
                  <span className={`${styles.tabCount} ${styles.tabCountDanger}`}>
                    {auditData ? auditData.kpis.discrepancies : 0}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.tabButton} ${activeTab === 'MANAGEMENT' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('MANAGEMENT')}
                >
                  En Gestión{' '}
                  <span className={styles.tabCount}>{auditData ? auditData.kpis.inManagement : 0}</span>
                </button>
              </div>

              <div className={styles.toolbarRight}>
                <div className={styles.searchShell}>
                  <Search size={13} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Buscar guía, receptor, DNI..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={!auditData}
                  />
                </div>

                <button
                  type="button"
                  className={styles.btnExportExcel}
                  onClick={handleExportExcel}
                  disabled={!auditData || exportingExcel || filteredRecords.length === 0}
                  title="Exportar reporte a Excel (.xlsx)"
                >
                  <FileSpreadsheet size={13} />
                  {exportingExcel ? 'Generando...' : 'Exportar Excel'}
                </button>

                <button
                  type="button"
                  className={styles.btnExportCsv}
                  onClick={() => auditData && downloadAuditCsv(filteredRecords, `Auditoria_Urbano_${auditData.site.name}`)}
                  disabled={!auditData || filteredRecords.length === 0}
                  title="Exportar datos a CSV"
                >
                  <Download size={13} />
                  CSV
                </button>
              </div>
            </div>

            {/* Tabla de Resultados de Auditoría */}
            <div className={styles.tableWrap}>
              <table className={styles.auditTable}>
                <thead>
                  <tr>
                    <th>Guía WYB</th>
                    <th>Estado Real Urbano</th>
                    <th>Salidas a Ruta</th>
                    <th>Motivos Previos</th>
                    <th>Diagnóstico Auditoría</th>
                    <th>Receptor / DNI</th>
                    <th>WhatsApp</th>
                    <th style={{ textAlign: 'center' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAudit ? (
                    <tr>
                      <td colSpan={8} className={styles.loadingTableState}>
                        <div className={styles.loadingContent}>
                          <RefreshCw size={24} className={styles.spin} />
                          <strong>Consultando API de Urbano Express...</strong>
                          <p>Verificando salidas a ruta, motivos e historial en tiempo real.</p>
                        </div>
                      </td>
                    </tr>
                  ) : !auditData ? (
                    <tr>
                      <td colSpan={8} className={styles.emptyTableState}>
                        <div className={styles.emptyTableContent}>
                          <PackageSearch size={38} />
                          <strong>Sin guías consultadas</strong>
                          <p>
                            Pega los códigos de guía WYB en el panel izquierdo y haz clic en &quot;Auditar en Urbano&quot;
                            para ver los motivos y entregas reales.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.emptyTableState}>
                        No se encontraron guías en la vista actual o con el filtro ingresado.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((item) => {
                      const isExpanded = expandedGuide === item.guide;
                      const outForDeliveryInfo = formatOutForDelivery(
                        item.urbano?.dates.outForDelivery,
                        item.audit.attempts,
                        item.audit.motives,
                      );
                      return (
                        <React.Fragment key={item.guide}>
                          <tr>
                            <td>
                              <span className={styles.guideCode}>{item.guide}</span>
                              {item.urbano?.tracking && (
                                <span className={styles.guideTracking}>Urbano: {item.urbano.tracking}</span>
                              )}
                              {item.declared.provider && (
                                <span className={styles.guideTracking} style={{ color: '#475569' }}>
                                  {item.declared.provider}
                                </span>
                              )}
                            </td>

                            <td>
                              <div>
                                {renderStatusPill(item)}
                                <span className={styles.urbanoRawStatus} title={item.urbano?.status || 'No registrada'}>
                                  {item.urbano?.status || 'No registrada en Urbano'}
                                </span>
                              </div>
                            </td>

                            <td>
                              <span className={styles.motivesPillMain}>
                                {item.audit.attempts > 0 ? `${item.audit.attempts} ${item.audit.attempts === 1 ? 'salida' : 'salidas'}` : 'Sin salidas'}
                              </span>
                            </td>

                            <td>
                              <div className={styles.motivesPill}>
                                <span className={styles.motivesPillMain}>
                                  {item.audit.motives === 0
                                    ? '0 motivos'
                                    : `${item.audit.motives} ${item.audit.motives === 1 ? 'motivo' : 'motivos'}`}
                                </span>
                                <span className={styles.motivesSub}>
                                  {item.audit.motives === 0 ? 'Entrega limpia' : 'Re-salida a ruta'}
                                </span>
                              </div>
                            </td>

                            <td>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>
                                {item.audit.summaryText}
                              </span>
                            </td>

                            <td>
                              <div className={styles.receptionCell}>
                                <span
                                  className={styles.receptionName}
                                  title={item.audit.recipientSignature || item.urbano?.recipient || 'No registrado'}
                                >
                                  {present(item.audit.recipientSignature || item.urbano?.recipient)}
                                </span>
                                <span className={styles.receptionDni}>
                                  {item.audit.recipientDni ? `DNI: ${item.audit.recipientDni}` : 'Sin DNI'}
                                </span>
                              </div>
                            </td>

                            <td>
                              {item.localNotice ? (
                                <span className={`${styles.waBadge} ${styles.waBadgeOk}`}>
                                  ✓ {item.localNotice.telefono || 'Notificado'}
                                </span>
                              ) : (
                                <span className={`${styles.waBadge} ${styles.waBadgeNone}`}>
                                  Sin aviso
                                </span>
                              )}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={styles.btnExpand}
                                onClick={() => toggleExpand(item.guide)}
                                aria-expanded={isExpanded}
                                title="Ver detalles y evidencias"
                              >
                                <span>{isExpanded ? 'Ocultar' : 'Ver'}</span>
                                <ChevronDown size={12} />
                              </button>
                            </td>
                          </tr>

                          {/* Fila de Detalle Expandible Organizada */}
                          {isExpanded && (
                            <tr className={styles.detailsRow}>
                              <td colSpan={8}>
                                <div className={styles.detailDrawer}>
                                  {/* Header del Detalle */}
                                  <div className={styles.detailDrawerHeader}>
                                    <div className={styles.detailDrawerHeaderLeft}>
                                      <span className={styles.detailGuidePill}>{item.guide}</span>
                                      {item.urbano?.tracking && (
                                        <span className={styles.detailTrackingText}>
                                          Tracking Urbano: <strong>{item.urbano.tracking}</strong>
                                        </span>
                                      )}
                                      <span className={styles.detailSummaryPill}>
                                        {item.audit.summaryText}
                                      </span>
                                    </div>
                                    <div>{renderStatusPill(item)}</div>
                                  </div>

                                  {/* Stepper Cronológico Visual del Paquete */}
                                  <div className={styles.stepperWrap}>
                                    <div className={styles.stepperTitle}>
                                      <Clock size={13} />
                                      <span>Cronología y Ruta del Paquete en Urbano</span>
                                    </div>
                                    <div className={styles.stepperTimeline}>
                                      {/* 1. Registro */}
                                      <div className={styles.stepCard}>
                                        <span className={styles.stepIndex}>1. Registro</span>
                                        <strong className={styles.stepValue}>
                                          {present(item.urbano?.registeredAt || item.urbano?.dates.pickup)}
                                        </strong>
                                        <small className={styles.stepSub}>Ingreso al sistema</small>
                                      </div>

                                      <ArrowRight size={13} className={styles.stepArrow} />

                                      {/* 2. Despacho */}
                                      <div className={styles.stepCard}>
                                        <span className={styles.stepIndex}>2. Despacho</span>
                                        <strong className={styles.stepValue}>
                                          {present(item.urbano?.dates.dispatched)}
                                        </strong>
                                        <small className={styles.stepSub}>Tránsito entre sedes</small>
                                      </div>

                                      <ArrowRight size={13} className={styles.stepArrow} />

                                      {/* 3. Admisión */}
                                      <div className={styles.stepCard}>
                                        <span className={styles.stepIndex}>3. Admisión</span>
                                        <strong className={styles.stepValue}>
                                          {present(item.urbano?.dates.admitted)}
                                        </strong>
                                        <small className={styles.stepSub}>Llegada a agencia</small>
                                      </div>

                                      <ArrowRight size={13} className={styles.stepArrow} />

                                      {/* 4. Salida a Ruta */}
                                      <div
                                        className={`${styles.stepCard} ${
                                          item.audit.motives > 0 ? styles.stepCardMotivated : styles.stepCardClean
                                        }`}
                                      >
                                        <span className={styles.stepIndex}>4. Salida a Ruta</span>
                                        <strong className={styles.stepValue}>{outForDeliveryInfo.dateText}</strong>
                                        <small className={styles.stepSubHighlight}>
                                          {outForDeliveryInfo.explanation}
                                        </small>
                                      </div>

                                      <ArrowRight size={13} className={styles.stepArrow} />

                                      {/* 5. Estado Final */}
                                      <div
                                        className={`${styles.stepCard} ${
                                          item.audit.isDiscrepancy ? styles.stepCardDanger : styles.stepCardSuccess
                                        }`}
                                      >
                                        <span className={styles.stepIndex}>5. Estado Final</span>
                                        <strong className={styles.stepValue}>
                                          {present(item.urbano?.status)}
                                        </strong>
                                        <small className={styles.stepSub}>
                                          {item.urbano?.estimatedDeliveryDate
                                            ? `Est: ${item.urbano.estimatedDeliveryDate}`
                                            : 'Cierre de gestión'}
                                        </small>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Grid de 3 Tarjetas de Datos Claras */}
                                  <div className={styles.detailGridCards}>
                                    {/* Card 1: Datos de Recepción y Firmante */}
                                    <div className={styles.detailBlockCard}>
                                      <div className={styles.detailBlockHeader}>
                                        <User size={13} color="#1d5fc7" />
                                        <h4>Recepción y Entrega Real</h4>
                                      </div>
                                      <div className={styles.detailList}>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Firmante / Receptor</span>
                                          <span className={styles.itemValueBold}>
                                            {present(item.audit.recipientSignature || item.urbano?.recipient)}
                                          </span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>DNI Receptor</span>
                                          <span className={styles.itemValueBadge}>
                                            {present(item.audit.recipientDni, 'Sin DNI registrado')}
                                          </span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Destinatario Oficial</span>
                                          <span className={styles.itemValue}>{present(item.urbano?.recipient)}</span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Teléfono Contacto</span>
                                          <span className={styles.itemValue}>{present(item.urbano?.phone)}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Card 2: Destino y Observación de Urbano */}
                                    <div className={styles.detailBlockCard}>
                                      <div className={styles.detailBlockHeader}>
                                        <MapPin size={13} color="#0891b2" />
                                        <h4>Ubicación y Observación</h4>
                                      </div>
                                      <div className={styles.detailList}>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Dirección de Entrega</span>
                                          <span className={styles.itemValue}>{present(item.urbano?.address)}</span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Localidad / Destino</span>
                                          <span className={styles.itemValue}>{present(item.urbano?.destination)}</span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Remitente / Cliente</span>
                                          <span className={styles.itemValue}>
                                            {present(item.urbano?.sender || item.urbano?.contract)}
                                          </span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Detalle Operativo Urbano</span>
                                          <span className={styles.itemValueObs}>
                                            {present(item.urbano?.statusDetail, 'Sin observaciones')}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Card 3: Auditoría y WhatsApp */}
                                    <div className={styles.detailBlockCard}>
                                      <div className={styles.detailBlockHeader}>
                                        <Smartphone size={13} color="#16a34a" />
                                        <h4>WhatsApp y Liquidación</h4>
                                      </div>
                                      <div className={styles.detailList}>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Aviso Diario WhatsApp</span>
                                          <span className={item.localNotice ? styles.waNoticeOk : styles.waNoticeNone}>
                                            {item.localNotice
                                              ? `✓ Enviado al ${item.localNotice.telefono}`
                                              : 'Sin aviso registrado'}
                                          </span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Fecha Aviso WhatsApp</span>
                                          <span className={styles.itemValue}>
                                            {present(item.localNotice?.fechaEnvio, '—')}
                                          </span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Estado Declarado Courier</span>
                                          <span className={styles.itemValue}>{present(item.declared.status, '—')}</span>
                                        </div>
                                        <div className={styles.detailListItem}>
                                          <span className={styles.itemLabel}>Costo Declarado en Ruta</span>
                                          <span className={styles.itemValueCost}>
                                            {item.declared.cost !== null ? `S/ ${item.declared.cost.toFixed(2)}` : '—'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

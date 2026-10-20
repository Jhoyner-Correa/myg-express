import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileSearch,
  FileSpreadsheet,
  Info,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
} from 'lucide-react';

import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { downloadAuditCsv, downloadAuditExcel } from './exportExcel';
import type { AuditedGuideResult, GuideAuditBatchResponse, UrbanoAuditSite } from './types';
import { urbanoGuideAuditService } from './urbanoGuideAudit.service';
import styles from './UrbanoGuideAudit.module.css';

const SAMPLE_EXCEL_PASTE = `PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1148434,2026-09-30,Urbanas,OXAPAMPA,1306 - MARY KAY PERU S.R.L.,WYB473662620,ENTREGADO,,0.39,0.39,0.39,0,3,3,0,0,3,4,2026-09-28,2026-09-29,2026-09-30,12:36,0.39,0.99,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,Agencia Satipo,8495-3W,Distribución,1144777,2026-09-23,Urbanas,SAN MARTIN DE PORRES,5125 - MERCADO LIBRE,WYB465612843,ENTREGADO,,45,45,30,15,20,20,0,0,20,0,2026-08-04,2026-08-04,2026-08-27,01:44,45,43.2,10476022211,,,,,,,20
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1142537,2026-09-18,Urbanas,SATIPO,5125 - MERCADO LIBRE,WYB470704756,ENTREGADO,,0.31,0.31,0.31,0,3,3,0,0,3,9,2026-09-09,2026-09-10,2026-09-11,12:12,0.31,0.6,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1136257,2026-09-07,Urbanas,OXAPAMPA,5125 - MERCADO LIBRE,WYB470292172,ENTREGADO,,0.09,0.09,0.09,0,3,3,0,0,3,8,2026-09-04,2026-09-05,2026-09-07,12:24,0.09,0.6,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1137305,2026-09-08,Urbanas,OXAPAMPA,5125 - MERCADO LIBRE,WYB469955370,ENTREGADO,,0.13,0.13,0.13,0,3,3,0,0,3,5,2026-09-03,2026-09-04,2026-09-05,16:35,0.13,0.6,10476022211,,,,,,,3`;

type TabKey = 'ALL' | 'CLEAN' | 'MOTIVATED' | 'DISCREPANCY' | 'MANAGEMENT';

function present(val: unknown, fallback = '—'): string {
  const text = String(val ?? '').trim();
  return text || fallback;
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

  // Cargar sedes operativas
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
  const runAuditWithText = async (textToAudit: string) => {
    if (!siteId) {
      showToast('Selecciona una sede con credenciales activas.', 'error');
      return;
    }
    const matches = textToAudit.match(/\b(?:WYB|ENU)\d{6,20}\b/gi) || [];
    if (matches.length === 0) {
      showToast('Ingresa o pega al menos una guía válida (WYB... o ENU...).', 'error');
      return;
    }

    setLoadingAudit(true);
    auditAbort.current?.abort();
    const controller = new AbortController();
    auditAbort.current = controller;

    try {
      const response = await urbanoGuideAuditService.auditGuides(
        Number(siteId),
        textToAudit,
        controller.signal,
      );
      setAuditData(response);
      setActiveTab('ALL');
      setSearchQuery('');
      setExpandedGuide(null);
      showToast(`Auditoría finalizada: ${response.records.length} guías verificadas en Urbano.`, 'success');
    } catch (err: any) {
      if (!controller.signal.aborted) {
        showToast(getApiErrorMessage(err, 'No se pudo procesar la auditoría en Urbano.'), 'error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingAudit(false);
      }
    }
  };

  const handleRunAudit = () => {
    void runAuditWithText(inputText);
  };

  const handleRunSampleAudit = () => {
    setInputText(SAMPLE_EXCEL_PASTE);
    void runAuditWithText(SAMPLE_EXCEL_PASTE);
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
      showToast('Reporte Excel (.xlsx) generado con éxito.', 'success');
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
        subtitle="Auditoría en tiempo real de motivos, re-salidas a ruta y entregas reales en Urbano"
        metadata={
          <div className={styles.headerMeta}>
            <span>
              <ShieldCheck size={14} color="#15803d" />
              Acceso Administrador
            </span>
            <span>
              <i />
              API Urbano SCM Conectada
            </span>
          </div>
        }
      />

      <div className={styles.content}>
        <div className={styles.workspace}>
          {/* ========================================================
              PANEL IZQUIERDO: CONTROLES E INGESTA
              ======================================================== */}
          <aside className={styles.sidebarPanel} aria-label="Controles de Auditoría">
            {/* Card 1: Sede Operativa */}
            <div className={styles.controlCard}>
              <div className={styles.cardHeading}>
                <div className={styles.cardHeadingLeft}>
                  <div className={styles.cardIconWrap}>
                    <Building2 size={16} />
                  </div>
                  <div>
                    <span className={styles.eyebrow}>CONEXIÓN URBANO</span>
                    <h3>Sede de Consulta</h3>
                  </div>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="audit-site-select" className={styles.fieldLabel}>
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
                </label>
                <div className={styles.selectShell}>
                  <Building2 size={16} />
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
            </div>

            {/* Card 2: Ingesta de Guías / Textarea */}
            <div className={styles.controlCard}>
              <div className={styles.cardHeading}>
                <div className={styles.cardHeadingLeft}>
                  <div className={styles.cardIconWrap}>
                    <FileSearch size={16} />
                  </div>
                  <div>
                    <span className={styles.eyebrow}>ENTRADA MASIVA</span>
                    <h3>Pegar Liquidación o WYB</h3>
                  </div>
                </div>
              </div>

              <div className={styles.textareaWrap}>
                <div className={styles.textareaHeader}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Excel (copiar y pegar) o códigos:</span>
                  <span
                    className={
                      detectedGuideCount > 0
                        ? `${styles.detectedCountBadge} ${styles.badgeActive}`
                        : `${styles.detectedCountBadge} ${styles.badgeNeutral}`
                    }
                  >
                    {detectedGuideCount > 0 ? `✓ ${detectedGuideCount} detectadas` : '0 guías'}
                  </span>
                </div>

                <textarea
                  className={styles.textarea}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={loadingAudit}
                  placeholder="Pega aquí directamente las filas de tu Excel con transportista, ruta y costo, o una lista simple de códigos WYB/ENU...&#10;&#10;Ejemplo:&#10;WYB473662620&#10;WYB465612843&#10;WYB470704756"
                />

                <div className={styles.textareaActions}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setInputText(SAMPLE_EXCEL_PASTE)}
                    disabled={loadingAudit}
                    title="Cargar filas reales con transportistas y costos para probar"
                  >
                    <Sparkles size={13} color="#2563eb" />
                    Cargar Ejemplo
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
                    <Trash2 size={13} />
                    Limpiar
                  </button>
                </div>
              </div>

              <button
                type="button"
                className={styles.btnAuditPrimary}
                onClick={handleRunAudit}
                disabled={loadingAudit || detectedGuideCount === 0 || !siteId}
              >
                {loadingAudit ? (
                  <>
                    <RefreshCw size={16} className={styles.spin} />
                    Auditando en Urbano...
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Auditar {detectedGuideCount > 0 ? `${detectedGuideCount} Guías` : 'en Urbano'}
                  </>
                )}
              </button>
            </div>

            {/* Card 3: Leyenda y Criterios */}
            <div className={styles.controlCard}>
              <div className={styles.cardHeading}>
                <div className={styles.cardHeadingLeft}>
                  <Info size={15} color="#475569" />
                  <h3>Criterios de Conciliación</h3>
                </div>
              </div>

              <ul className={styles.legendList}>
                <li className={styles.legendItem}>
                  <i className={`${styles.legendDot} ${styles.dotClean}`} />
                  <div>
                    <strong>Entrega Limpia:</strong> <span>1er intento (0 motivos previos)</span>
                  </div>
                </li>
                <li className={styles.legendItem}>
                  <i className={`${styles.legendDot} ${styles.dotMotivated}`} />
                  <div>
                    <strong>Con Motivos:</strong> <span>2 o más salidas a ruta antes de entrega</span>
                  </div>
                </li>
                <li className={styles.legendItem}>
                  <i className={`${styles.legendDot} ${styles.dotDiscrepancy}`} />
                  <div>
                    <strong>Discrepancia:</strong> <span>Liquidado como entregado pero devuelto o en almacén</span>
                  </div>
                </li>
                <li className={styles.legendItem}>
                  <i className={`${styles.legendDot} ${styles.dotManagement}`} />
                  <div>
                    <strong>En Gestión:</strong> <span>En tránsito o reparto activo</span>
                  </div>
                </li>
              </ul>
            </div>
          </aside>

          {/* ========================================================
              PANEL DERECHO: CONSOLA DE RESULTADOS / BIENVENIDA
              ======================================================== */}
          <section className={styles.mainPanel} aria-label="Resultados y Diagnóstico de Auditoría">
            {/* ESTADO 1: INICIAL (SIN AUDITORÍA AÚN) */}
            {!auditData && !loadingAudit && (
              <div className={styles.welcomeWrap}>
                <div className={styles.welcomeHero}>
                  <div className={styles.welcomeHeroIcon}>
                    <ShieldCheck size={26} />
                  </div>
                  <div className={styles.welcomeHeroContent}>
                    <h2>Centro de Control y Auditoría de Guías Urbano</h2>
                    <p>
                      Comprueba en tiempo real la autenticidad de las entregas reportadas por transportistas y couriers.
                      Detecta desvíos, motivos de devolución y cobros indebidos cruzando directamente contra la API oficial
                      de Urbano Express.
                    </p>
                  </div>
                </div>

                {/* 3 Tarjetas de Capacidades */}
                <div className={styles.featureGrid}>
                  <div className={styles.featureCard}>
                    <div className={styles.featureCardHeader}>
                      <div className={`${styles.featureIconWrap} ${styles.iconAmber}`}>
                        <Clock size={16} />
                      </div>
                      <h4>Cálculo Real de Motivos</h4>
                    </div>
                    <p>
                      Descompone la fórmula oficial <code>dates.outForDelivery (N)</code> de Urbano. Si indica (3),
                      calcula automáticamente 3 salidas a ruta y 2 motivos previos antes de su entrega.
                    </p>
                  </div>

                  <div className={styles.featureCard}>
                    <div className={styles.featureCardHeader}>
                      <div className={`${styles.featureIconWrap} ${styles.iconRed}`}>
                        <AlertTriangle size={16} />
                      </div>
                      <h4>Blindaje contra Falsas Entregas</h4>
                    </div>
                    <p>
                      Identifica discrepancias críticas: paquetes que el transportista declara como cobrados/entregados pero
                      que en el sistema de Urbano figuran como <code>SE DEVOLVIO EL PRODUCTO</code> o en almacén.
                    </p>
                  </div>

                  <div className={styles.featureCard}>
                    <div className={styles.featureCardHeader}>
                      <div className={`${styles.featureIconWrap} ${styles.iconBlue}`}>
                        <ShieldAlert size={16} />
                      </div>
                      <h4>Evidencias y WhatsApp</h4>
                    </div>
                    <p>
                      Verifica la firma real del receptor, DNI consignado y cruza si el paquete tuvo aviso de salida a reparto
                      enviado al WhatsApp del cliente final.
                    </p>
                  </div>
                </div>

                {/* Banner Interactivo para Prueba Rápida */}
                <div className={styles.demoBanner}>
                  <div className={styles.demoBannerLeft}>
                    <div className={styles.demoBannerIcon}>
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <strong>¿Quieres probar la auditoría en tiempo real?</strong>
                      <span>
                        Carga un lote de demostración con 5 guías reales que contienen entregas directas, motivos y una falsa entrega detectada.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.btnDemoRun}
                    onClick={handleRunSampleAudit}
                    disabled={loadingSites || !siteId}
                  >
                    <Search size={14} />
                    Auditar Lote de Prueba
                  </button>
                </div>

                {/* Guía de Formatos Admitidos */}
                <div className={styles.formatSampleCard}>
                  <div className={styles.formatSampleHeader}>
                    <FileSpreadsheet size={15} color="#15803d" />
                    <span>Formatos directos compatibles desde Excel o Google Sheets</span>
                  </div>
                  <div className={styles.formatSampleContent}>
                    {`# Puedes copiar filas completas directamente desde tu Excel de liquidación:\nPALOMINO CUBA GARY, OXAPAMPA, 1148434, 2026-09-30, WYB473662620, ENTREGADO, 3.00\nPALOMINO CUBA GARY, SATIPO,    1144777, 2026-09-23, WYB465612843, ENTREGADO, 20.00\n\n# O simplemente una lista de códigos:\nWYB473662620\nWYB465612843\nWYB470704756`}
                  </div>
                </div>
              </div>
            )}

            {/* ESTADO 2: CARGANDO */}
            {loadingAudit && (
              <div className={styles.loadingContainer}>
                <div className={styles.loadingSpinnerWrap}>
                  <RefreshCw size={26} className={styles.spin} />
                </div>
                <h3 className={styles.loadingTitle}>Consultando API de Urbano Express SCM</h3>
                <p className={styles.loadingSub}>
                  Procesando {detectedGuideCount} guías en paralelo mediante workers concurrentes. Verificando firmas,
                  fechas de entrega, historial de ruta y avisos WhatsApp...
                </p>
                <div className={styles.loadingBarTrack}>
                  <div className={styles.loadingBarThumb} />
                </div>
              </div>
            )}

            {/* ESTADO 3: CON RESULTADOS */}
            {auditData && !loadingAudit && (
              <>
                {/* Métricas KPI Ejecutivas */}
                <div className={styles.metricsBar}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricTop}>
                      <span className={styles.metricLabel}>Total Auditadas</span>
                      <Package size={14} color="#64748b" />
                    </div>
                    <div className={styles.metricValueGroup}>
                      <span className={styles.metricNum}>{auditData.kpis.total}</span>
                      <span className={styles.metricPct} style={{ color: '#64748b' }}>
                        guías
                      </span>
                    </div>
                    <span className={styles.metricFoot}>
                      Declarado: <strong>S/ {auditData.kpis.totalDeclaredCost.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className={`${styles.metricCard} ${styles.metricClean}`}>
                    <div className={styles.metricTop}>
                      <span className={styles.metricLabel}>Entregas Limpias</span>
                      <CheckCircle2 size={14} color="#15803d" />
                    </div>
                    <div className={styles.metricValueGroup}>
                      <span className={styles.metricNum}>{auditData.kpis.cleanDeliveries}</span>
                      <span className={styles.metricPct}>({auditData.kpis.cleanDeliveriesPct}%)</span>
                    </div>
                    <span className={styles.metricFoot}>1er intento directo sin motivos</span>
                  </div>

                  <div className={`${styles.metricCard} ${styles.metricMotivated}`}>
                    <div className={styles.metricTop}>
                      <span className={styles.metricLabel}>Con Motivos</span>
                      <Clock size={14} color="#b45309" />
                    </div>
                    <div className={styles.metricValueGroup}>
                      <span className={styles.metricNum}>{auditData.kpis.motivatedDeliveries}</span>
                      <span className={styles.metricPct}>({auditData.kpis.motivatedDeliveriesPct}%)</span>
                    </div>
                    <span className={styles.metricFoot}>
                      {auditData.kpis.motives1Attempt} con 1 motivo · {auditData.kpis.motives2Attempts + auditData.kpis.motives3PlusAttempts} con 2+
                    </span>
                  </div>

                  <div className={`${styles.metricCard} ${styles.metricDiscrepancy}`}>
                    <div className={styles.metricTop}>
                      <span className={styles.metricLabel}>Discrepancias</span>
                      <AlertTriangle size={14} color="#b91c1c" />
                    </div>
                    <div className={styles.metricValueGroup}>
                      <span className={styles.metricNum}>{auditData.kpis.discrepancies}</span>
                      <span className={styles.metricPct}>({auditData.kpis.discrepanciesPct}%)</span>
                    </div>
                    <span className={styles.metricFoot} style={{ color: '#dc2626' }}>
                      Cobro en riesgo: <strong>S/ {auditData.kpis.discrepantDeclaredCost.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className={`${styles.metricCard} ${styles.metricManagement}`}>
                    <div className={styles.metricTop}>
                      <span className={styles.metricLabel}>En Gestión</span>
                      <Truck size={14} color="#1d4ed8" />
                    </div>
                    <div className={styles.metricValueGroup}>
                      <span className={styles.metricNum}>{auditData.kpis.inManagement}</span>
                      <span className={styles.metricPct}>({auditData.kpis.inManagementPct}%)</span>
                    </div>
                    <span className={styles.metricFoot}>En reparto o almacén</span>
                  </div>
                </div>

                {/* Toolbar: Pestañas de Filtro, Búsqueda y Exportación */}
                <div className={styles.resultsToolbar}>
                  <div className={styles.tabList} role="tablist">
                    <button
                      type="button"
                      className={`${styles.tabButton} ${activeTab === 'ALL' ? styles.tabActive : ''}`}
                      onClick={() => setActiveTab('ALL')}
                    >
                      Todas <span className={styles.tabCount}>{auditData.kpis.total}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabButton} ${activeTab === 'CLEAN' ? styles.tabActive : ''}`}
                      onClick={() => setActiveTab('CLEAN')}
                    >
                      Limpias <span className={styles.tabCount}>{auditData.kpis.cleanDeliveries}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabButton} ${activeTab === 'MOTIVATED' ? styles.tabActive : ''}`}
                      onClick={() => setActiveTab('MOTIVATED')}
                    >
                      Motivadas <span className={styles.tabCount}>{auditData.kpis.motivatedDeliveries}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabButton} ${activeTab === 'DISCREPANCY' ? styles.tabActive : ''}`}
                      onClick={() => setActiveTab('DISCREPANCY')}
                    >
                      Discrepancias{' '}
                      <span className={`${styles.tabCount} ${styles.tabCountDanger}`}>
                        {auditData.kpis.discrepancies}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.tabButton} ${activeTab === 'MANAGEMENT' ? styles.tabActive : ''}`}
                      onClick={() => setActiveTab('MANAGEMENT')}
                    >
                      En Gestión <span className={styles.tabCount}>{auditData.kpis.inManagement}</span>
                    </button>
                  </div>

                  <div className={styles.toolbarRight}>
                    <div className={styles.searchShell}>
                      <Search size={14} />
                      <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar guía, cliente, ruta..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      className={styles.btnExportExcel}
                      onClick={handleExportExcel}
                      disabled={exportingExcel || filteredRecords.length === 0}
                      title="Descargar reporte corporativo estilizado en Excel (.xlsx)"
                    >
                      <FileSpreadsheet size={14} />
                      {exportingExcel ? 'Generando...' : 'Exportar Excel'}
                    </button>

                    <button
                      type="button"
                      className={styles.btnExportCsv}
                      onClick={() => downloadAuditCsv(filteredRecords, `Auditoria_Urbano_${auditData.site.name}`)}
                      disabled={filteredRecords.length === 0}
                      title="Descargar datos en formato CSV estándar"
                    >
                      <Download size={13} />
                      CSV
                    </button>
                  </div>
                </div>

                {/* Tabla de Resultados */}
                <div className={styles.tableWrap}>
                  <table className={styles.auditTable}>
                    <thead>
                      <tr>
                        <th>Guía WYB</th>
                        <th>Declarado (Excel)</th>
                        <th>Estado Urbano Real</th>
                        <th>Salidas / Motivos</th>
                        <th>Recepción y Firma</th>
                        <th>WhatsApp MyG</th>
                        <th style={{ textAlign: 'center' }}>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} className={styles.emptyFilterState}>
                            No se encontraron guías en la vista actual o con el filtro aplicado.
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((item) => {
                          const isExpanded = expandedGuide === item.guide;
                          return (
                            <React.Fragment key={item.guide}>
                              <tr>
                                <td>
                                  <span className={styles.guideCode}>{item.guide}</span>
                                  {item.urbano?.tracking && (
                                    <span className={styles.guideTracking}>Urbano: {item.urbano.tracking}</span>
                                  )}
                                </td>

                                <td>
                                  <div className={styles.cellDeclared}>
                                    <span className={styles.declaredProvider} title={item.declared.provider || 'Sin transportista'}>
                                      {present(item.declared.provider)}
                                    </span>
                                    <span className={styles.declaredRoute}>
                                      {present(item.declared.route)} {item.declared.date ? `· ${item.declared.date}` : ''}
                                    </span>
                                    {item.declared.cost !== null && (
                                      <span className={styles.declaredCostBadge}>
                                        S/ {item.declared.cost.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
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
                                  <div className={styles.motivesPill}>
                                    <span className={styles.motivesPillMain}>
                                      {item.audit.attempts > 0 ? `${item.audit.attempts} salidas a ruta` : 'Sin salidas'}
                                    </span>
                                    <span className={styles.motivesSub}>
                                      {item.audit.motives === 0
                                        ? '0 motivos (Limpia)'
                                        : `${item.audit.motives} ${item.audit.motives === 1 ? 'motivo previo' : 'motivos previos'}`}
                                    </span>
                                  </div>
                                </td>

                                <td>
                                  <div className={styles.receptionCell}>
                                    <span className={styles.receptionName} title={item.audit.recipientSignature || item.urbano?.recipient || 'No registrado'}>
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
                                    title="Ver historial y evidencias"
                                  >
                                    <span>{isExpanded ? 'Ocultar' : 'Ver'}</span>
                                    <ChevronDown size={13} />
                                  </button>
                                </td>
                              </tr>

                              {/* Drawer de detalle expandible */}
                              {isExpanded && (
                                <tr className={styles.detailsRow}>
                                  <td colSpan={7}>
                                    <div className={styles.detailDrawer}>
                                      <div className={styles.detailDrawerHeader}>
                                        <div className={styles.detailDrawerHeaderLeft}>
                                          <strong>Detalle de Auditoría · {item.guide}</strong>
                                          <span>· {item.audit.summaryText}</span>
                                        </div>
                                        <div>{renderStatusPill(item)}</div>
                                      </div>

                                      <div className={styles.detailGrid}>
                                        <section className={styles.detailSection}>
                                          <h4>Evidencias de Entrega</h4>
                                          <dl className={styles.detailDl}>
                                            <div>
                                              <dt>Firmante</dt>
                                              <dd>{present(item.audit.recipientSignature)}</dd>
                                            </div>
                                            <div>
                                              <dt>DNI Receptor</dt>
                                              <dd>{present(item.audit.recipientDni)}</dd>
                                            </div>
                                            <div>
                                              <dt>Destinatario</dt>
                                              <dd>{present(item.urbano?.recipient)}</dd>
                                            </div>
                                            <div>
                                              <dt>Teléfono</dt>
                                              <dd>{present(item.urbano?.phone)}</dd>
                                            </div>
                                          </dl>
                                        </section>

                                        <section className={styles.detailSection}>
                                          <h4>Destino y Datos Operativos</h4>
                                          <dl className={styles.detailDl}>
                                            <div>
                                              <dt>Dirección</dt>
                                              <dd>{present(item.urbano?.address)}</dd>
                                            </div>
                                            <div>
                                              <dt>Localidad</dt>
                                              <dd>{present(item.urbano?.destination)}</dd>
                                            </div>
                                            <div>
                                              <dt>Remitente</dt>
                                              <dd>{present(item.urbano?.sender)}</dd>
                                            </div>
                                            <div>
                                              <dt>Obs. Urbano</dt>
                                              <dd>{present(item.urbano?.statusDetail)}</dd>
                                            </div>
                                          </dl>
                                        </section>

                                        <section className={styles.detailSection}>
                                          <h4>Aviso WhatsApp & Notificación</h4>
                                          <dl className={styles.detailDl}>
                                            <div>
                                              <dt>Estado Aviso</dt>
                                              <dd>{item.localNotice ? item.localNotice.estadoAviso : 'No registrado'}</dd>
                                            </div>
                                            <div>
                                              <dt>Fecha Envío</dt>
                                              <dd>{item.localNotice ? item.localNotice.fechaEnvio || 'En cola' : '—'}</dd>
                                            </div>
                                            <div>
                                              <dt>Teléfono Notificado</dt>
                                              <dd>{item.localNotice ? item.localNotice.telefono : '—'}</dd>
                                            </div>
                                            <div>
                                              <dt>Costo Liquidado</dt>
                                              <dd>{item.declared.cost !== null ? `S/ ${item.declared.cost.toFixed(2)}` : '—'}</dd>
                                            </div>
                                          </dl>
                                        </section>
                                      </div>

                                      {/* Timeline de ciclo de vida Urbano */}
                                      {item.urbano && (
                                        <div className={styles.detailTimeline}>
                                          <div className={styles.timelineItem}>
                                            <small>Admisión</small>
                                            <strong>{present(item.urbano.dates.admitted)}</strong>
                                          </div>
                                          <div className={styles.timelineItem}>
                                            <small>Despachado</small>
                                            <strong>{present(item.urbano.dates.dispatched)}</strong>
                                          </div>
                                          <div className={styles.timelineItem}>
                                            <small>Salida a Ruta</small>
                                            <strong>{present(item.urbano.dates.outForDelivery)}</strong>
                                          </div>
                                          <div className={styles.timelineItem}>
                                            <small>Est. Entrega</small>
                                            <strong>{present(item.urbano.estimatedDeliveryDate)}</strong>
                                          </div>
                                          <div className={styles.timelineItem}>
                                            <small>Reg. Urbano</small>
                                            <strong>{present(item.urbano.registeredAt)}</strong>
                                          </div>
                                        </div>
                                      )}
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
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

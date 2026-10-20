import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FileSearch,
  Package,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';

import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { useAuth } from '../../../core/auth/authState';
import { showToast } from '../../../core/utils/toast';
import { downloadAuditCsv } from './exportExcel';
import type { GuideAuditBatchResponse, UrbanoAuditSite } from './types';
import { urbanoGuideAuditService } from './urbanoGuideAudit.service';
import styles from './UrbanoGuideAudit.module.css';

const SAMPLE_EXCEL_PASTE = `PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1148434,2026-09-30,Urbanas,OXAPAMPA,1306 - MARY KAY PERU S.R.L.,WYB473662620,ENTREGADO,,0.39,0.39,0.39,0,3,3,0,0,3,4,2026-09-28,2026-09-29,2026-09-30,12:36,0.39,0.99,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,Agencia Satipo,8495-3W,Distribución,1144777,2026-09-23,Urbanas,SAN MARTIN DE PORRES,5125 - MERCADO LIBRE,WYB465612843,ENTREGADO,,45,45,30,15,20,20,0,0,20,0,2026-08-04,2026-08-04,2026-08-27,01:44,45,43.2,10476022211,,,,,,,20
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1142537,2026-09-18,Urbanas,SATIPO,5125 - MERCADO LIBRE,WYB470704756,ENTREGADO,,0.31,0.31,0.31,0,3,3,0,0,3,9,2026-09-09,2026-09-10,2026-09-11,12:12,0.31,0.6,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1136257,2026-09-07,Urbanas,OXAPAMPA,5125 - MERCADO LIBRE,WYB470292172,ENTREGADO,,0.09,0.09,0.09,0,3,3,0,0,3,8,2026-09-04,2026-09-05,2026-09-07,12:24,0.09,0.6,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1137305,2026-09-08,Urbanas,OXAPAMPA,5125 - MERCADO LIBRE,WYB469955370,ENTREGADO,,0.13,0.13,0.13,0,3,3,0,0,3,5,2026-09-03,2026-09-04,2026-09-05,16:35,0.13,0.6,10476022211,,,,,,,3`;

type TabKey = 'ALL' | 'CLEAN' | 'MOTIVATED' | 'DISCREPANCY' | 'MANAGEMENT' | 'NOT_FOUND';

export const UrbanoGuideAudit: React.FC = () => {
  const { user } = useAuth();
  const [sites, setSites] = useState<UrbanoAuditSite[]>([]);
  const [siteId, setSiteId] = useState<string>('');
  const [inputText, setInputText] = useState<string>('');
  const [loadingSites, setLoadingSites] = useState<boolean>(true);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [auditData, setAuditData] = useState<GuideAuditBatchResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const auditAbort = useRef<AbortController | null>(null);

  // Cargar sedes autorizadas con credenciales Urbano
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
          showToast(getApiErrorMessage(err, 'No se pudieron cargar las sedes disponibles.'), 'error');
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

  // Contador de guías detectadas en vivo en el textarea
  const detectedGuideCount = useMemo(() => {
    if (!inputText.trim()) return 0;
    const matches = inputText.match(/\b(?:WYB|ENU)\d{6,20}\b/gi) || [];
    return new Set(matches.map((m) => m.toUpperCase())).size;
  }, [inputText]);

  // Ejecutar auditoría
  const handleRunAudit = async () => {
    if (!siteId) {
      showToast('Selecciona una sede con credenciales Urbano activas.', 'error');
      return;
    }
    if (!inputText.trim() || detectedGuideCount === 0) {
      showToast('Pega al menos una guía válida (WYB... o ENU...).', 'error');
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
      showToast(`Auditoría completada: ${response.records.length} guías procesadas en Urbano.`, 'success');
    } catch (err: any) {
      if (!controller.signal.aborted) {
        showToast(getApiErrorMessage(err, 'No se pudo procesar la auditoría de guías en Urbano.'), 'error');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingAudit(false);
      }
    }
  };

  // Filtrado de la tabla según pestaña activa y búsqueda por texto
  const filteredRecords = useMemo(() => {
    if (!auditData?.records) return [];

    let list = auditData.records;

    // Filtro por pestaña
    if (activeTab === 'CLEAN') {
      list = list.filter((r) => r.audit.classification === 'ENTREGA_DIRECTA');
    } else if (activeTab === 'MOTIVATED') {
      list = list.filter((r) => r.audit.classification === 'ENTREGA_CON_MOTIVOS');
    } else if (activeTab === 'DISCREPANCY') {
      list = list.filter((r) => r.audit.classification === 'DISCREPANCIA_NO_ENTREGADO');
    } else if (activeTab === 'MANAGEMENT') {
      list = list.filter((r) => r.audit.classification === 'EN_GESTION');
    } else if (activeTab === 'NOT_FOUND') {
      list = list.filter((r) => r.audit.classification === 'NO_ENCONTRADO');
    }

    // Búsqueda en texto
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.guide.toLowerCase().includes(q) ||
          r.declared.provider?.toLowerCase().includes(q) ||
          r.declared.route?.toLowerCase().includes(q) ||
          r.urbano?.recipient.toLowerCase().includes(q) ||
          r.urbano?.phone.includes(q) ||
          r.audit.recipientSignature?.toLowerCase().includes(q) ||
          r.audit.recipientDni?.includes(q) ||
          r.urbano?.status.toLowerCase().includes(q),
      );
    }

    return list;
  }, [auditData, activeTab, searchQuery]);

  const toggleExpand = (guide: string) => {
    setExpandedGuide((prev) => (prev === guide ? null : guide));
  };

  return (
    <div className={styles.container}>
      <PageHeader
        icon={<ClipboardCheck />}
        title="Auditoría de Guías WYB"
        subtitle="Auditoría en tiempo real de motivos, re-salidas a ruta y entregas reales en Urbano"
        metadata={
          <>
            <span>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className={styles.headerRole}>
              <i />
              {user?.rol || 'Administrador'}
            </span>
          </>
        }
      />

      {/* Input Panel */}
      <section className={styles.card} aria-label="Entrada de Guías a Auditar">
        <div className={styles.inputHeader}>
          <div className={styles.inputTitleGroup}>
            <div className={styles.iconWrap}>
              <FileSearch size={22} />
            </div>
            <div>
              <h2 className={styles.title}>Pegar Liquidación o Lista de Guías WYB</h2>
              <p className={styles.subtitle}>
                Copia directamente las filas de tu Excel (con transportista, ruta y costo) o pega códigos de guía.
              </p>
            </div>
          </div>

          <div className={styles.controlsGroup}>
            <label htmlFor="audit-site-select" className="sr-only">
              Sede Operativa
            </label>
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

        <div className={styles.textareaWrap}>
          <textarea
            className={styles.textarea}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loadingAudit}
            placeholder="Pega aquí la tabla de Excel o lista de guías WYB...&#10;Ejemplo:&#10;PALOMINO CUBA GARY, OXAPAMPA, 1148434, 2026-09-30, WYB473662620, ENTREGADO, 3.00&#10;PALOMINO CUBA GARY, SATIPO, 1144777, 2026-09-23, WYB465612843, ENTREGADO, 20.00"
            rows={5}
          />
        </div>

        <div className={styles.inputFooter}>
          <div className={styles.guideCounter}>
            <span>Guías únicas detectadas:</span>
            <span className={styles.guideBadge}>{detectedGuideCount} guías</span>
          </div>

          <div className={styles.actionsGroup}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setInputText(SAMPLE_EXCEL_PASTE)}
              disabled={loadingAudit}
              title="Cargar filas de ejemplo de transportista para probar"
            >
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
            >
              Limpiar
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleRunAudit}
              disabled={loadingAudit || detectedGuideCount === 0 || !siteId}
            >
              {loadingAudit ? (
                <>
                  <RefreshCw size={16} className={styles.spinner} />
                  Auditando en Urbano...
                </>
              ) : (
                <>
                  <ClipboardCheck size={16} />
                  Auditar {detectedGuideCount > 0 ? `${detectedGuideCount} Guías` : 'en Urbano'}
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* KPI Cards Dashboard */}
      {auditData && (
        <section className={styles.kpiGrid} aria-label="Resumen de Auditoría">
          <div className={`${styles.kpiCard} ${styles.kpiTotal}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Total Auditadas</span>
              <Package size={18} color="#64748b" />
            </div>
            <div className={styles.kpiValueGroup}>
              <span className={styles.kpiValue}>{auditData.kpis.total}</span>
              <span className={styles.kpiSub}>guías procesadas</span>
            </div>
            <span className={styles.kpiSub}>
              Costo declarado: <strong>S/ {auditData.kpis.totalDeclaredCost.toFixed(2)}</strong>
            </span>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiClean}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Entregas Limpias (0 Motivos)</span>
              <CheckCircle2 size={18} color="#10b981" />
            </div>
            <div className={styles.kpiValueGroup}>
              <span className={styles.kpiValue}>{auditData.kpis.cleanDeliveries}</span>
              <span className={styles.kpiPct}>({auditData.kpis.cleanDeliveriesPct}%)</span>
            </div>
            <span className={styles.kpiSub}>Entregadas en primera salida a ruta</span>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiMotivated}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Motivadas (Re-salidas)</span>
              <Clock size={18} color="#f59e0b" />
            </div>
            <div className={styles.kpiValueGroup}>
              <span className={styles.kpiValue}>{auditData.kpis.motivatedDeliveries}</span>
              <span className={styles.kpiPct}>({auditData.kpis.motivatedDeliveriesPct}%)</span>
            </div>
            <span className={styles.kpiSub}>
              {auditData.kpis.motives1Attempt} con 1 motivo · {auditData.kpis.motives2Attempts + auditData.kpis.motives3PlusAttempts} con 2+ motivos
            </span>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiDiscrepancy}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Discrepancias (Falsas Entregas)</span>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <div className={styles.kpiValueGroup}>
              <span className={styles.kpiValue}>{auditData.kpis.discrepancies}</span>
              <span className={styles.kpiPct}>({auditData.kpis.discrepanciesPct}%)</span>
            </div>
            <span className={styles.kpiSub}>
              Cobro en riesgo: <strong style={{ color: '#dc2626' }}>S/ {auditData.kpis.discrepantDeclaredCost.toFixed(2)}</strong>
            </span>
          </div>

          <div className={`${styles.kpiCard} ${styles.kpiManagement}`}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>En Gestión / Tránsito</span>
              <Truck size={18} color="#3b82f6" />
            </div>
            <div className={styles.kpiValueGroup}>
              <span className={styles.kpiValue}>{auditData.kpis.inManagement}</span>
              <span className={styles.kpiPct}>({auditData.kpis.inManagementPct}%)</span>
            </div>
            <span className={styles.kpiSub}>En reparto o no encontradas ({auditData.kpis.notFound})</span>
          </div>
        </section>
      )}

      {/* Toolbar & Tabs */}
      {auditData && (
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'ALL' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('ALL')}
            >
              Todas <span className={styles.tabBadge}>{auditData.kpis.total}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'CLEAN' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('CLEAN')}
            >
              Entregas Limpias <span className={styles.tabBadge}>{auditData.kpis.cleanDeliveries}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'MOTIVATED' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('MOTIVATED')}
            >
              Motivadas (Re-salidas) <span className={styles.tabBadge}>{auditData.kpis.motivatedDeliveries}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'DISCREPANCY' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('DISCREPANCY')}
            >
              Discrepancias <span className={`${styles.tabBadge} ${styles.tabBadgeDanger}`}>{auditData.kpis.discrepancies}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'MANAGEMENT' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('MANAGEMENT')}
            >
              En Gestión <span className={styles.tabBadge}>{auditData.kpis.inManagement}</span>
            </button>
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.searchInputWrap}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por guía, cliente, transportista..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => downloadAuditCsv(filteredRecords, `Auditoria_Urbano_${auditData.site.name}`)}
              title="Descargar reporte completo en Excel / CSV"
            >
              <Download size={15} />
              Exportar CSV
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      {auditData && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Guía WYB</th>
                <th>Transportista / Ruta</th>
                <th>Estado Excel</th>
                <th>Estado Real Urbano</th>
                <th>Salidas / Motivos</th>
                <th>Receptor en Urbano</th>
                <th>Diagnóstico Auditoría</th>
                <th style={{ textAlign: 'center' }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    No hay guías que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item, index) => {
                  const isExpanded = expandedGuide === item.guide;
                  const isDiscrepancy = item.audit.isDiscrepancy;

                  return (
                    <React.Fragment key={item.guide}>
                      <tr className={`${styles.row} ${isDiscrepancy ? styles.rowDiscrepancy : ''}`}>
                        <td style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{index + 1}</td>
                        <td className={styles.guideCell}>{item.guide}</td>
                        <td>
                          <div className={styles.providerCell}>
                            <span className={styles.providerName}>{item.declared.provider || '—'}</span>
                            <span className={styles.routeSub}>
                              {item.declared.route ? `Ruta ${item.declared.route}` : ''}
                              {item.declared.date ? ` · ${item.declared.date}` : ''}
                              {item.declared.cost !== null ? ` · S/ ${item.declared.cost.toFixed(2)}` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.chipNeutral}>{item.declared.status || '—'}</span>
                        </td>
                        <td>
                          {item.found ? (
                            <span
                              className={`${styles.chip} ${
                                isDiscrepancy
                                  ? styles.chipDanger
                                  : item.audit.classification === 'ENTREGA_DIRECTA'
                                  ? styles.chipSuccess
                                  : item.audit.classification === 'ENTREGA_CON_MOTIVOS'
                                  ? styles.chipWarning
                                  : styles.chipInfo
                              }`}
                            >
                              {item.urbano?.status}
                            </span>
                          ) : (
                            <span className={`${styles.chip} ${styles.chipDanger}`}>NO ENCONTRADA</span>
                          )}
                        </td>
                        <td>
                          {item.found ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span
                                className={`${styles.attemptsBadge} ${
                                  item.audit.attempts === 1
                                    ? styles.attempts1
                                    : item.audit.attempts === 2
                                    ? styles.attempts2
                                    : styles.attempts3Plus
                                }`}
                                title={`${item.audit.attempts} salida(s) a reparto`}
                              >
                                {item.audit.attempts}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: item.audit.motives > 0 ? '#b45309' : '#64748b' }}>
                                {item.audit.motives === 0 ? '0 motivos' : `${item.audit.motives} motivo(s)`}
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {item.audit.recipientSignature ? (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>{item.audit.recipientSignature}</span>
                              {item.audit.recipientDni && (
                                <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>DNI: {item.audit.recipientDni}</span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: isDiscrepancy
                                ? '#dc2626'
                                : item.audit.classification === 'ENTREGA_DIRECTA'
                                ? '#15803d'
                                : item.audit.classification === 'ENTREGA_CON_MOTIVOS'
                                ? '#b45309'
                                : '#475569',
                            }}
                          >
                            {item.audit.summaryText}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            style={{ padding: '0.25rem 0.5rem' }}
                            onClick={() => toggleExpand(item.guide)}
                            aria-expanded={isExpanded}
                            title="Ver ficha completa"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row Drawer */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className={styles.expandedRow}>
                            <div className={styles.detailGrid}>
                              <div className={styles.detailSection}>
                                <span className={styles.detailSectionTitle}>Destinatario y Entrega</span>
                                <span className={styles.detailText}>
                                  <strong>Consignado:</strong> {item.urbano?.recipient || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Teléfono:</strong> {item.urbano?.phone || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Dirección:</strong> {item.urbano?.address || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Destino / Localidad:</strong> {item.urbano?.destination || '—'}
                                </span>
                              </div>

                              <div className={styles.detailSection}>
                                <span className={styles.detailSectionTitle}>Datos del Envío</span>
                                <span className={styles.detailText}>
                                  <strong>Remitente / Shipper:</strong> {item.urbano?.sender || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Servicio / Contrato:</strong> {item.urbano?.service || item.urbano?.contract || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Tracking Marketplace:</strong> {item.urbano?.tracking || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Peso y Piezas:</strong> {item.urbano?.weightKg ? `${item.urbano.weightKg} kg` : '—'} · {item.urbano?.pieces || 1} bulto(s)
                                </span>
                              </div>

                              <div className={styles.detailSection}>
                                <span className={styles.detailSectionTitle}>Hitos de Tiempo Urbano</span>
                                <span className={styles.detailText}>
                                  <strong>Salida a Reparto:</strong> {item.urbano?.dates.outForDelivery || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Fecha Estimada:</strong> {item.urbano?.estimatedDeliveryDate || '—'}
                                </span>
                                <span className={styles.detailText}>
                                  <strong>Aviso WhatsApp MyG:</strong>{' '}
                                  {item.localNotice ? (
                                    <span className={styles.chipSuccess}>
                                      {item.localNotice.estadoAviso} ({item.localNotice.fechaEnvio || 'En cola'})
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>Sin aviso local</span>
                                  )}
                                </span>

                                <div className={styles.timeline}>
                                  <div className={styles.timelineNode}>
                                    <span>Admisión</span>
                                    <strong>{item.urbano?.dates.admitted || '—'}</strong>
                                  </div>
                                  <ArrowRight size={12} className={styles.timelineArrow} />
                                  <div className={styles.timelineNode}>
                                    <span>Despacho</span>
                                    <strong>{item.urbano?.dates.dispatched || '—'}</strong>
                                  </div>
                                  <ArrowRight size={12} className={styles.timelineArrow} />
                                  <div className={styles.timelineNode}>
                                    <span>Reparto ({item.audit.attempts})</span>
                                    <strong>{item.urbano?.dates.outForDelivery || '—'}</strong>
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
      )}
    </div>
  );
};
export default UrbanoGuideAudit;

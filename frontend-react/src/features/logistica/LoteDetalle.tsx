// ============================================================
// frontend-react/src/features/logistica/LoteDetalle.tsx
// Módulo de Detalle de Ruta (Importación Excel, Envíos y Colas)
// Replicación exacta del diseño original de rutas-detalle.html
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import '../../css/rutas-detalle.css';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { showToast, showConfirm } from '../../core/utils/toast';
import { getApiErrorMessage } from '../../core/api/errors';
import { routeDetailService } from './route-detail/route-detail.service';
import {
  calculateRouteStats,
  formatDateOnly,
  formatDateTime,
  formatEstadoLabel,
  getBadgeClass,
  getBadgeLabel,
  normalizeAvisoVisualStatus,
  readQueueControl,
} from './route-detail/domain';
import type {
  ImportedNotice,
  NoticeItem,
  RawTemplateItem,
  RouteDetail,
  SessionItem,
  TemplateInput,
  TemplateItem,
} from './route-detail/types';

export const LoteDetalle: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const rutaId = Number(id);

  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Modales
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showTemplateEditorModal, setShowTemplateEditorModal] = useState(false);
  const [showConfirmSendModal, setShowConfirmSendModal] = useState(false);
  
  // Nuevo aviso manual
  const [newNoticeName, setNewNoticeName] = useState('');
  const [newNoticePhone, setNewNoticePhone] = useState('');
  const [newNoticeCode, setNewNoticeCode] = useState('');
  const [newNoticeCustomMessage, setNewNoticeCustomMessage] = useState('');

  // Editor de Plantillas
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
  const [templateFormName, setTemplateFormName] = useState('');
  const [templateFormBody, setTemplateFormBody] = useState('');
  const [templateFormImage, setTemplateFormImage] = useState<File | null>(null);
  const [templateFormImageName, setTemplateFormImageName] = useState('');
  const [templateFormImageBase64, setTemplateFormImageBase64] = useState<string | null>(null);
  const [templateImageBorrar, setTemplateImageBorrar] = useState(false);

  // Carga de Excel
  const [importStatus, setImportStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' });
  const [importFileName, setImportFileName] = useState('Ningún archivo seleccionado');

  // Envío de Cola (WhatsApp Composer)
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [showControlModal, setShowControlModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customMessage] = useState('');
  const [sendingAction, setSendingAction] = useState(false);
  const [previewImageError, setPreviewImageError] = useState(false);

  const formatTemplatesList = useCallback((rawList: RawTemplateItem[]): TemplateItem[] => {
    return rawList.map((tpl) => ({
      id: tpl.id,
      nombre: tpl.nombre,
      cuerpo: tpl.mensaje || tpl.contenido || '',
      adjunto_url: tpl.imagen_path || tpl.adjunto_url || ''
    }));
  }, []);

  const resolveTemplateImageUrl = (url?: string): string => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    let cleaned = url;
    if (cleaned.startsWith('storage/')) {
      cleaned = `/${cleaned}`;
    } else if (!cleaned.startsWith('/')) {
      cleaned = `/storage/${cleaned}`;
    }
    return cleaned;
  };

  const sampleContact = useMemo(() => {
    const firstNotice = notices[0];
    if (firstNotice) {
      return {
        nombre: firstNotice.nombre || 'MyG Express',
        codigo_paquete: firstNotice.codigo_paquete || '',
        telefono: firstNotice.telefono || ''
      };
    }
    return {
      nombre: 'andysmar Teran',
      codigo_paquete: 'WYB458273421',
      telefono: '933013655'
    };
  }, [notices]);

  const mockTime = useMemo(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, []);

  const formatPreviewMessage = (text: string) => {
    if (!text) return null;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    return (
      <div className="wa-msg-preview wa-msg-plain">
        {lines.map((line, idx) => {
          const parts = line.split(/\*(.*?)\*/g);
          return (
            <div key={idx} className="wa-msg-line">
              {parts.map((part, pIdx) => {
                return pIdx % 2 === 1 ? <strong key={pIdx}>{part}</strong> : part;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Cargar datos del lote
  const loadRouteDetails = useCallback(async () => {
    try {
      const routeData = await routeDetailService.getRoute(rutaId);
      setRoute(routeData);
      const routeSedeId = routeData?.sede_id;

      const [noticeItems, sessionItems, templateResult] = await Promise.all([
        routeDetailService.listNotices(rutaId),
        routeDetailService.listSessions(routeSedeId),
        routeDetailService.listTemplates(routeSedeId),
      ]);

      setNotices(noticeItems);
      setSessions(sessionItems);
      const activeSession = sessionItems.find((session) => session.estado_real === 'connected') ?? sessionItems[0];
      if (activeSession) setSelectedSessionId(String(activeSession.id));

      const list = formatTemplatesList(templateResult.items);
      setTemplates(list);
      const initialTemplateId = templateResult.defaultId ?? list[0]?.id;
      if (initialTemplateId) {
        setSelectedTemplateId(String(initialTemplateId));
      }
    } catch (e) {
      console.error('Error al cargar detalle de lote:', e);
      showToast(getApiErrorMessage(e, 'No se pudo cargar el detalle de la ruta.'), 'error', { title: 'Error de carga' });
    } finally {
      setLoading(false);
    }
  }, [rutaId, formatTemplatesList]);

  useEffect(() => {
    void loadRouteDetails();
  }, [loadRouteDetails]);

  useEffect(() => {
    setPreviewImageError(false);
  }, [selectedTemplateId]);

  // Polling dinámico en segundo plano para actualizar estados (Avisos y Sesiones)
  useEffect(() => {
    if (!rutaId) return;

    // Poller de estado de avisos (cada 15 segundos)
    const noticesInterval = setInterval(async () => {
      // Solo consultar si el documento está visible para ahorrar recursos
      if (document.visibilityState !== 'visible') return;

      // Verificar si hay avisos en estado pendiente o procesando
      const hasPendingOrProcessing = notices.some((item) =>
        ['pendiente', 'processing', 'procesando'].includes(String(item.estado_aviso || '').toLowerCase())
      );

      if (hasPendingOrProcessing) {
        try {
          const [noticeItems, routeData] = await Promise.all([
            routeDetailService.listNotices(rutaId),
            routeDetailService.getRoute(rutaId),
          ]);
          setNotices(noticeItems);
          setRoute(routeData);
        } catch (err) {
          console.error('Error in background notices polling:', err);
        }
      }
    }, 15000);

    // Poller de estado de sesiones (cada 45 segundos)
    const sessionsInterval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const routeSedeId = route?.sede_id;
        setSessions(await routeDetailService.listSessions(routeSedeId));
      } catch (err) {
        console.error('Error in background sessions polling:', err);
      }
    }, 45000);

    return () => {
      clearInterval(noticesInterval);
      clearInterval(sessionsInterval);
    };
  }, [rutaId, notices, route?.sede_id]);

  const getPaginationMetaText = () => {
    const totalAll = notices.length;
    const visibleCount = filteredNotices.length;
    if (totalAll === 0) {
      return 'Sin destinatarios para mostrar';
    }
    const hasSearch = String(searchQuery || '').trim().length > 0;
    const hasFilter = filterStatus !== 'todos';
    const isFiltered = hasSearch || hasFilter;
    return isFiltered
      ? `Mostrando ${visibleCount} de ${totalAll} destinatarios`
      : `Mostrando ${visibleCount} destinatarios`;
  };

  const seleccionarPlantillaComoDefault = async (plantillaId: string) => {
    if (!plantillaId || selectedTemplateId === plantillaId) return;
    const prevSelected = selectedTemplateId;
    setSelectedTemplateId(plantillaId);
    try {
      await routeDetailService.setDefaultTemplate(Number(plantillaId), route?.sede_id);
    } catch (e) {
      console.error('Error al establecer plantilla default:', e);
      setSelectedTemplateId(prevSelected);
    }
  };

  // Controles de cola de envíos
  const queueControl = useMemo(() => readQueueControl(route), [route]);

  // Estadísticas del Lote
  const stats = useMemo(() => calculateRouteStats(notices), [notices]);

  // Previsualización de mensaje en el mockup de WhatsApp
  const messagePreview = useMemo(() => {
    const selectedTpl = templates.find(t => String(t.id) === selectedTemplateId);
    if (!selectedTpl) return customMessage;
    
    let body = selectedTpl.cuerpo || '';
    body = body.replace(/{nombre}/gi, sampleContact.nombre);
    body = body.replace(/{codigo_paquete}/gi, sampleContact.codigo_paquete);
    body = body.replace(/{codigo}/gi, sampleContact.codigo_paquete);
    body = body.replace(/{telefono}/gi, sampleContact.telefono);
    return body;
  }, [selectedTemplateId, templates, customMessage, sampleContact]);

  const activeTemplate = useMemo(() => {
    return templates.find(t => String(t.id) === selectedTemplateId) || null;
  }, [selectedTemplateId, templates]);

  const activeSession = useMemo(() => {
    return sessions.find(s => String(s.id) === selectedSessionId) || null;
  }, [selectedSessionId, sessions]);

  // Iniciar envío masivo
  const handleStartSending = async () => {
    if (!selectedSessionId) {
      showToast('Selecciona una sesión de WhatsApp antes de iniciar.', 'warning', { title: 'Sesión requerida' });
      return;
    }
    if (!selectedTemplateId) {
      showToast('Selecciona una plantilla antes de iniciar.', 'warning', { title: 'Plantilla requerida' });
      return;
    }
    if (stats.pendientes === 0) {
      showToast('No hay mensajes pendientes por enviar.', 'info', { title: 'Sin mensajes' });
      return;
    }

    setSendingAction(true);
    setShowConfirmSendModal(false);
    try {
      await routeDetailService.sendRoute({
        routeId: rutaId,
        sessionId: Number(selectedSessionId),
        templateId: Number(selectedTemplateId),
        customMessage,
      });
      await loadRouteDetails();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al encolar los envíos.'), 'error', { title: 'Error de envío' });
    } finally {
      setSendingAction(false);
    }
  };

  // Control de flujo de cola
  const handleQueueControl = async (action: 'pausar' | 'reanudar' | 'manual' | 'cancelar') => {
    setSendingAction(true);
    try {
      const result = await routeDetailService.controlQueue(rutaId, action, Number(selectedSessionId) || undefined);
      showToast(result.message || 'Acción ejecutada con éxito', 'success', { title: 'Cola actualizada' });
      await loadRouteDetails();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al ejecutar control de cola'), 'error', { title: 'Error de control' });
    } finally {
      setSendingAction(false);
    }
  };

  // Crear destinatario manual
  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeName || !newNoticePhone || !newNoticeCode) return;

    try {
      await routeDetailService.createNotice({
        routeId: rutaId,
        name: newNoticeName,
        phone: newNoticePhone,
        packageCode: newNoticeCode,
        customMessage: newNoticeCustomMessage,
        origin: route?.origen || 'MyG Express',
      });
      setShowCreateModal(false);
      setNewNoticeName('');
      setNewNoticePhone('');
      setNewNoticeCode('');
      setNewNoticeCustomMessage('');
      showToast('Destinatario agregado correctamente.', 'success', { title: 'Destinatario creado' });
      await loadRouteDetails();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al crear destinatario'), 'error', { title: 'Error al agregar' });
    }
  };

  // Eliminar destinatario
  const handleDeleteNotice = async (noticeId: number) => {
    const confirmed = await showConfirm({
      title: '¿Eliminar destinatario?',
      message: '¿Eliminar este destinatario de la ruta?',
      type: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    try {
      await routeDetailService.deleteNotice(noticeId);
      showToast('Destinatario eliminado correctamente.', 'success', { title: 'Eliminado' });
      await loadRouteDetails();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'No se pudo eliminar el destinatario.'), 'error', { title: 'Error' });
    }
  };

  // Vaciar lote
  const handleClearRoute = async () => {
    const confirmed = await showConfirm({
      title: '¿Vaciar ruta?',
      message: 'Se eliminarán TODOS los destinatarios de esta ruta permanentemente. ¿Deseas continuar?',
      type: 'danger',
      confirmText: 'Vaciar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    try {
      await routeDetailService.clearNotices(rutaId);
      showToast('Ruta vaciada correctamente.', 'success', { title: 'Lote vaciado' });
      await loadRouteDetails();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al vaciar la ruta.'), 'error', { title: 'Error' });
    }
  };

  // Cargar archivo Excel
  const handleFileUpload = async (file: File) => {
    setImportStatus({ type: 'loading', msg: 'Analizando y validando estructura del Excel...' });
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error('El archivo Excel no contiene hojas.');
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) throw new Error('No se pudo leer la primera hoja del Excel.');
          const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

          if (!jsonRows.length) {
            setImportStatus({ type: 'error', msg: 'El Excel está vacío o no contiene filas.' });
            return;
          }

          const normalizedRows: ImportedNotice[] = jsonRows.map((row) => {
            const getCol = (aliases: string[]) => {
              const key = Object.keys(row).find(k => 
                aliases.some(alias => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(alias))
              );
              return key ? String(row[key]).trim() : '';
            };

            return {
              nombre: getCol(['nombre', 'destinatario', 'name']),
              telefono: getCol(['telefono', 'celular', 'cel', 'phone', 'numero']),
              codigo_paquete: getCol(['codigo', 'code', 'cod', 'paquete', 'paq']),
              empresa_origen: route?.origen || 'MyG Express'
            };
          }).filter(r => r.nombre || r.telefono);

          if (!normalizedRows.length) {
            setImportStatus({ type: 'error', msg: 'No se encontraron las columnas requeridas (Nombre, Código, Teléfono).' });
            return;
          }

          const imported = await routeDetailService.importNotices(rutaId, normalizedRows);
          setImportStatus({
            type: 'success',
            msg: `${imported} destinatarios importados correctamente.`,
          });
          await loadRouteDetails();
          setTimeout(() => {
            setShowImportModal(false);
            setImportStatus({ type: 'idle', msg: '' });
          }, 2000);
        } catch (err: unknown) {
          setImportStatus({ type: 'error', msg: getApiErrorMessage(err, 'Error al procesar el archivo Excel.') });
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: unknown) {
      setImportStatus({ type: 'error', msg: getApiErrorMessage(err, 'Error al abrir el archivo.') });
    }
  };

  // Crear/Editar Plantilla
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFormName || !templateFormBody) return;

    try {
      const payload: TemplateInput = {
        nombre: templateFormName,
        mensaje: templateFormBody
      };

      if (templateFormImageBase64) {
        payload.imagen_base64 = templateFormImageBase64;
        payload.imagen_nombre = templateFormImageName;
      } else if (templateImageBorrar) {
        payload.imagen_borrar = true;
      }

      if (route?.sede_id) {
        payload.sede_id = route.sede_id;
      }

      await routeDetailService.saveTemplate(editingTemplate?.id ?? null, payload);
      setShowTemplateEditorModal(false);
      setTemplateFormName('');
      setTemplateFormBody('');
      setTemplateFormImage(null);
      setTemplateFormImageName('');
      setTemplateFormImageBase64(null);
      setTemplateImageBorrar(false);
      setEditingTemplate(null);
      showToast('Plantilla guardada correctamente.', 'success', { title: 'Plantilla guardada' });

      const templateResult = await routeDetailService.listTemplates(route?.sede_id);
      setTemplates(formatTemplatesList(templateResult.items));
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al guardar la plantilla'), 'error', { title: 'Error' });
    }
  };

  // Eliminar Plantilla
  const handleDeleteTemplate = async (id: number) => {
    const confirmed = await showConfirm({
      title: '¿Eliminar plantilla?',
      message: '¿Está seguro de eliminar esta plantilla?',
      type: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    try {
      await routeDetailService.deleteTemplate(id, route?.sede_id);
      showToast('Plantilla eliminada correctamente.', 'success', { title: 'Eliminado' });
      const templateResult = await routeDetailService.listTemplates(route?.sede_id);
      setTemplates(formatTemplatesList(templateResult.items));
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al eliminar plantilla'), 'error', { title: 'Error' });
    }
  };

  // Exportar Destinatarios a Excel
  const handleExportAvisos = () => {
    if (notices.length === 0) {
      showToast('No hay registros para exportar', 'warning', { title: 'Sin registros' });
      return;
    }
    const dataToExport = notices.map((n, i) => ({
      'N°': i + 1,
      'Nombre': n.nombre,
      'Teléfono': n.telefono,
      'Código de paquete': n.codigo_paquete,
      'Estado': n.estado_aviso,
      'Fecha envío': formatDateTime(n.fecha_envio || '')
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Destinatarios');
    XLSX.writeFile(workbook, `destinatarios_ruta_MYG-${rutaId}.xlsx`);
  };

  // Filtrado reactivo de destinatarios
  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const haystack = `${n.nombre} ${n.telefono} ${n.codigo_paquete}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (filterStatus !== 'todos') {
        const stateStr = String(n.estado_aviso || 'pendiente').toLowerCase();
        if (filterStatus === 'pendiente') {
          if (stateStr !== 'pendiente' && stateStr !== 'borrador') return false;
        } else if (filterStatus === 'sin-whatsapp') {
          if (stateStr !== 'sin_whatsapp' && stateStr !== 'fail') return false;
        } else if (stateStr !== filterStatus) {
          return false;
        }
      }

      return true;
    });
  }, [notices, searchQuery, filterStatus]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
      </div>
    );
  }

  return (
    <div className="main rutas-page" id="main-content">
      <main className="content">
        
        {/* HERO SECTION DE LA RUTA */}
        <section className="pg-hero">
          <div className="pg-hero-left">
            <div className="pg-breadcrumb">Detalle de Ruta</div>
            <div className="pg-title-row">
              <h1 className="pg-title">{route?.nombre_lote || `Ruta ${route?.id || ''}`}</h1>
              <span className={`pg-badge pg-badge-${getBadgeClass(route?.estado || 'pendiente')}`} id="lote-estado-chip">
                {getBadgeLabel(route?.estado || 'pendiente')}
              </span>
              
              {/* Trigger del panel de control de envío */}
              {(queueControl?.isProcessing || queueControl?.isPaused || queueControl?.hasInterruptedFlow) && (
                <div id="envio-interrupcion" style={{ display: 'inline-flex', marginLeft: '8px' }}>
                  <button 
                    type="button" 
                    className={`envio-control-trigger ${queueControl.isProcessing ? 'is-processing' : 'is-paused'}`} 
                    id="btn-open-envio-control"
                    onClick={() => setShowControlModal(true)}
                  >
                    <span className="envio-control-trigger-dot" aria-hidden="true"></span>
                    <span>
                      <strong>{queueControl.isProcessing ? 'Envío en curso' : 'Ruta pausada'}</strong>
                      <small>{queueControl.isProcessing ? 'Gestionar' : 'Revisar decisión'}</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <div className="pg-meta-strip">
              <div className="pg-meta-row">
                <div className="pg-meta-item">Fecha: <span className="pg-meta-val">{route?.fecha ? formatDateOnly(route.fecha) : '-'}</span></div>
                <span className="pg-meta-sep">|</span>
                <div className="pg-meta-item">Sede: <span className="pg-meta-val">{route?.sede_nombre || '-'}</span></div>
                <span className="pg-meta-sep">|</span>
                <div className="pg-meta-item">Destinatarios: <span className="pg-meta-val">{stats.total}</span></div>
                <span className="pg-meta-sep">|</span>
                <div className="pg-meta-item">Observación: <span className="pg-meta-val">{route?.observacion || 'Sin observaciones'}</span></div>
                
                <section className={`route-progress-card ${queueControl?.isProcessing ? 'is-active' : ''}`} aria-label="Progreso de la ruta">
                  <div className="route-progress-ring" style={{ '--progress': stats.procesadosPct } as React.CSSProperties}>
                    <div className="ring-glow"></div>
                    <span id="hero-progress-value" style={{ zIndex: 2, fontWeight: 700 }}>{stats.procesadosPct}%</span>
                  </div>
                  <div className="route-progress-content">
                    <div className="route-progress-title">Progreso de la ruta</div>
                    <div className="route-progress-note">
                      {stats.total === 0 ? 'Sin actividad registrada' : `${stats.procesados} de ${stats.total} destinatarios procesados`}
                    </div>
                    <div className="route-progress-track">
                      <span style={{ width: `${stats.procesadosPct}%` }}></span>
                    </div>
                    <svg className="rpc-idle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        {/* WORKSPACE GRID */}
        <section className="workspace-grid">
          
          {/* LADO PRINCIPAL: DESTINATARIOS */}
          <div className="workspace-main">
            
            {/* CARDS DE KPIs */}
            <section className="new-stats-row">
              <article className="new-stat-card">
                <div className="new-stat-icon-wrap" style={{ background: '#fff4e6' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
                <div className="new-stat-body">
                  <div className="new-stat-top">
                    <span className="new-stat-num" style={{ color: '#f97316' }}>{stats.pendientes}</span>
                    <span className="new-stat-pct">{stats.pendientesPct}%</span>
                  </div>
                  <div className="new-stat-lbl">Pendientes</div>
                  <div className="new-stat-track">
                    <span className="new-stat-bar" style={{ background: '#f97316', width: `${stats.pendientesPct}%` }}></span>
                  </div>
                </div>
              </article>

              <article className="new-stat-card">
                <div className="new-stat-icon-wrap" style={{ background: '#eff6ff' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
                <div className="new-stat-body">
                  <div className="new-stat-top">
                    <span className="new-stat-num" style={{ color: '#3b82f6' }}>{stats.enviados}</span>
                    <span className="new-stat-pct">{stats.enviadosPct}%</span>
                  </div>
                  <div className="new-stat-lbl">Enviados</div>
                  <div className="new-stat-track">
                    <span className="new-stat-bar" style={{ background: '#3b82f6', width: `${stats.enviadosPct}%` }}></span>
                  </div>
                </div>
              </article>

              <article className="new-stat-card">
                <div className="new-stat-icon-wrap" style={{ background: '#f0fdf4' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <div className="new-stat-body">
                  <div className="new-stat-top">
                    <span className="new-stat-num" style={{ color: '#1f2937' }}>{stats.fallidos}</span>
                    <span className="new-stat-pct">{stats.fallidosPct}%</span>
                  </div>
                  <div className="new-stat-lbl">No tiene WhatsApp</div>
                  <div className="new-stat-track">
                    <span className="new-stat-bar" style={{ background: '#6b7280', width: `${stats.fallidosPct}%` }}></span>
                  </div>
                </div>
              </article>
            </section>

            {/* TABLA PRINCIPAL DE REGISTROS */}
            <article className="table-card" id="tab-content-list">
              <div className="card-header table-card-header">
                <div className="table-header-left">
                  <svg className="table-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <div>
                    <h2 className="card-title card-title-with-count">
                      Destinatarios
                      <span className="title-count-pill" id="destinatarios-total-badge" aria-label="Total de destinatarios">{notices.length}</span>
                    </h2>
                    <p className="card-subtitle">Consulta, filtra y organiza los registros listos para envío.</p>
                  </div>
                </div>
                <div className="toolbar-right">
                  <div className="search-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input 
                      type="text" 
                      id="input-buscar-aviso"
                      placeholder="Buscar destinatario..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className="btn-soft" onClick={() => setShowFilterPanel(!showFilterPanel)} type="button">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    Filtros
                  </button>
                  <button className="btn-soft" onClick={handleClearRoute} type="button">Vaciar ruta</button>
                  <button className="btn-soft btn-import-open" onClick={() => setShowImportModal(true)} type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Subir Excel
                  </button>
                  <button className="btn-primary" id="btn-nuevo-aviso" onClick={() => setShowCreateModal(true)} type="button">+ Nuevo</button>
                </div>
              </div>

              {/* Panel de filtros por chips */}
              {showFilterPanel && (
                <div className="filter-panel open">
                  <span className="filter-label">Estado:</span>
                  {[
                    { key: 'todos', label: 'Todos' },
                    { key: 'pendiente', label: 'Pendiente' },
                    { key: 'enviado', label: 'Enviado' },
                    { key: 'manual', label: 'Manual' },
                    { key: 'entregado', label: 'Entregado' },
                    { key: 'fallido', label: 'Fallido' },
                    { key: 'sin-whatsapp', label: 'Sin WhatsApp' }
                  ].map((st) => (
                    <button 
                      key={st.key}
                      className={`filter-chip ${filterStatus === st.key ? 'active' : ''}`}
                      onClick={() => setFilterStatus(st.key)}
                      type="button"
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="table-scroll">
                <table>
                  <colgroup>
                    <col style={{ width: '40px' }} />
                    <col />
                    <col style={{ width: '105px' }} />
                    <col style={{ width: '145px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '130px' }} />
                    <col style={{ width: '60px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>NRO.</th>
                      <th>Nombre</th>
                      <th>Teléfono</th>
                      <th>Código paquete</th>
                      <th>Estado</th>
                      <th>Fecha envío</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotices.length > 0 ? (
                      filteredNotices.map((notice, idx) => {
                        const visualStatus = normalizeAvisoVisualStatus(notice.estado_aviso);
                        return (
                          <tr key={notice.id}>
                            <td><span className="aviso-id">{idx + 1}</span></td>
                            <td className="aviso-nombre">{notice.nombre || '-'}</td>
                            <td><span className="telefono-badge">{notice.telefono || '-'}</span></td>
                            <td>{notice.codigo_paquete || '-'}</td>
                            <td>
                              <div style={{ position: 'relative' }}>
                                <span className={`estado-badge estado-${visualStatus}`}>
                                  {visualStatus === 'enviado' && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                                  )}
                                  {visualStatus === 'manual' && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                  )}
                                  {visualStatus === 'pendiente' && (
                                    <span className="dot dot-pendiente"></span>
                                  )}
                                  {visualStatus === 'sin-whatsapp' && (
                                    <span className="dot dot-sin-whatsapp"></span>
                                  )}
                                  {visualStatus === 'fallido' && (
                                    <span className="dot dot-fallido"></span>
                                  )}
                                  {formatEstadoLabel(notice.estado_aviso)}
                                </span>
                                <div className="row-prog-wrap">
                                  <div className="row-prog-fill" style={{ width: visualStatus === 'enviando' ? '60%' : '0%' }}></div>
                                </div>
                              </div>
                            </td>
                            <td>{notice.fecha_envio ? formatDateTime(notice.fecha_envio) : <span className="sin-envio">-</span>}</td>
                            <td>
                              <div className="row-actions">
                                <button 
                                  className="btn-row-delete" 
                                  onClick={() => handleDeleteNotice(notice.id)}
                                  title="Eliminar"
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="empty-row">
                          No hay destinatarios registrados en esta ruta.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-card-footer">
                <span className="tabla-count-label" id="tabla-avisos-meta">
                  {getPaginationMetaText()}
                </span>
                <button type="button" className="btn-export-avisos" onClick={handleExportAvisos}>Exportar</button>
              </div>
            </article>
          </div>

          {/* LADO LATERAL: COMPOSITOR */}
          <aside className="workspace-side">
            <article className="composer-panel">
              <div className="composer-panel-header">
                <h2 className="composer-panel-title">Compositor de envío</h2>
                <p className="composer-panel-sub">Redacta y revisa el mensaje antes de enviarlo.</p>
              </div>
              <div className="composer-panel-body">
                
                {/* Selector de Sesiones */}
                <div className="composer-session-card" id="session-field" style={{ position: 'relative' }}>
                  <div className="session-card-left" style={{ width: '100%' }}>
                    <svg className="session-card-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                    <div className="session-card-body" style={{ flex: 1, minWidth: 0 }}>
                      <span className="session-card-label">Sesión</span>
                      <div className="session-card-value" style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                        <span className={`session-indicator ${activeSession ? (activeSession.estado_real === 'connected' ? 'is-active' : activeSession.estado_real === 'auth_failure' ? 'is-error' : 'is-inactive') : ''}`}></span>
                        <span id="session-info-text" style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                          {activeSession 
                            ? `${activeSession.nombre_dispositivo || activeSession.nombre}${activeSession.numero_whatsapp ? ' · ' + activeSession.numero_whatsapp : ''}`
                            : 'Sin sesión disponible'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selector de Plantillas */}
                <div className="template-block">
                  <div className="template-row">
                    <span className="template-label">PLANTILLA</span>
                    <div className="template-chip">
                      <svg className="template-chip-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                      <span className="template-chip-name" style={{ cursor: 'pointer' }} onClick={() => setShowTemplatesModal(true)}>
                        {activeTemplate ? activeTemplate.nombre : 'Seleccionar plantilla'}
                      </span>
                    </div>
                    <button className="btn-ver-plantillas" onClick={() => setShowTemplatesModal(true)} type="button">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                      Ver plantillas
                    </button>
                  </div>
                </div>

                {/* Vista Previa de WhatsApp (Mockup Teléfono iOS) */}
                <div className="preview-section-label">Vista previa</div>
                <div className="composer-body">
                  <div className="preview-block">
                    <div className="phone-stage">
                      <div className="phone-frame">
                        <div className="phone-screen">
                          <div className="phone-notch"></div>
                          <div className="phone-statusbar">
                            <span className="sb-time">{mockTime}</span>
                            <div className="sb-icons" aria-hidden="true">
                              <svg viewBox="0 0 16 12"><rect x="0" y="8" width="3" height="4" rx=".5"/><rect x="4.5" y="5" width="3" height="7" rx=".5"/><rect x="9" y="2" width="3" height="10" rx=".5"/><rect x="13.5" y="0" width="2.5" height="12" rx=".5" opacity=".3"/></svg>
                              <svg viewBox="0 0 16 12"><path d="M8 10a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-3.5C9.8 6.5 11.4 7.2 12.6 8.4l1.4-1.4C12.4 5.4 10.3 4.5 8 4.5s-4.4.9-6 2.5L3.4 8.4C4.6 7.2 6.2 6.5 8 6.5zm0-3.5c2.8 0 5.3 1.1 7.1 3L16.5 4C14.3 1.8 11.3.5 8 .5S1.7 1.8-.5 4L1 5.5C2.7 3.6 5.2 2.5 8 2.5z" fillRule="evenodd"/></svg>
                              <svg viewBox="0 0 22 12"><rect x="0" y="1" width="18" height="10" rx="2" stroke="rgba(255,255,255,.7)" strokeWidth="1" fill="none"/><rect x="1.5" y="2.5" width="13" height="7" rx="1.2" fill="rgba(255,255,255,.9)"/><path d="M19.5 4v4a2 2 0 000-4z" fill="rgba(255,255,255,.6)"/></svg>
                            </div>
                          </div>
                          <div className="wa-header">
                            <div className="wa-back" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
                            <div className="wa-avatar">MG</div>
                            <div className="wa-info">
                              <div className="wa-name" id="wa-contact-name">{sampleContact.nombre}</div>
                              <div className="wa-online" id="wa-contact-status">
                                {selectedSessionId ? 'En sesión elegida' : 'Sin sesión seleccionada'}
                              </div>
                            </div>
                            <div className="wa-actions" aria-hidden="true">
                              <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.55 10.74 19.79 19.79 0 0 1 .48 2.07 2 2 0 0 1 2.48 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.91 7.91a16 16 0 0 0 6.72 6.72l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.92 16z"/></svg>
                              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                            </div>
                          </div>
                          <div className="wa-body">
                            <div className="wa-date-chip">HOY</div>
                            {messagePreview ? (
                              <div className="wa-bubble" id="wa-bubble">
                                {activeTemplate?.adjunto_url && (
                                  previewImageError ? (
                                    <div className="wa-image-missing">Imagen no disponible</div>
                                  ) : (
                                    <img 
                                      src={resolveTemplateImageUrl(activeTemplate.adjunto_url)} 
                                      className="wa-bubble-img" 
                                      alt="Imagen de plantilla" 
                                      loading="lazy"
                                      onError={() => setPreviewImageError(true)}
                                    />
                                  )
                                )}
                                <div id="wa-bubble-text">
                                  {formatPreviewMessage(messagePreview)}
                                </div>
                                <div className="wa-btime">
                                  <span id="wa-btime-val">{mockTime}</span>
                                  <svg viewBox="0 0 24 24" style={{ width: '12px', height: '12px', marginLeft: '3px', verticalAlign: 'middle' }}><polyline points="1 12 5 16 11 9"/><polyline points="9 12 13 16 19 9"/></svg>
                                </div>
                              </div>
                            ) : (
                              <div className="preview-empty-lbl">Selecciona una plantilla</div>
                            )}
                          </div>
                          <div className="wa-footer">
                            <div className="wa-mic-btn" aria-hidden="true">
                              <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>
                            </div>
                            <div className="wa-input-fake">Escribe un mensaje...</div>
                            <div className="wa-send-btn" aria-hidden="true">
                              <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z"/></svg>
                            </div>
                          </div>
                        </div>
                        <div className="phone-bottombar"><div className="phone-home-bar"></div></div>
                      </div>
                    </div>
                  </div>

                  {/* Estado de envío o botón de envío */}
                  {queueControl?.isProcessing ? (
                    <button 
                      className="send-btn is-processing" 
                      disabled={true}
                    >
                      Envío en curso
                    </button>
                  ) : (queueControl?.isPaused || queueControl?.hasInterruptedFlow) ? (
                    <button 
                      className="send-btn is-paused" 
                      onClick={() => setShowControlModal(true)}
                    >
                      Retomar envío
                    </button>
                  ) : (
                    <button 
                      className="send-btn normal" 
                      onClick={() => setShowConfirmSendModal(true)} 
                      disabled={sendingAction}
                    >
                      Enviar mensajes
                    </button>
                  )}
                </div>
              </div>
            </article>
          </aside>
        </section>
      </main>

      {/* MODAL: SUBIR EXCEL */}
      {showImportModal && (
        <div className="modal-overlay open">
          <div className="modal-box modal-box-import" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Carga de destinatarios</h2>
                <p className="card-subtitle">Sube un Excel con columnas Nombre, Código y Teléfono.</p>
              </div>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div 
                className="import-dropzone" 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    setImportFileName(file.name);
                    handleFileUpload(file);
                  }
                }}
              >
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImportFileName(file.name);
                      handleFileUpload(file);
                    }
                  }}
                />
                <div className="import-dropzone-file">{importFileName}</div>
                <div className="import-dropzone-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16 16l-4-4-4 4"/>
                    <path d="M12 12v9"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                </div>
                <div className="import-dropzone-title">Arrastra tu archivo aquí</div>
                <div className="import-dropzone-subtitle">o haz clic para seleccionar .xlsx, .xls o .csv</div>
                <div className="import-dropzone-hint">
                  <span>Columnas requeridas</span>
                  <div className="import-dropzone-chips">
                    <span className="import-chip">Nombre</span>
                    <span className="import-chip">Código</span>
                    <span className="import-chip">Teléfono</span>
                  </div>
                </div>
              </div>
              {importStatus.type !== 'idle' && (
                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: importStatus.type === 'error' ? '#ef4444' : '#1d7d48', textAlign: 'center', fontWeight: 600 }}>
                  {importStatus.type === 'loading' && <span className="spinner" style={{ marginRight: '6px', width: '12px', height: '12px' }}></span>}
                  {importStatus.msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRO MANUAL */}
      {showCreateModal && (
        <div className="modal-overlay open" id="modal-aviso">
          <div className="modal-box">
            <div className="modal-header">
              <h2 className="modal-title">Nuevo destinatario</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleCreateNotice}>
              <div className="modal-body">
                <div className="field-row" style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Teléfono *</label>
                    <input 
                      type="text" 
                      placeholder="51987654321" 
                      value={newNoticePhone} 
                      onChange={(e) => setNewNoticePhone(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Nombre</label>
                    <input 
                      type="text" 
                      placeholder="Nombre cliente" 
                      value={newNoticeName} 
                      onChange={(e) => setNewNoticeName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="field" style={{ marginBottom: '12px' }}>
                  <label>Código de paquete</label>
                  <input 
                    type="text" 
                    placeholder="PKG-00123" 
                    value={newNoticeCode} 
                    onChange={(e) => setNewNoticeCode(e.target.value)} 
                    required 
                  />
                </div>
                <div className="field">
                  <label>Mensaje personalizado (opcional)</label>
                  <textarea 
                    placeholder="Mensaje adicional" 
                    value={newNoticeCustomMessage} 
                    onChange={(e) => setNewNoticeCustomMessage(e.target.value)}
                    style={{ minHeight: '60px', width: '100%', border: '1px solid #ccc', borderRadius: '6px', padding: '8px' }}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button className="btn-primary" type="submit">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GALERÍA DE PLANTILLAS */}
      {showTemplatesModal && (
        <div className="modal-overlay open" id="modal-plantillas">
          <div className="modal-box modal-box-templates">
            <div className="modal-header">
              <div></div>
              <button className="modal-close" onClick={() => setShowTemplatesModal(false)} type="button" aria-label="Cerrar">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body templates-modal-body">
              <div className="templates-panel-header manager-toolbar">
                <div>
                  <div className="manager-title">Plantillas disponibles</div>
                  <div className="manager-subtitle">Elige una para esta ruta o abre una plantilla para editarla.</div>
                </div>
                <button 
                  className="btn-soft" 
                  id="btn-nueva-plantilla"
                  type="button"
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateFormName('');
                    setTemplateFormBody('');
                    setTemplateFormImage(null);
                    setTemplateFormImageName('');
                    setTemplateFormImageBase64(null);
                    setTemplateImageBorrar(false);
                    setShowTemplatesModal(false);
                    setShowTemplateEditorModal(true);
                  }}
                >
                  Nueva plantilla
                </button>
              </div>

              <div className="templates-gallery" id="templates-list">
                {templates.length > 0 ? (
                  templates.map((tpl) => (
                    <div 
                      key={tpl.id} 
                      className={`template-item ${selectedTemplateId === String(tpl.id) ? 'active' : ''}`}
                      onClick={() => {
                        seleccionarPlantillaComoDefault(String(tpl.id));
                        setShowTemplatesModal(false);
                      }}
                    >
                      <div className="template-item-header">
                        <svg className="template-item-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        <span className="template-item-name">{tpl.nombre}</span>
                        {tpl.adjunto_url && (
                          <span className="template-image-badge">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            Imagen
                          </span>
                        )}
                      </div>
                      <div className="template-body">
                        {tpl.cuerpo}
                      </div>
                      <div className="template-card-footer">
                        <div>
                          {selectedTemplateId === String(tpl.id) ? (
                            <span className="template-current">En uso en esta ruta</span>
                          ) : (
                            <span className="template-card-meta">Disponible</span>
                          )}
                        </div>
                        <div className="template-item-actions">
                          <button 
                            className="template-action-btn edit" 
                            type="button" 
                            title="Editar plantilla"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTemplate(tpl);
                              setTemplateFormName(tpl.nombre);
                              setTemplateFormBody(tpl.cuerpo);
                              setTemplateFormImage(null);
                              setTemplateFormImageName(tpl.adjunto_url ? 'Imagen actual' : '');
                              setTemplateFormImageBase64(null);
                              setTemplateImageBorrar(false);
                              setShowTemplatesModal(false);
                              setShowTemplateEditorModal(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                          </button>
                          <button 
                            className="template-action-btn delete" 
                            type="button" 
                            title="Eliminar plantilla"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(tpl.id);
                            }}
                          >
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-row" style={{ gridColumn: '1 / -1', width: '100%' }}>
                    No hay plantillas disponibles.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowTemplatesModal(false)} type="button">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITOR DE PLANTILLA */}
      {showTemplateEditorModal && (
        <div className="modal-overlay open" id="modal-plantilla-editor">
          <div className="modal-box modal-box-editor">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
                <p className="modal-subtitle">Guarda un texto reutilizable para tus envíos por ruta.</p>
              </div>
              <button className="modal-close" onClick={() => { setShowTemplateEditorModal(false); setShowTemplatesModal(true); }} type="button" aria-label="Cerrar">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSaveTemplate} className="template-editor-form">
              <div className="modal-body">
                <div className="field">
                  <label htmlFor="plantilla-modal-nombre">Nombre de plantilla</label>
                  <input 
                    type="text" 
                    id="plantilla-modal-nombre"
                    placeholder="Ej. Plantilla Satipo" 
                    value={templateFormName} 
                    onChange={(e) => setTemplateFormName(e.target.value)} 
                    required 
                  />
                </div>
                <div className="field">
                  <label htmlFor="plantilla-modal-cuerpo">Mensaje</label>
                  <textarea 
                    id="plantilla-modal-cuerpo"
                    placeholder="Hola {nombre}, su paquete llegó a MyG Express." 
                    value={templateFormBody} 
                    onChange={(e) => setTemplateFormBody(e.target.value)} 
                    required
                  ></textarea>
                  <div className="template-editor-hint">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <div>
                      <strong>Variables dinámicas:</strong> puedes usar <code>{`{nombre}`}</code>, <code>{`{codigo_paquete}`}</code> y <code>{`{telefono}`}</code> para personalizar el mensaje.
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Imagen adjunta (opcional)</label>
                  {!templateFormImageName ? (
                    <div className="template-image-picker">
                      <label className="upload-zone" htmlFor="plantilla-modal-imagen" style={{ cursor: 'pointer' }}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span className="upload-placeholder">Subir imagen</span>
                      </label>
                      <input 
                        type="file" 
                        id="plantilla-modal-imagen" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setTemplateFormImage(file);
                            setTemplateFormImageName(file.name);
                            setTemplateImageBorrar(false);
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setTemplateFormImageBase64(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        hidden 
                      />
                    </div>
                  ) : (
                    <div className="file-card">
                      <div className="file-card-thumb">
                        {templateFormImage ? (
                          <img src={URL.createObjectURL(templateFormImage)} alt="Preview" />
                        ) : editingTemplate?.adjunto_url ? (
                          <img src={resolveTemplateImageUrl(editingTemplate.adjunto_url)} alt="Current" />
                        ) : null}
                      </div>
                      <div className="file-card-body">
                        <div className="file-card-name">{templateFormImageName}</div>
                        <div className="file-card-meta">
                          <span>{templateFormImage ? `${Math.round(templateFormImage.size / 1024)} KB` : 'Imagen de plantilla'}</span>
                          <span className="file-card-sep">·</span>
                          <span>Listo</span>
                        </div>
                      </div>
                      <button 
                        className="file-card-remove" 
                        type="button" 
                        title="Quitar imagen"
                        onClick={() => {
                          setTemplateFormImage(null);
                          setTemplateFormImageName('');
                          setTemplateFormImageBase64(null);
                          setTemplateImageBorrar(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                  <p className="helper-text compact-helper" style={{ marginTop: '8px' }}>JPG, PNG — max. 5 MB. Se guarda con la plantilla.</p>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" type="button" onClick={() => { setShowTemplateEditorModal(false); setShowTemplatesModal(true); }}>Atrás</button>
                <button className="btn-primary" type="submit">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ENVÍO MASIVO */}
      {showConfirmSendModal && (
        <div className="modal-overlay open" id="modal-confirmar-envio">
          <div className="modal-box">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Confirmar envío de la ruta</h2>
                <p className="modal-subtitle">Revisa el resumen antes de iniciar el envío por WhatsApp.</p>
              </div>
              <button className="modal-close" onClick={() => setShowConfirmSendModal(false)}>
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="send-confirm-summary">
                <div className="send-confirm-row"><span>Mensajes pendientes</span><strong>{stats.pendientes}</strong></div>
                <div className="send-confirm-row"><span>Sesión seleccionada</span><strong>{activeSession ? activeSession.nombre : '-'}</strong></div>
                <div className="send-confirm-row"><span>Plantilla activa</span><strong>{activeTemplate ? activeTemplate.nombre : '-'}</strong></div>
                <div className="send-confirm-row"><span>Imagen adjunta</span><strong>{activeTemplate?.adjunto_url ? 'Según plantilla' : 'No contiene'}</strong></div>
              </div>
              <div className="send-confirm-note">
                El sistema encolará solo los destinatarios que sigan pendientes. Luego el worker de WhatsApp los procesará y actualizará dentro de la ruta.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowConfirmSendModal(false)}>Cancelar</button>
              <button className="btn-primary btn-confirm-send" onClick={handleStartSending}>Iniciar envío</button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: CONTROL DE ENVÍO */}
      {showControlModal && queueControl && (
        <div className="envio-control-modal is-open" id="envio-control-modal" role="dialog" aria-modal="true" aria-labelledby="envio-control-title">
          <div className="envio-control-dialog">
            <button type="button" className="envio-control-close" aria-label="Cerrar panel" onClick={() => setShowControlModal(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
            <div className="envio-control-head">
              <span className={`envio-control-icon ${queueControl.isProcessing ? 'is-processing' : 'is-paused'}`} aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 8v5"></path><path d="M12 16h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path></svg>
              </span>
              <div>
                <p className="envio-control-kicker">{queueControl.isProcessing ? 'Envío activo' : 'Decisión requerida'}</p>
                <h2 id="envio-control-title">{queueControl.isProcessing ? 'Control de envío' : 'Ruta pausada'}</h2>
                <p>
                  {queueControl.isProcessing
                    ? 'La ruta está enviando mensajes. Si detectas un problema, puedes pausar el envío y retomarlo después.'
                    : 'Esta ruta requiere una decisión antes de continuar. No se reenviará nada automáticamente.'}
                </p>
              </div>
            </div>
            <div className="envio-control-note">
              {queueControl.lastError || (queueControl.isProcessing
                ? 'El envío está activo. Puedes pausarlo si necesitas detener los pendientes sin perderlos.'
                : 'La ruta quedó pausada para evitar reenvíos automáticos. Decide cómo continuar con los mensajes pendientes.')}
            </div>
            <div className="envio-control-stats">
              {queueControl.isProcessing ? (
                <>
                  <span><strong>{Number(queueControl.queuedCount || queueControl.processingJobs || 0)}</strong> en cola</span>
                  <span><strong>{stats.pendientes}</strong> pendientes en tabla</span>
                  <span><strong>{activeSession?.estado_real === 'connected' ? 'Lista' : 'Sin conexión'}</strong> sesión</span>
                </>
              ) : (
                <>
                  <span><strong>{Number(queueControl.pausedJobs || 0)}</strong> en pausa</span>
                  <span><strong>{stats.pendientes}</strong> pendientes en tabla</span>
                  <span><strong>{activeSession?.estado_real === 'connected' ? 'Lista' : 'Pendiente'}</strong> sesión</span>
                </>
              )}
            </div>
            <div className="envio-control-actions">
              {queueControl.isProcessing ? (
                <>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={async () => {
                      await handleQueueControl('pausar');
                      setShowControlModal(false);
                    }}
                    disabled={sendingAction}
                  >
                    Pausar envío
                  </button>
                  <button 
                    type="button" 
                    className="btn-soft btn-danger-soft" 
                    onClick={async () => {
                      await handleQueueControl('cancelar');
                      setShowControlModal(false);
                    }}
                    disabled={sendingAction}
                  >
                    Cancelar pendientes
                  </button>
                </>
              ) : (
                <>
                  <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={async () => {
                      await handleQueueControl('reanudar');
                      setShowControlModal(false);
                    }}
                    disabled={sendingAction || activeSession?.estado_real !== 'connected'}
                  >
                    Retomar envío
                  </button>
                  <button 
                    type="button" 
                    className="btn-soft" 
                    onClick={async () => {
                      await handleQueueControl('manual');
                      setShowControlModal(false);
                    }}
                    disabled={sendingAction}
                  >
                    Registrar cierre manual
                  </button>
                  <button 
                    type="button" 
                    className="btn-soft btn-danger-soft" 
                    onClick={async () => {
                      await handleQueueControl('cancelar');
                      setShowControlModal(false);
                    }}
                    disabled={sendingAction}
                  >
                    Cancelar pendientes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { showToast, showConfirm } from '../../core/utils/toast';
import { getApiErrorMessage } from '../../core/api/errors';
import { routeDetailService } from './route-detail/route-detail.service';
import { RecipientsTable } from './route-detail/components/RecipientsTable';
import { RouteDetailStats } from './route-detail/components/RouteDetailStats';
import { RouteDetailHeader } from './route-detail/components/RouteDetailHeader';
import { MessageComposer } from './route-detail/components/MessageComposer';
import { NoticeEditorModal } from './route-detail/components/NoticeEditorModal';
import { ImportNoticesModal } from './route-detail/components/ImportNoticesModal';
import { SendControlModals } from './route-detail/components/SendControlModals';
import { TemplateModals } from './route-detail/components/TemplateModals';
import styles from './LoteDetalle.module.css';
import {
  calculateRouteStats,
  formatDateTime,
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
      <div className={styles.previewMessage}>
        {lines.map((line, idx) => {
          const parts = line.split(/\*(.*?)\*/g);
          return (
            <div key={idx} className={styles.messageLine}>
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
      return true;
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Error al ejecutar control de cola'), 'error', { title: 'Error de control' });
      return false;
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
    return <PageLoader compact label="Cargando detalle de la ruta" />;
  }

  return (
    <div className={`main ${styles.page}`} id="main-content">
      <main className={styles.content}>
        <section className={styles.workspace}>
          <div className={styles.workspaceMain}>
            <RouteDetailHeader
              route={route}
              total={stats.total}
              processed={stats.procesados}
              percentage={stats.procesadosPct}
              queue={queueControl}
              onOpenQueue={() => setShowControlModal(true)}
            />
            <RouteDetailStats stats={stats} />
            <RecipientsTable
              notices={notices}
              filteredNotices={filteredNotices}
              search={searchQuery}
              status={filterStatus}
              showFilters={showFilterPanel}
              onSearchChange={setSearchQuery}
              onStatusChange={setFilterStatus}
              onToggleFilters={() => setShowFilterPanel(value => !value)}
              onClear={() => void handleClearRoute()}
              onImport={() => setShowImportModal(true)}
              onCreate={() => setShowCreateModal(true)}
              onDelete={noticeId => void handleDeleteNotice(noticeId)}
              onExport={handleExportAvisos}
            />
          </div>
          <MessageComposer
            session={activeSession}
            template={activeTemplate}
            contactName={sampleContact.nombre}
            time={mockTime}
            message={messagePreview ? formatPreviewMessage(messagePreview) : null}
            imageUrl={resolveTemplateImageUrl(activeTemplate?.adjunto_url)}
            imageError={previewImageError}
            hasSession={Boolean(selectedSessionId)}
            queue={queueControl}
            sending={sendingAction}
            onImageError={() => setPreviewImageError(true)}
            onOpenTemplates={() => setShowTemplatesModal(true)}
            onOpenControl={() => setShowControlModal(true)}
            onConfirmSend={() => setShowConfirmSendModal(true)}
          />
        </section>
      </main>
      <ImportNoticesModal
        open={showImportModal}
        fileName={importFileName}
        status={importStatus}
        onFile={(file) => {
          setImportFileName(file.name);
          void handleFileUpload(file);
        }}
        onClose={() => setShowImportModal(false)}
      />
      <NoticeEditorModal
        open={showCreateModal}
        name={newNoticeName}
        phone={newNoticePhone}
        code={newNoticeCode}
        message={newNoticeCustomMessage}
        onName={setNewNoticeName}
        onPhone={setNewNoticePhone}
        onCode={setNewNoticeCode}
        onMessage={setNewNoticeCustomMessage}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateNotice}
      />


      <TemplateModals
        galleryOpen={showTemplatesModal}
        editorOpen={showTemplateEditorModal}
        templates={templates}
        selectedId={selectedTemplateId}
        editing={editingTemplate}
        name={templateFormName}
        body={templateFormBody}
        imageName={templateFormImageName}
        imagePreview={
          templateFormImageBase64 ||
          (editingTemplate?.adjunto_url
            ? resolveTemplateImageUrl(editingTemplate.adjunto_url)
            : '')
        }
        onCloseGallery={() => setShowTemplatesModal(false)}
        onBack={() => {
          setShowTemplateEditorModal(false);
          setShowTemplatesModal(true);
        }}
        onNew={() => {
          setEditingTemplate(null);
          setTemplateFormName('');
          setTemplateFormBody('');
          setTemplateFormImageName('');
          setTemplateFormImageBase64(null);
          setTemplateImageBorrar(false);
          setShowTemplatesModal(false);
          setShowTemplateEditorModal(true);
        }}
        onSelect={(template) => {
          void seleccionarPlantillaComoDefault(String(template.id));
          setShowTemplatesModal(false);
        }}
        onEdit={(template) => {
          setEditingTemplate(template);
          setTemplateFormName(template.nombre);
          setTemplateFormBody(template.cuerpo);
          setTemplateFormImageName(template.adjunto_url ? 'Imagen actual' : '');
          setTemplateFormImageBase64(null);
          setTemplateImageBorrar(false);
          setShowTemplatesModal(false);
          setShowTemplateEditorModal(true);
        }}
        onDelete={(id) => void handleDeleteTemplate(id)}
        onName={setTemplateFormName}
        onBody={setTemplateFormBody}
        onImage={(file, base64) => {
          setTemplateFormImageName(file.name);
          setTemplateFormImageBase64(base64);
          setTemplateImageBorrar(false);
        }}
        onRemoveImage={() => {
          setTemplateFormImageName('');
          setTemplateFormImageBase64(null);
          setTemplateImageBorrar(true);
        }}
        onSave={handleSaveTemplate}
      />
      <SendControlModals
        confirmOpen={showConfirmSendModal}
        controlOpen={showControlModal}
        queue={queueControl}
        pending={stats.pendientes}
        session={activeSession}
        template={activeTemplate}
        loading={sendingAction}
        onCloseConfirm={() => setShowConfirmSendModal(false)}
        onCloseControl={() => setShowControlModal(false)}
        onStart={() => void handleStartSending()}
        onAction={handleQueueControl}
      />


    </div>
  );
};

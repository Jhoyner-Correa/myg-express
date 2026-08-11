// ============================================================
// frontend-react/src/features/logistica/WhatsAppSessions.tsx
// Módulo de Sesiones de WhatsApp (Manejo de QRs y Proveedores)
// Estructura y clases exactas de whatsapp.html original
// ============================================================

import React, { useState, useEffect } from 'react';
import '../../css/whatsapp.css';
import apiClient from '../../core/api/apiClient';
import { showToast, showConfirm } from '../../core/utils/toast';
import { useAuth } from '../../core/auth/authState';
import QRCode from 'qrcode';

type SessionItem = {
  id: number;
  sede_id: number;
  nombre_dispositivo: string;
  numero_whatsapp: string;
  estado: string;
  activo: number;
  session_key: string;
  ultima_conexion?: string;
  created_at: string;
  estado_real: string;
  connected: boolean;
};

// Iconos vectoriales SVG originales de whatsapp.js
const ICONS = {
  signal: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M1 9.1 3.15 11.25c4.9-4.9 12.8-4.9 17.7 0L23 9.1C16.93 3.03 7.08 3.03 1 9.1Z" />
      <path d="m5.28 13.38 2.15 2.15a6.45 6.45 0 0 1 9.14 0l2.15-2.15c-3.7-3.7-9.74-3.7-13.44 0Z" />
      <path d="M9.55 17.65 12 20.1l2.45-2.45a3.46 3.46 0 0 0-4.9 0Z" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  qr: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  switch: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  copy: (
    <svg className="wa-copy-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', marginLeft: '6px', cursor: 'pointer', verticalAlign: 'middle', opacity: 0.6 }}>
      <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
};

export const WhatsAppSessions: React.FC = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Modales y formularios
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');

  const [activeQrSessionId, setActiveQrSessionId] = useState<number | null>(null);
  const [qrCodeValue, setQrCodeValue] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSeconds, setQrSeconds] = useState(60);
  const [qrState, setQrState] = useState<'loading' | 'ready' | 'expired'>('loading');

  // Controlar el cronómetro regresivo para el código QR
  useEffect(() => {
    if (activeQrSessionId === null || qrState !== 'ready') return;

    const interval = setInterval(() => {
      setQrSeconds((prev) => {
        if (prev <= 1) {
          setQrState('expired');
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeQrSessionId, qrState]);

  // Si cambia el valor de qrCodeValue, resetear el contador y poner el estado en 'ready'
  useEffect(() => {
    if (qrCodeValue) {
      setQrSeconds(60);
      setQrState('ready');
    }
  }, [qrCodeValue]);

  useEffect(() => {
    if (qrCodeValue) {
      const isBase64Image = qrCodeValue.startsWith('data:image/') || qrCodeValue.length > 1000;
      if (isBase64Image) {
        const prefix = qrCodeValue.startsWith('data:') ? '' : 'data:image/png;base64,';
        setQrDataUrl(prefix + qrCodeValue);
      } else {
        QRCode.toDataURL(qrCodeValue, { width: 210, margin: 1 })
          .then((url) => setQrDataUrl(url))
          .catch((err) => {
            console.error('Error generating local QR code:', err);
            setQrDataUrl('');
          });
      }
    } else {
      setQrDataUrl('');
    }
  }, [qrCodeValue]);

  // Copiar imagen de QR al portapapeles como archivo blob
  const copyQrImageToClipboard = async () => {
    if (!qrDataUrl) return;
    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      showToast('¡Imagen del código QR copiado al portapapeles! Listo para pegar (Ctrl+V) en WhatsApp.', 'success', { title: 'QR Copiado' });
    } catch (err) {
      console.error('Error copying QR image to clipboard:', err);
      showToast('No se pudo copiar la imagen de forma automática. Intente hacer clic derecho sobre la imagen y seleccionar "Copiar imagen".', 'warning', { title: 'Error al copiar' });
    }
  };

  // Obtener fecha actual en formato topbar
  const [currentDate] = useState(() => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('es-ES', options);
  });

  const fetchSessions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiClient.get('/whatsapp-sesiones');
      if (response.data?.ok) {
        setSessions(response.data.data || []);
      }
    } catch (e) {
      console.error('Error al cargar sesiones de WhatsApp:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    // Polling en segundo plano cada 15 segundos
    const interval = setInterval(() => fetchSessions(true), 15000);
    return () => clearInterval(interval);
  }, []);

  // Crear/Configurar dispositivo
  const handleSaveDevice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newDeviceName.trim()) return;

    try {
      const response = await apiClient.post('/whatsapp-sesiones', {
        nombre_dispositivo: newDeviceName
      });
      if (response.data?.ok) {
        setShowCreateModal(false);
        setNewDeviceName('');
        showToast('Dispositivo registrado correctamente.', 'success', { title: 'Dispositivo registrado' });
        fetchSessions();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al registrar el dispositivo', 'error', { title: 'Error' });
    }
  };

  // Reconectar
  const handleReconnectSession = async (id: number) => {
    try {
      const response = await apiClient.post(`/whatsapp-sesiones/${id}/reconnect`);
      if (response.data?.ok) {
        fetchSessions();
        showToast('Dispositivo inicializado. Si requiere escaneo, abra el panel QR.', 'info', { title: 'Reconexión iniciada' });
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al iniciar reconexión', 'error', { title: 'Error' });
    }
  };

  // Reemplazar dispositivo (Borra y abre el modal de registro)
  const handleReplaceDevice = (id: number) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    setNewDeviceName(session.nombre_dispositivo || '');
    setShowCreateModal(true);
  };

  // Eliminar
  const handleDeleteSession = async (id: number) => {
    const confirmed = await showConfirm({
      title: '¿Eliminar dispositivo?',
      message: '¿Está seguro de eliminar este dispositivo de WhatsApp y revocar su sesión?',
      type: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    try {
      const response = await apiClient.delete(`/whatsapp-sesiones/${id}`);
      if (response.data?.ok) {
        if (activeQrSessionId === id) {
          setActiveQrSessionId(null);
          setQrCodeValue('');
        }
        showToast('Dispositivo eliminado correctamente.', 'success', { title: 'Eliminado' });
        fetchSessions();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Error al eliminar el dispositivo', 'error', { title: 'Error' });
    }
  };

  // Mostrar / Ocultar QR
  const handleToggleQr = async (id: number) => {
    if (activeQrSessionId === id) {
      setActiveQrSessionId(null);
      setQrCodeValue('');
      return;
    }

    setActiveQrSessionId(id);
    setQrLoading(true);
    setQrState('loading');
    setQrCodeValue('');

    try {
      const response = await apiClient.get(`/whatsapp-sesiones/${id}/qr`);
      if (response.data?.ok) {
        if (response.data.connected) {
          showToast('El dispositivo ya está conectado y no requiere escaneo.', 'info', { title: 'Sesión activa' });
          setActiveQrSessionId(null);
        } else {
          setQrCodeValue(response.data.qr || '');
        }
      }
    } catch (e: any) {
      console.error('Error al obtener QR:', e);
      showToast('No se pudo generar el código QR. Intente reconectar primero.', 'error', { title: 'Error QR' });
      setActiveQrSessionId(null);
    } finally {
      setQrLoading(false);
    }
  };

  const handleRefreshQr = async (id: number) => {
    setQrLoading(true);
    setQrState('loading');
    setQrCodeValue('');
    try {
      const response = await apiClient.get(`/whatsapp-sesiones/${id}/qr`);
      if (response.data?.ok) {
        if (response.data.connected) {
          showToast('El dispositivo ya está conectado y no requiere escaneo.', 'info', { title: 'Sesión activa' });
          setActiveQrSessionId(null);
        } else {
          setQrCodeValue(response.data.qr || '');
        }
      }
    } catch (e: any) {
      console.error('Error al actualizar QR:', e);
      showToast('No se pudo actualizar el código QR.', 'error', { title: 'Error QR' });
    } finally {
      setQrLoading(false);
    }
  };

  // Copiar al portapapeles
  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast('Número de teléfono copiado.', 'success', { title: 'Copiado' });
  };

  const formatDateTime = (value: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <main className="main" id="main-content">
      {/* HEADER ORIGINAL */}
      <header className="topbar">
        <div className="header-title-container">
          <div className="header-icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <div>
            <div className="topbar-title">WhatsApp</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-date" id="current-date">{currentDate}</span>
          <div className="user-role-badge">
            <span className="status-dot"></span>
            <span id="user-rol">{user?.es_superadmin ? 'Super Administrador' : user?.rol || 'Encargado de Oficina'}</span>
          </div>
        </div>
      </header>

      {/* CUERPO PRINCIPAL CON CLASE ORIGINAL DE LA PÁGINA */}
      <main className="wa-page">
        {loading && sessions.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
            <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
          </div>
        ) : sessions.length === 0 ? (
          /* MIGRACIÓN EXACTA DE LA VISTA SIN DISPOSITIVO (EMPTY STATE ORIGINAL) */
          <section className="wa-empty is-setup" id="empty-state" style={{ display: 'grid' }}>
            <div className="wa-empty-hero" aria-hidden="true">
              <span className="wa-empty-orbit orbit-one"></span>
              <span className="wa-empty-orbit orbit-two"></span>
              <span className="wa-empty-orbit-dot dot-one"></span>
              <span className="wa-empty-orbit-dot dot-two"></span>
              <span className="wa-empty-orbit-dot dot-three"></span>
              <img src="/img/whatsapp-hero-3d-crop.png" alt="WhatsApp Hero" loading="eager" />
            </div>
            <strong>Sin dispositivo configurado</strong>
            <span className="wa-empty-copy">Conecta un dispositivo WhatsApp para habilitar el canal de mensajería de esta sede.</span>
            <div className="wa-empty-benefits">
              <div className="wa-empty-benefit">
                <div className="wa-empty-benefit-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <b>Conexión segura</b>
                <small>Tus datos y conversaciones siempre protegidos.</small>
              </div>
              <div className="wa-empty-benefit">
                <div className="wa-empty-benefit-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                </div>
                <b>En tiempo real</b>
                <small>Sincronización inmediata de mensajes y estados.</small>
              </div>
              <div className="wa-empty-benefit">
                <div className="wa-empty-benefit-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
                </div>
                <b>Comunicación efectiva</b>
                <small>Envía y recibe mensajes de manera rápida y organizada.</small>
              </div>
            </div>
            <button className="ge-primary-btn wa-empty-btn" id="btn-open-modal-empty" type="button" onClick={() => setShowCreateModal(true)}>
              {ICONS.plus}
              Configurar dispositivo
            </button>
            <button className="wa-empty-help" type="button" onClick={() => alert('Para conectar tu dispositivo, abre WhatsApp en tu teléfono, ve a Dispositivos Vinculados, presiona Vincular Dispositivo y escanea el código QR que se genere en este panel.')}>Cómo conectar mi dispositivo</button>
          </section>
        ) : (
          /* MIGRACIÓN EXACTA DE LA VISTA CON DISPOSITIVO (TARJETA DE DISPOSITIVO ORIGINAL) */
          <section id="sessions-grid" aria-live="polite">
            {sessions.map((session) => {
              const connected = session.estado_real === 'connected' || session.estado === 'ACTIVO';
              const lastConnection = session.ultima_conexion ? formatDateTime(session.ultima_conexion) : 'Sin registro de conexión';
              const createdAt = session.created_at ? formatDateTime(session.created_at) : '-';
              
              return (
                <article key={session.id} className={`wa-device-card ${connected ? 'is-connected' : 'is-offline'}`}>
                  <div className="wa-device-header">
                    <div className="wa-device-info-group">
                      <div className="wa-device-icon">
                        <img src="/img/whatsapp-hero-3d-crop.png" alt="WhatsApp device" loading="eager" />
                      </div>
                      <div>
                        <div className="wa-device-name">{session.nombre_dispositivo || 'Dispositivo sin nombre'}</div>
                        <div className="wa-device-sub">Dispositivo oficial de la sede</div>
                      </div>
                    </div>
                    <div className="wa-device-status">
                      <div className="wa-status-copy">
                        <span className={`wa-status-badge ${session.estado_real || 'disconnected'}`}>
                          <span className="wa-status-dot"></span>
                          {connected ? 'Conectado' : 'Desconectado'}
                        </span>
                        <span className="wa-status-label">Estado del dispositivo</span>
                        <span className="wa-status-memory">Memoria en uso: <strong>116 MB</strong></span>
                      </div>
                      <span className="wa-status-signal" aria-hidden="true">{ICONS.signal}</span>
                    </div>
                  </div>

                  <div className="wa-device-body">
                    <div className="wa-device-meta">
                      <div className="wa-meta-item">
                        <div className="wa-meta-icon">{ICONS.phone}</div>
                        <div className="wa-meta-copy">
                          <span className="wa-meta-label">Número</span>
                          <div className="wa-meta-value">
                            {session.numero_whatsapp || 'No registrado'}
                            <span 
                              className="wa-copy-trigger" 
                              onClick={() => copyToClipboard(session.numero_whatsapp)} 
                              title="Copiar número"
                            >
                              {ICONS.copy}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="wa-meta-item">
                        <div className="wa-meta-icon">{ICONS.clock}</div>
                        <div className="wa-meta-copy">
                          <span className="wa-meta-label">Última conexión</span>
                          <div className="wa-meta-value">{lastConnection}</div>
                        </div>
                      </div>
                      <div className="wa-meta-item">
                        <div className="wa-meta-icon">{ICONS.calendar}</div>
                        <div className="wa-meta-copy">
                          <span className="wa-meta-label">Registrado</span>
                          <div className="wa-meta-value">{createdAt}</div>
                        </div>
                      </div>
                    </div>

                    {/* QR PANEL ORIGINAL */}
                    {activeQrSessionId === session.id && (
                      <div className="wa-qr-wrap">
                        <div className="wa-qr-head">
                          <div className="wa-qr-title">{ICONS.qr}Vincular dispositivo</div>
                          <button className="wa-qr-close" type="button" onClick={() => handleToggleQr(session.id)} aria-label="Cerrar QR">
                            {ICONS.close}
                          </button>
                        </div>
                        <p className="wa-qr-inst">Abra <strong>WhatsApp</strong> &gt; <strong>Dispositivos vinculados</strong> &gt; <strong>Vincular dispositivo</strong> y escanee el código.</p>
                        <div className="wa-qr-status">
                          {qrState === 'loading' && <span className="wa-qr-pill loading">Preparando código</span>}
                          {qrState === 'ready' && <span className="wa-qr-pill ready">Código listo</span>}
                          {qrState === 'expired' && <span className="wa-qr-pill expired">QR expirado</span>}
                          
                          <span className="wa-qr-timer">
                            {qrState === 'ready' ? `Código visible por ${qrSeconds}s` : qrState === 'expired' ? 'Código vencido' : 'Esperando...'}
                          </span>
                        </div>
                        <div className="wa-qr-display">
                          {qrLoading ? (
                            <div className="wa-qr-loading">
                              <span className="wa-spin"></span>
                              <span>Generando código QR...</span>
                              <small>La operación puede tardar unos segundos.</small>
                            </div>
                          ) : qrState === 'expired' ? (
                            <div className="wa-qr-aviso">
                              Código QR expirado.
                              <small>Por favor, haga clic en Actualizar para generar uno nuevo.</small>
                            </div>
                          ) : qrCodeValue ? (
                            <div 
                              className="wa-qr-generated" 
                              onClick={copyQrImageToClipboard}
                              title="Haz clic para copiar el código QR como imagen"
                              style={{ width: 'fit-content', margin: '0 auto', cursor: 'pointer', transition: 'transform 0.15s ease', display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 210, minHeight: 210 }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                              {qrDataUrl ? (
                                <img src={qrDataUrl} alt="WhatsApp QR Code" className="wa-qr-img" style={{ width: 210, height: 210, objectFit: 'contain', display: 'block', margin: '0' }} />
                              ) : (
                                <span className="spinner" style={{ width: '24px', height: '24px' }}></span>
                              )}
                            </div>
                          ) : (
                            <div className="wa-qr-aviso">
                              No se pudo obtener el QR.
                              <small>Por favor presione Actualizar o Reconectar e intente nuevamente.</small>
                            </div>
                          )}
                        </div>
                        <div className="wa-qr-track">
                          <span className="wa-qr-bar" style={{ width: `${qrState === 'ready' ? (qrSeconds / 60) * 100 : 0}%` }}></span>
                        </div>
                        <div className="wa-qr-foot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span className="wa-qr-helper" style={{ flex: 1, marginRight: '16px' }}>
                            {qrState === 'expired' 
                              ? 'Si ya escaneó el código, espere la conexión. De lo contrario, presione Actualizar.' 
                              : 'Escaneé el código con la cámara de su celular para vincular el dispositivo.'}
                          </span>
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button 
                              className="wa-btn-qr-refresh" 
                              type="button" 
                              disabled={!qrDataUrl}
                              onClick={copyQrImageToClipboard}
                              style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.15)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px' }}>
                                <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copiar QR
                            </button>
                            <button className="wa-btn-qr-refresh" type="button" onClick={() => handleRefreshQr(session.id)}>
                              {ICONS.refresh}Actualizar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="wa-device-actions">
                    <button className="wa-action-btn outline" type="button" onClick={() => handleToggleQr(session.id)}>
                      {ICONS.qr}
                      <span>{activeQrSessionId === session.id ? 'Cerrar QR' : 'Abrir QR'}</span>
                    </button>
                    <button className="wa-action-btn outline" type="button" onClick={() => handleReconnectSession(session.id)}>
                      {ICONS.refresh}
                      <span>Reconectar</span>
                    </button>
                    <button className="wa-action-btn outline" type="button" onClick={() => handleReplaceDevice(session.id)}>
                      {ICONS.switch}
                      <span>Reemplazar dispositivo</span>
                    </button>
                    <button className="wa-action-btn outline delete-btn" type="button" onClick={() => handleDeleteSession(session.id)} style={{ color: '#dc2626' }}>
                      {ICONS.trash}
                      <span>Eliminar dispositivo</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* MODAL ORIGINAL: CONFIGURAR DISPOSITIVO */}
      {showCreateModal && (
        <div className="ge-modal-overlay open" id="overlay-session" aria-hidden="false">
          <div className="ge-modal wa-modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
            <div className="wa-modal-head">
              <div className="wa-modal-icon" aria-hidden="true">
                {ICONS.phone}
              </div>
              <div>
                <h2 id="m-title">Configurar dispositivo</h2>
                <p className="wa-modal-sub" id="m-sub">Registre el dispositivo WhatsApp autorizado para esta sede.</p>
              </div>
              <button className="ge-icon-button wa-modal-close" onClick={() => setShowCreateModal(false)} type="button" aria-label="Cerrar">
                <svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveDevice}>
              <div className="wa-modal-body">
                <div className="wa-field">
                  <label className="wa-field-label" htmlFor="m-device">Nombre del dispositivo <span className="wa-opt">(requerido)</span></label>
                  <div className="wa-field-wrap">
                    <svg className="wa-field-icon" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    <input 
                      id="m-device" 
                      type="text" 
                      maxLength={100} 
                      placeholder="Ej. Moto G54 Lima" 
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
              <div className="wa-modal-foot">
                <button className="ge-ghost-btn" onClick={() => setShowCreateModal(false)} type="button">Cancelar</button>
                <button className="ge-primary-btn" type="submit">Guardar dispositivo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

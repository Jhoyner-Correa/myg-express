import type { ReactNode } from 'react';
import { FileText, MessageCircle, Mic, MoreVertical, Phone, Send } from 'lucide-react';
import type { QueueControl, SessionItem, TemplateItem } from '../types';

type Props = {
  session: SessionItem | null;
  template: TemplateItem | null;
  contactName: string;
  time: string;
  message: ReactNode;
  imageUrl: string;
  imageError: boolean;
  hasSession: boolean;
  queue: QueueControl | null;
  sending: boolean;
  onImageError: () => void;
  onOpenTemplates: () => void;
  onOpenControl: () => void;
  onConfirmSend: () => void;
};

export function MessageComposer(props: Props) {
  const sessionState = props.session?.estado_real === 'connected' ? 'is-active' : props.session?.estado_real === 'auth_failure' ? 'is-error' : 'is-inactive';
  return <aside className="workspace-side"><article className="composer-panel">
    <header className="composer-panel-header"><h2 className="composer-panel-title">Compositor de envío</h2><p className="composer-panel-sub">Redacta y revisa el mensaje antes de enviarlo.</p></header>
    <div className="composer-panel-body">
      <div className="composer-session-card"><div className="session-card-left"><MessageCircle className="session-card-icon" size={18} /><div className="session-card-body"><span className="session-card-label">Sesión</span><div className="session-card-value"><span className={`session-indicator ${props.session ? sessionState : ''}`} /><span>{props.session ? `${props.session.nombre_dispositivo || props.session.nombre}${props.session.numero_whatsapp ? ` · ${props.session.numero_whatsapp}` : ''}` : 'Sin sesión disponible'}</span></div></div></div></div>
      <div className="template-block"><div className="template-row"><span className="template-label">Plantilla</span><button className="template-chip" type="button" onClick={props.onOpenTemplates}><FileText className="template-chip-icon" size={16} /><span className="template-chip-name">{props.template?.nombre || 'Seleccionar plantilla'}</span></button><button className="btn-ver-plantillas" onClick={props.onOpenTemplates} type="button">Ver plantillas</button></div></div>
      <div className="preview-section-label">Vista previa</div><div className="composer-body"><div className="preview-block"><div className="phone-stage"><div className="phone-frame"><div className="phone-screen">
        <div className="phone-notch" /><div className="phone-statusbar"><span className="sb-time">{props.time}</span></div>
        <div className="wa-header"><div className="wa-avatar">MG</div><div className="wa-info"><div className="wa-name">{props.contactName}</div><div className="wa-online">{props.hasSession ? 'En sesión elegida' : 'Sin sesión seleccionada'}</div></div><div className="wa-actions" aria-hidden="true"><Phone /><MoreVertical /></div></div>
        <div className="wa-body"><div className="wa-date-chip">HOY</div>{props.message ? <div className="wa-bubble">{props.imageUrl && (props.imageError ? <div className="wa-image-missing">Imagen no disponible</div> : <img src={props.imageUrl} className="wa-bubble-img" alt="Adjunto de la plantilla" loading="lazy" onError={props.onImageError} />)}<div>{props.message}</div><div className="wa-btime"><span>{props.time}</span></div></div> : <div className="preview-empty-lbl">Selecciona una plantilla</div>}</div>
        <div className="wa-footer"><Mic aria-hidden="true" /><div className="wa-input-fake">Escribe un mensaje...</div><Send aria-hidden="true" /></div>
      </div><div className="phone-bottombar"><div className="phone-home-bar" /></div></div></div></div>
      {props.queue?.isProcessing ? <button className="send-btn is-processing" disabled>Envío en curso</button> : props.queue?.isPaused || props.queue?.hasInterruptedFlow ? <button className="send-btn is-paused" onClick={props.onOpenControl}>Retomar envío</button> : <button className="send-btn normal" onClick={props.onConfirmSend} disabled={props.sending}>Enviar mensajes</button>}
    </div></div>
  </article></aside>;
}

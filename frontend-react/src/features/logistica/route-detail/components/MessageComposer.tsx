import type { ReactNode } from 'react';
import { FileText, MessageCircle, Mic, MoreVertical, Phone, Send } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import type { QueueControl, SessionItem, TemplateItem } from '../types';
import styles from './MessageComposer.module.css';

interface MessageComposerProps {
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
}

export function MessageComposer({
  session,
  template,
  contactName,
  time,
  message,
  imageUrl,
  imageError,
  hasSession,
  queue,
  sending,
  onImageError,
  onOpenTemplates,
  onOpenControl,
  onConfirmSend,
}: MessageComposerProps) {
  const sessionTone = session?.estado_real === 'connected'
    ? styles.online
    : session?.estado_real === 'auth_failure'
      ? styles.error
      : styles.offline;
  const interrupted = Boolean(queue?.isPaused || queue?.hasInterruptedFlow);

  return (
    <aside className={styles.sidebar}>
      <article className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2>Compositor de envío</h2>
            <p>Redacta y revisa el mensaje antes de enviarlo.</p>
          </div>
          <MessageCircle size={18} aria-hidden="true" />
        </header>

        <div className={styles.body}>
          <div className={styles.sessionCard}>
            <span className={`${styles.sessionDot} ${sessionTone}`} aria-hidden="true" />
            <div>
              <span>Sesión</span>
              <strong>
                {session
                  ? `${session.nombre_dispositivo || session.nombre}${session.numero_whatsapp ? ` · ${session.numero_whatsapp}` : ''}`
                  : 'Sin sesión disponible'}
              </strong>
            </div>
          </div>

          <div className={styles.templateRow}>
            <div>
              <span>Plantilla activa</span>
              <strong>
                <FileText size={14} aria-hidden="true" />
                {template?.nombre || 'Sin seleccionar'}
              </strong>
            </div>
            <Button variant="secondary" size="sm" onClick={onOpenTemplates}>
              Ver plantillas
            </Button>
          </div>

          <span className={styles.previewLabel}>Vista previa</span>

          <div className={styles.phoneStage}>
            <div className={styles.phone}>
              <div className={styles.notch} aria-hidden="true" />
              <div className={styles.statusBar}>{time}</div>

              <div className={styles.whatsappHeader}>
                <span className={styles.avatar}>MG</span>
                <div className={styles.contact}>
                  <strong>{contactName}</strong>
                  <span>{hasSession ? 'Sesión seleccionada' : 'Sin sesión seleccionada'}</span>
                </div>
                <span className={styles.whatsappActions} aria-hidden="true">
                  <Phone size={14} />
                  <MoreVertical size={15} />
                </span>
              </div>

              <div className={styles.chat}>
                <span className={styles.day}>HOY</span>
                {message ? (
                  <div className={styles.bubble}>
                    {imageUrl && (
                      imageError ? (
                        <div className={styles.imageMissing}>Imagen no disponible</div>
                      ) : (
                        <img
                          src={imageUrl}
                          className={styles.attachment}
                          alt="Adjunto de la plantilla"
                          loading="lazy"
                          onError={onImageError}
                        />
                      )
                    )}
                    {message}
                    <span className={styles.messageTime}>{time}</span>
                  </div>
                ) : (
                  <span className={styles.empty}>Selecciona una plantilla</span>
                )}
              </div>

              <div className={styles.whatsappFooter}>
                <Mic size={15} aria-hidden="true" />
                <span>Escribe un mensaje...</span>
                <Send size={15} aria-hidden="true" />
              </div>
            </div>
          </div>

          {queue?.isProcessing ? (
            <Button className={styles.sendButton} disabled>
              Envío en curso
            </Button>
          ) : interrupted ? (
            <Button className={styles.sendButton} variant="secondary" onClick={onOpenControl}>
              Retomar envío
            </Button>
          ) : (
            <Button
              className={styles.sendButton}
              loading={sending}
              onClick={onConfirmSend}
            >
              Enviar mensajes
            </Button>
          )}
        </div>
      </article>
    </aside>
  );
}

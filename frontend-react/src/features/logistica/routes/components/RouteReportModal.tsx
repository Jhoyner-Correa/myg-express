import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Clipboard, MessageCircleOff, Send, TriangleAlert } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { showToast } from '../../../../core/utils/toast';
import type { ReportSummary, RouteNoticeSummaryItem } from '../types';
import styles from './RouteReportModal.module.css';

type RouteReportModalProps = {
  open: boolean;
  loading: boolean;
  routeName: string;
  data: ReportSummary | null;
  onClose: () => void;
};

type DetailType = 'manual' | 'noWhatsapp' | null;

export function RouteReportModal({ open, loading, routeName, data, onClose }: RouteReportModalProps) {
  const [detail, setDetail] = useState<DetailType>(null);

  useEffect(() => {
    if (!open) setDetail(null);
  }, [open]);

  const processed = data ? data.enviados + data.manuales : 0;
  const progress = data && data.total > 0 ? Math.round((processed / data.total) * 100) : 0;

  return (
    <Modal
      open={open}
      title="Reporte de ruta"
      description={`${routeName || 'Ruta seleccionada'} · Resumen operativo de mensajería`}
      maxWidth={650}
      onClose={onClose}
    >
      {loading && <div className={styles.loading}><span aria-hidden="true" /><p>Procesando reporte…</p></div>}

      {!loading && data && (
        <div className={styles.report}>
          <section className={styles.summary} aria-label="Progreso de procesamiento">
            <div className={styles.summaryHeader}>
              <span><strong>{processed}</strong> de {data.total} procesados</span>
              <strong>{progress}%</strong>
            </div>
            <div className={styles.progress} aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          </section>

          <div className={styles.statusList}>
            <StatusRow label="Pendientes" value={data.pendientes} total={data.total} tone="warning" />
            <StatusRow label="Enviados" value={data.enviados} total={data.total} tone="success" icon={<Send />} />
            <StatusRow
              label="Envío manual"
              value={data.manuales}
              total={data.total}
              tone="info"
              icon={<Check />}
              expanded={detail === 'manual'}
              onClick={data.manuales > 0 ? () => setDetail(value => value === 'manual' ? null : 'manual') : undefined}
            />
            {detail === 'manual' && <ContactDetail title="Envíos manuales" items={data.manualList} />}
            <StatusRow
              label="Sin WhatsApp"
              value={data.sinWhatsapp}
              total={data.total}
              tone="violet"
              icon={<MessageCircleOff />}
              expanded={detail === 'noWhatsapp'}
              onClick={data.sinWhatsapp > 0 ? () => setDetail(value => value === 'noWhatsapp' ? null : 'noWhatsapp') : undefined}
            />
            {detail === 'noWhatsapp' && <ContactDetail title="Clientes sin WhatsApp" items={data.nowaList} />}
            <StatusRow label="Fallidos" value={data.fallidos} total={data.total} tone="danger" icon={<TriangleAlert />} />
          </div>
        </div>
      )}

      {!loading && !data && <div className={styles.error}>No se pudo cargar el reporte de esta ruta.</div>}
    </Modal>
  );
}

type StatusRowProps = {
  label: string;
  value: number;
  total: number;
  tone: 'warning' | 'success' | 'info' | 'violet' | 'danger';
  icon?: ReactNode;
  expanded?: boolean;
  onClick?: () => void;
};

function StatusRow({ label, value, total, tone, icon, expanded, onClick }: StatusRowProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  const content = (
    <>
      <span className={styles.statusIcon}>{icon ?? <span />}</span>
      <span className={styles.statusCopy}><span>{label}</span><span className={styles.bar}><span style={{ width: `${percentage}%` }} /></span></span>
      <strong>{value}</strong>
      {onClick && <ChevronDown className={expanded ? styles.expanded : ''} aria-hidden="true" />}
    </>
  );
  return onClick
    ? <button className={`${styles.statusRow} ${styles[tone]}`} type="button" onClick={onClick} aria-expanded={expanded}>{content}</button>
    : <div className={`${styles.statusRow} ${styles[tone]}`}>{content}</div>;
}

function ContactDetail({ title, items }: { title: string; items: RouteNoticeSummaryItem[] }) {
  const copy = async (item: RouteNoticeSummaryItem) => {
    const text = `${item.nombre || '-'}\t${item.telefono || '-'}\t${item.codigo_paquete || '-'}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Registro copiado al portapapeles.', 'success', { title: 'Copiado' });
    } catch {
      showToast('No se pudo copiar el registro.', 'error', { title: 'Error' });
    }
  };

  return (
    <section className={styles.detail}>
      <header><strong>{title}</strong><span>{items.length}</span></header>
      <div className={styles.detailRows}>
        {items.map((item, index) => (
          <div className={styles.contact} key={item.id ?? `${item.codigo_paquete}-${index}`}>
            <span><strong>{item.nombre || 'Sin nombre'}</strong><small>{item.telefono || 'Sin teléfono'} · {item.codigo_paquete || 'Sin código'}</small></span>
            <button type="button" onClick={() => copy(item)} aria-label={`Copiar datos de ${item.nombre || 'cliente'}`}><Clipboard aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Clipboard, MessageCircleOff, TriangleAlert } from 'lucide-react';
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
type StatusTone = 'pending' | 'sent' | 'manual' | 'noWhatsapp' | 'failed';

export function RouteReportModal({ open, loading, routeName, data, onClose }: RouteReportModalProps) {
  const [detail, setDetail] = useState<DetailType>(null);

  useEffect(() => {
    setDetail(null);
  }, [open, routeName]);

  const processed = data ? data.enviados + data.manuales : 0;
  const progress = percentage(processed, data?.total ?? 0);

  return (
    <Modal
      open={open}
      title="Reporte de ruta"
      description={`${routeName || 'Ruta seleccionada'} · Resumen operativo y detalle de avisos.`}
      maxWidth={720}
      onClose={onClose}
      className={styles.modal}
    >
      {loading && (
        <div className={styles.loading} role="status">
          <span aria-hidden="true" />
          <strong>Calculando métricas</strong>
          <p>Estamos consolidando los resultados de la ruta.</p>
        </div>
      )}

      {!loading && data && (
        <div className={styles.report}>
          <section className={styles.summaryGrid} aria-label="Resumen del reporte">
            <article className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Total de registros</span>
              <strong className={styles.summaryValue}>{data.total}</strong>
              <p>Destinatarios incluidos en la ruta</p>
            </article>

            <article className={`${styles.summaryCard} ${styles.processedCard}`}>
              <div className={styles.processedHeading}>
                <span className={styles.summaryLabel}>Procesados</span>
                <span className={styles.progressBadge}>{progress}%</span>
              </div>
              <strong className={styles.summaryValue}>{processed}</strong>
              <div className={styles.summaryProgress} aria-label={`${progress}% procesado`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </article>
          </section>

          <div className={styles.sectionTitle}><span>Desglose de estados</span></div>

          <section className={styles.breakdown} aria-label="Desglose de estados">
            <StatusRow label="Pendientes" value={data.pendientes} total={data.total} tone="pending" />
            <StatusRow label="Enviados" value={data.enviados} total={data.total} tone="sent" />
            <StatusRow
              label="Envío manual"
              value={data.manuales}
              total={data.total}
              tone="manual"
              expanded={detail === 'manual'}
              onClick={data.manuales > 0
                ? () => setDetail(value => value === 'manual' ? null : 'manual')
                : undefined}
            />
            <StatusRow
              label="Sin WhatsApp"
              value={data.sinWhatsapp}
              total={data.total}
              tone="noWhatsapp"
              expanded={detail === 'noWhatsapp'}
              onClick={data.sinWhatsapp > 0
                ? () => setDetail(value => value === 'noWhatsapp' ? null : 'noWhatsapp')
                : undefined}
            />
            <StatusRow label="Fallidos / errores" value={data.fallidos} total={data.total} tone="failed" />
          </section>

          {detail === 'manual' && (
            <ContactDetail
              title="Envíos manuales"
              items={data.manualList}
              tone="manual"
              icon={<Check aria-hidden="true" />}
            />
          )}

          {detail === 'noWhatsapp' && (
            <ContactDetail
              title="Clientes sin WhatsApp"
              items={data.nowaList}
              tone="noWhatsapp"
              icon={<MessageCircleOff aria-hidden="true" />}
            />
          )}
        </div>
      )}

      {!loading && !data && (
        <div className={styles.error} role="alert">
          <span><TriangleAlert aria-hidden="true" /></span>
          <strong>No se pudo cargar el reporte</strong>
          <p>Vuelve a cerrarlo e intenta nuevamente.</p>
        </div>
      )}
    </Modal>
  );
}

type StatusRowProps = {
  label: string;
  value: number;
  total: number;
  tone: StatusTone;
  expanded?: boolean;
  onClick?: () => void;
};

function StatusRow({ label, value, total, tone, expanded, onClick }: StatusRowProps) {
  const valuePercentage = percentage(value, total);
  const content = (
    <>
      <span className={styles.statusDot} aria-hidden="true" />
      <span className={styles.statusLabel}>
        <span>{label}</span>
        {onClick && <ChevronDown className={expanded ? styles.expanded : ''} aria-hidden="true" />}
      </span>
      <span className={styles.statusBar} aria-hidden="true">
        <span style={{ width: `${valuePercentage}%` }} />
      </span>
      <strong className={styles.statusValue}>{value}</strong>
    </>
  );

  const className = `${styles.statusRow} ${styles[tone]} ${onClick ? styles.clickable : ''}`;
  return onClick
    ? (
        <button className={className} type="button" onClick={onClick} aria-expanded={expanded}>
          {content}
        </button>
      )
    : <div className={className}>{content}</div>;
}

type ContactDetailProps = {
  title: string;
  items: RouteNoticeSummaryItem[];
  tone: 'manual' | 'noWhatsapp';
  icon: ReactNode;
};

function ContactDetail({ title, items, tone, icon }: ContactDetailProps) {
  const toneClass = tone === 'manual' ? styles.manualDetail : styles.noWhatsappDetail;
  const copyText = async (text: string, successMessage: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success', { title: 'Copiado' });
    } catch {
      showToast('No se pudieron copiar los datos.', 'error', { title: 'Error' });
    }
  };

  const copyItem = (item: RouteNoticeSummaryItem) => copyText(
    `${item.nombre || '-'}\t${item.telefono || '-'}\t${item.codigo_paquete || '-'}`,
    'Registro copiado al portapapeles.',
  );

  const copyAll = () => copyText(
    items.map((item, index) => [
      `${index + 1}. ${item.nombre || '-'}`,
      `   • Teléfono: ${item.telefono || '-'}`,
      `   • Código: ${item.codigo_paquete || '-'}`,
    ].join('\n')).join('\n\n'),
    'Todos los registros fueron copiados.',
  );

  return (
    <section className={`${styles.detail} ${toneClass}`} aria-label={title}>
      <header className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <span className={styles.detailIcon}>{icon}</span>
          <strong>{title}</strong>
          <span className={styles.detailCount}>{items.length}</span>
        </div>
        {items.length > 1 && (
          <button className={styles.copyAll} type="button" onClick={copyAll}>
            <Clipboard aria-hidden="true" />Copiar todo
          </button>
        )}
      </header>

      <div className={styles.tableWrapper}>
        <table className={styles.detailTable}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Código</th>
              <th><span className={styles.srOnly}>Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? `${item.codigo_paquete}-${index}`}>
                <td title={item.nombre || 'Sin nombre'}>{item.nombre || 'Sin nombre'}</td>
                <td><span className={styles.phone}>{item.telefono || '-'}</span></td>
                <td><span className={styles.code}>{item.codigo_paquete || '-'}</span></td>
                <td>
                  <button
                    className={styles.copyRow}
                    type="button"
                    onClick={() => copyItem(item)}
                    aria-label={`Copiar datos de ${item.nombre || 'cliente'}`}
                  >
                    <Clipboard aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

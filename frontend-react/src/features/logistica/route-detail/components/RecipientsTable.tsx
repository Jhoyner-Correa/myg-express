import {
  Check,
  Download,
  Filter,
  Pencil,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import {
  formatDateTime,
  formatEstadoLabel,
  normalizeAvisoVisualStatus,
  type NoticeVisualStatus,
} from '../domain';
import type { NoticeItem } from '../types';
import styles from './RecipientsTable.module.css';

interface RecipientsTableProps {
  notices: NoticeItem[];
  filteredNotices: NoticeItem[];
  search: string;
  status: string;
  showFilters: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onToggleFilters: () => void;
  onClear: () => void;
  onImport: () => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onExport: () => void;
}

const filters = [
  ['todos', 'Todos'],
  ['pendiente', 'Pendiente'],
  ['enviado', 'Enviado'],
  ['manual', 'Manual'],
  ['entregado', 'Entregado'],
  ['fallido', 'Fallido'],
  ['sin-whatsapp', 'Sin WhatsApp'],
] as const;

const statusStyles = {
  pendiente: styles.pending,
  enviando: styles.processing,
  enviado: styles.sent,
  manual: styles.manual,
  'sin-whatsapp': styles.muted,
  fallido: styles.failed,
} satisfies Record<NoticeVisualStatus, string | undefined>;

export function RecipientsTable({
  notices,
  filteredNotices,
  search,
  status,
  showFilters,
  onSearchChange,
  onStatusChange,
  onToggleFilters,
  onClear,
  onImport,
  onCreate,
  onDelete,
  onExport,
}: RecipientsTableProps) {
  const filtered = search.trim().length > 0 || status !== 'todos';
  const resultText = notices.length === 0
    ? 'Sin destinatarios para mostrar'
    : filtered
      ? `Mostrando ${filteredNotices.length} de ${notices.length} destinatarios`
      : `Mostrando ${filteredNotices.length} destinatarios`;

  return (
    <article className={styles.card} id="tab-content-list">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}>
            <Users size={17} aria-hidden="true" />
          </span>
          <div>
            <h2>
              Destinatarios <span>{notices.length}</span>
            </h2>
            <p>Consulta, filtra y organiza los registros listos para envío.</p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Buscar destinatario</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar destinatario..."
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            icon={<Filter size={14} />}
            aria-expanded={showFilters}
            onClick={onToggleFilters}
          >
            Filtros
          </Button>
          <Button variant="secondary" size="sm" onClick={onClear}>
            Vaciar
          </Button>
          <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={onImport}>
            Subir Excel
          </Button>
          <Button size="sm" icon={<UserPlus size={14} />} onClick={onCreate}>
            Nuevo
          </Button>
        </div>
      </header>

      {showFilters && (
        <div className={styles.filters} aria-label="Filtrar destinatarios por estado">
          <span>Estado:</span>
          {filters.map(([key, label]) => (
            <button
              key={key}
              className={`${styles.filterChip} ${status === key ? styles.activeFilter : ''}`}
              onClick={() => onStatusChange(key)}
              type="button"
              aria-pressed={status === key}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>Nro.</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Código paquete</th>
              <th>Estado</th>
              <th>Fecha envío</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredNotices.length > 0 ? (
              filteredNotices.map((notice, index) => {
                const visual = normalizeAvisoVisualStatus(notice.estado_aviso);

                return (
                  <tr key={notice.id}>
                    <td><span className={styles.rowNumber}>{index + 1}</span></td>
                    <td className={styles.name}>{notice.nombre || '-'}</td>
                    <td><span className={styles.phone}>{notice.telefono || '-'}</span></td>
                    <td>{notice.codigo_paquete || '-'}</td>
                    <td>
                      <span className={`${styles.status} ${statusStyles[visual]}`}>
                        {visual === 'enviado' ? (
                          <Check size={12} aria-hidden="true" />
                        ) : visual === 'manual' ? (
                          <Pencil size={12} aria-hidden="true" />
                        ) : (
                          <span className={styles.statusDot} aria-hidden="true" />
                        )}
                        {formatEstadoLabel(notice.estado_aviso)}
                      </span>
                    </td>
                    <td>{notice.fecha_envio ? formatDateTime(notice.fecha_envio) : '-'}</td>
                    <td className={styles.actionsCell}>
                      <button
                        className={styles.deleteButton}
                        onClick={() => onDelete(notice.id)}
                        aria-label={`Eliminar a ${notice.nombre || 'destinatario'}`}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  No hay destinatarios registrados con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className={styles.footer}>
        <span>{resultText}</span>
        <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={onExport}>
          Exportar
        </Button>
      </footer>
    </article>
  );
}

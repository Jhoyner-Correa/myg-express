import { Check, Download, Filter, Pencil, Search, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { formatDateTime, formatEstadoLabel, normalizeAvisoVisualStatus } from '../domain';
import type { NoticeItem } from '../types';

type Props = {
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
};

const FILTERS = [
  ['todos', 'Todos'], ['pendiente', 'Pendiente'], ['enviado', 'Enviado'], ['manual', 'Manual'],
  ['entregado', 'Entregado'], ['fallido', 'Fallido'], ['sin-whatsapp', 'Sin WhatsApp'],
] as const;

export function RecipientsTable(props: Props) {
  const filtered = props.search.trim() || props.status !== 'todos';
  const meta = props.notices.length === 0
    ? 'Sin destinatarios para mostrar'
    : filtered ? `Mostrando ${props.filteredNotices.length} de ${props.notices.length} destinatarios`
      : `Mostrando ${props.filteredNotices.length} destinatarios`;

  return (
    <article className="table-card" id="tab-content-list">
      <header className="card-header table-card-header">
        <div className="table-header-left"><Users className="table-header-icon" size={18} /><div>
          <h2 className="card-title card-title-with-count">Destinatarios <span className="title-count-pill">{props.notices.length}</span></h2>
          <p className="card-subtitle">Consulta, filtra y organiza los registros listos para envío.</p>
        </div></div>
        <div className="toolbar-right">
          <label className="search-wrap"><Search aria-hidden="true" /><span className="sr-only">Buscar destinatario</span><input value={props.search} onChange={e => props.onSearchChange(e.target.value)} placeholder="Buscar destinatario..." /></label>
          <button className="btn-soft" onClick={props.onToggleFilters} type="button"><Filter size={13} /> Filtros</button>
          <button className="btn-soft" onClick={props.onClear} type="button">Vaciar ruta</button>
          <button className="btn-soft btn-import-open" onClick={props.onImport} type="button"><Upload size={14} /> Subir Excel</button>
          <button className="btn-primary" onClick={props.onCreate} type="button"><UserPlus size={14} /> Nuevo</button>
        </div>
      </header>
      {props.showFilters && <div className="filter-panel open"><span className="filter-label">Estado:</span>{FILTERS.map(([key, label]) => (
        <button key={key} className={`filter-chip ${props.status === key ? 'active' : ''}`} onClick={() => props.onStatusChange(key)} type="button">{label}</button>
      ))}</div>}
      <div className="table-scroll"><table><thead><tr><th>Nro.</th><th>Nombre</th><th>Teléfono</th><th>Código paquete</th><th>Estado</th><th>Fecha envío</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{props.filteredNotices.length ? props.filteredNotices.map((notice, index) => {
          const visual = normalizeAvisoVisualStatus(notice.estado_aviso);
          return <tr key={notice.id}><td><span className="aviso-id">{index + 1}</span></td><td className="aviso-nombre">{notice.nombre || '-'}</td><td><span className="telefono-badge">{notice.telefono || '-'}</span></td><td>{notice.codigo_paquete || '-'}</td><td><span className={`estado-badge estado-${visual}`}>{visual === 'enviado' ? <Check size={12} /> : visual === 'manual' ? <Pencil size={12} /> : <span className={`dot dot-${visual}`} />}{formatEstadoLabel(notice.estado_aviso)}</span></td><td>{notice.fecha_envio ? formatDateTime(notice.fecha_envio) : <span className="sin-envio">-</span>}</td><td><button className="btn-row-delete" onClick={() => props.onDelete(notice.id)} title="Eliminar" type="button"><Trash2 size={15} /></button></td></tr>;
        }) : <tr><td colSpan={7} className="empty-row">No hay destinatarios registrados en esta ruta.</td></tr>}</tbody>
      </table></div>
      <footer className="table-card-footer"><span className="tabla-count-label">{meta}</span><button type="button" className="btn-export-avisos" onClick={props.onExport}><Download size={13} /> Exportar</button></footer>
    </article>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardList, Filter, SearchX } from 'lucide-react';
import { displayText, formatGuide, formatLocality, formatPhone } from '../domain';
import type { ContractFilter, UrbanoRecord } from '../types';
import styles from '../RouteLookup.module.css';

type Props = {
  routeId: string;
  records: UrbanoRecord[];
  totalRecords: number;
  totalGuides: number;
  localityCount: number;
  contractFilter: ContractFilter;
  loading: boolean;
  error?: string;
  onContractFilter: (value: ContractFilter) => void;
};

export function RouteLookupResults(props: Props) {
  return (
    <section className={styles.resultsCard} aria-labelledby="lookup-results-title">
      <header className={styles.resultsHeader}>
        <div className={styles.resultsTitle}><span><ClipboardList /></span><div><h2 id="lookup-results-title">Resultados</h2><p>{resultSummary(props)}</p></div></div>
        <dl className={styles.metrics}>
          <Metric label="Ruta" value={props.routeId || '—'} />
          <Metric label="Guías" value={String(props.totalGuides)} />
          <Metric label="Registros" value={String(props.totalRecords)} />
          <Metric label="Localidades" value={String(props.localityCount)} />
        </dl>
      </header>
      {props.loading ? <LoadingRows /> : props.error ? <Empty title="No se pudo consultar la ruta" detail={props.error} /> : props.totalRecords ? (
        <div className={styles.tableRegion} role="region" aria-label="Registros de la ruta" tabIndex={0}>
          <table>
            <thead><tr><th>Ruta</th><th>Guía</th><th>Rastreo</th><th>Cliente</th><th>Teléfono</th><th><ContractMenu value={props.contractFilter} onChange={props.onContractFilter} /></th><th>Localidad</th></tr></thead>
            <tbody>{props.records.length
              ? props.records.map((item, index) => <tr key={`${item.routeId}-${item.guia}-${item.rastreo}-${index}`}><td className={styles.routeCode}>{displayText(item.routeId)}</td><td className={styles.mono}>{formatGuide(item.guia)}</td><td className={styles.mono}>{displayText(item.rastreo)}</td><td className={styles.client}>{displayText(item.cliente)}</td><td className={styles.phone}>{formatPhone(item.telefono)}</td><td className={styles.contract}>{displayText(item.contrato)}</td><td><span className={styles.locality}>{formatLocality(item.localidad)}</span></td></tr>)
              : <tr className={styles.noMatches}><td colSpan={7}><strong>Sin coincidencias</strong><span>Ajusta o limpia los filtros para volver a mostrar registros.</span></td></tr>}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Sin resultados aún" detail="Ingresa un número de ruta y selecciona Consultar ruta." />}
      {!props.loading && props.totalRecords > 0 && <footer className={styles.resultsFooter}>Mostrando {props.records.length} de {props.totalRecords} registros</footer>}
    </section>
  );
}

function ContractMenu({ value, onChange }: { value: ContractFilter; onChange: (value: ContractFilter) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options: Array<{ value: ContractFilter; label: string }> = [{ value: '', label: 'Todos' }, { value: 'temu', label: 'Solo Temu' }, { value: 'no-temu', label: 'Sin Temu' }];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  return (
    <div className={styles.contractFilter} ref={rootRef}>
      <button type="button" className={value ? styles.active : ''} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(current => !current)}>Contrato<Filter /></button>
      {open && <div className={styles.contractMenu} role="menu">{options.map(option => <button type="button" role="menuitemradio" aria-checked={option.value === value} className={option.value === value ? styles.selected : ''} key={option.label} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.value === value && <Check />}</span>{option.label}</button>)}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className={styles.empty}><span><SearchX /></span><strong>{title}</strong><p>{detail}</p></div>; }
function LoadingRows() { return <div className={styles.loading} aria-label="Consultando ruta">{[1, 2, 3, 4, 5].map(item => <i key={item} />)}</div>; }
function resultSummary(props: Props) { if (props.loading) return 'Consultando información en Urbano...'; if (props.error) return 'La consulta no pudo completarse.'; if (props.totalRecords) return `${props.totalRecords} registros recuperados`; return 'Consulta una ruta para visualizar los registros.'; }

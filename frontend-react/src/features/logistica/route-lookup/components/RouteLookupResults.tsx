import { ClipboardList, SearchX } from 'lucide-react';
import { displayText, formatGuide, formatLocality, formatPhone } from '../domain';
import type { UrbanoRecord } from '../types';
import styles from '../RouteLookup.module.css';

type Props = {
  routeId: string;
  records: UrbanoRecord[];
  totalRecords: number;
  localityCount: number;
  loading: boolean;
  error?: string;
};

export function RouteLookupResults(props: Props) {
  return (
    <section className={styles.resultsCard} aria-labelledby="lookup-results-title">
      <header className={styles.resultsHeader}>
        <div className={styles.resultsTitle}><span><ClipboardList /></span><div><h2 id="lookup-results-title">Resultados</h2><p>{resultSummary(props)}</p></div></div>
        <dl className={styles.metrics}>
          <Metric label="Ruta" value={props.routeId || 'â€”'} />
          <Metric label="GuÃ­as" value={String(props.totalRecords)} />
          <Metric label="Localidades" value={String(props.localityCount)} />
        </dl>
      </header>
      {props.loading ? <LoadingRows /> : props.error ? <Empty title="No se pudo consultar la ruta" detail={props.error} /> : props.records.length ? (
        <div className={styles.tableRegion} role="region" aria-label="Registros de la ruta" tabIndex={0}>
          <table>
            <thead><tr><th>Ruta</th><th>GuÃ­a</th><th>Rastreo</th><th>Cliente</th><th>TelÃ©fono</th><th>Contrato</th><th>Localidad</th></tr></thead>
            <tbody>{props.records.map((item, index) => <tr key={`${item.routeId}-${item.guia}-${item.rastreo}-${index}`}><td className={styles.mono}>{displayText(item.routeId)}</td><td className={styles.mono}>{formatGuide(item.guia)}</td><td className={styles.mono}>{displayText(item.rastreo)}</td><td className={styles.client}>{displayText(item.cliente)}</td><td>{formatPhone(item.telefono)}</td><td>{displayText(item.contrato)}</td><td><span className={styles.locality}>{formatLocality(item.localidad)}</span></td></tr>)}</tbody>
          </table>
        </div>
      ) : <Empty title={props.totalRecords ? 'Sin coincidencias' : 'Sin resultados aÃºn'} detail={props.totalRecords ? 'Ajusta los filtros para volver a mostrar registros.' : 'Ingresa un nÃºmero de ruta para consultar sus guÃ­as.'} />}
      {!props.loading && props.records.length > 0 && <footer className={styles.resultsFooter}>{props.records.length} de {props.totalRecords} registros visibles</footer>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className={styles.empty}><span><SearchX /></span><strong>{title}</strong><p>{detail}</p></div>; }
function LoadingRows() { return <div className={styles.loading} aria-label="Consultando ruta">{[1, 2, 3, 4, 5].map(item => <i key={item} />)}</div>; }
function resultSummary(props: Props) { if (props.loading) return 'Consultando informaciÃ³n en Urbano...'; if (props.error) return 'La consulta no pudo completarse.'; if (props.totalRecords) return `${props.totalRecords} registros recuperados`; return 'Consulta una ruta para visualizar registros.'; }

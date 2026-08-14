import { MapPinned, RadioTower } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import styles from './Gps.module.css';

export function Gps() {
  return <main className={`main ${styles.page}`} id="main-content">
    <PageHeader icon={<MapPinned />} title="Rastreo GPS" subtitle="Ubicación operativa y recorridos del personal autorizado" metadata="Alcance empresarial" />
    <section className={styles.content}>
      <article className={styles.card}>
        <header className={styles.cardHeader}><div><h2>Monitoreo en tiempo real</h2><p>Posición más reciente de los colaboradores con seguimiento continuo.</p></div><span className={styles.status}><i />Esperando transmisiones</span></header>
        <div className={styles.mapStage}>
          <div className={styles.empty}><span><RadioTower /></span><h3>Sin ubicaciones activas</h3><p>El mapa mostrará colaboradores cuando una jornada con rastreo continuo esté activa y la aplicación móvil esté transmitiendo ubicación.</p><div className={styles.facts}><div><strong>Solo autorizados</strong><small>Control por cargo</small></div><div><strong>Por jornada</strong><small>Inicio y cierre definidos</small></div><div><strong>Con auditoría</strong><small>Historial trazable</small></div></div></div>
        </div>
      </article>
    </section>
  </main>;
}

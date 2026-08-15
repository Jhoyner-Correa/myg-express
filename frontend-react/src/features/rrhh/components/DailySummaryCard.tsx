import type { CSSProperties } from 'react';
import { RefreshCw, UsersRound } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import type { AttendanceDashboard } from '../types';
import styles from './WorkforceAnalytics.module.css';

type Props = {
  attendance: AttendanceDashboard | null;
  trackedEmployees: number;
  refreshing: boolean;
  onRefresh: () => void;
};

export function DailySummaryCard({ attendance, trackedEmployees, refreshing, onRefresh }: Props) {
  const summary = attendance?.summary;
  const attendanceRate = summary?.total_employees
    ? Math.round(summary.present / summary.total_employees * 100)
    : 0;

  return <article className={styles.card}>
    <header>
      <div>
        <span className={styles.violetIcon}><UsersRound /></span>
        <div><h2>Resumen del día</h2><p>Cobertura operativa actual</p></div>
      </div>
      <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={refreshing} onClick={onRefresh}>Actualizar</Button>
    </header>
    <div className={styles.summaryBody}>
      <div className={styles.summaryRing} style={{ '--attendance-progress': `${attendanceRate}%` } as CSSProperties}>
        <div><strong>{attendanceRate}%</strong><span>Asistencia</span></div>
      </div>
      <ul>
        <li><i className={styles.green} /><span>Con asistencia</span><strong>{summary?.present ?? 0}</strong></li>
        <li><i className={styles.amber} /><span>Tardanzas incluidas</span><strong>{summary?.late ?? 0}</strong></li>
        <li><i className={styles.gray} /><span>Sin registrar</span><strong>{summary?.without_record ?? 0}</strong></li>
        <li><i className={styles.indigo} /><span>Con rastreo GPS</span><strong>{trackedEmployees}</strong></li>
      </ul>
    </div>
  </article>;
}

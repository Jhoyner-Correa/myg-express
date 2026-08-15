import { BarChart3, ChartNoAxesCombined } from 'lucide-react';
import type { AttendanceTrendPoint, Employee } from '../types';
import { summarizeHeadcount } from './analytics-domain';
import styles from './WorkforceAnalytics.module.css';

type Props = {
  trend: AttendanceTrendPoint[];
  employees: Employee[];
};

const CHART_LEFT = 36;
const CHART_RIGHT = 486;
const CHART_TOP = 18;
const CHART_BOTTOM = 112;

function chartX(index: number, length: number) {
  return length <= 1 ? (CHART_LEFT + CHART_RIGHT) / 2 : CHART_LEFT + index * (CHART_RIGHT - CHART_LEFT) / (length - 1);
}

function chartY(value: number) {
  return CHART_BOTTOM - Math.max(0, Math.min(100, value)) / 100 * (CHART_BOTTOM - CHART_TOP);
}

function pointString(trend: AttendanceTrendPoint[], key: 'attendance_rate' | 'tardiness_rate') {
  return trend.map((item, index) => item[key] === null ? null : `${chartX(index, trend.length)},${chartY(item[key])}`).filter(Boolean).join(' ');
}

function shortDate(date: string) {
  const value = new Date(`${date}T12:00:00-05:00`);
  const day = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' }).format(value).replace('.', '');
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${value.getDate()}`;
}

export function WorkforceAnalytics({ trend, employees }: Props) {
  const headcount = summarizeHeadcount(employees).slice(0, 6);
  const maxHeadcount = Math.max(1, ...headcount.map(item => item.total));
  const attendanceLine = pointString(trend, 'attendance_rate');
  const tardinessLine = pointString(trend, 'tardiness_rate');

  return <section className={styles.grid} aria-label="Analítica de Recursos Humanos">
    <article className={styles.card}>
      <header><div><span><ChartNoAxesCombined /></span><h2>Asistencia semanal</h2></div><div className={styles.legend}><i className={styles.blue} />Asistencia <i className={styles.orange} />Tardanzas</div></header>
      <div className={styles.lineChart}>{trend.length ? <svg viewBox="0 0 520 148" role="img" aria-label="Tendencia semanal de asistencia y tardanzas">
        {[0, 50, 100].map(value => <g key={value}><line x1={CHART_LEFT} x2={CHART_RIGHT} y1={chartY(value)} y2={chartY(value)} className={styles.gridLine} /><text x="4" y={chartY(value) + 3} className={styles.axisLabel}>{value}%</text></g>)}
        {attendanceLine && <polyline points={attendanceLine} className={styles.attendanceLine} />}
        {tardinessLine && <polyline points={tardinessLine} className={styles.tardinessLine} />}
        {trend.map((item, index) => <g key={item.date}>{item.attendance_rate !== null && <><circle cx={chartX(index, trend.length)} cy={chartY(item.attendance_rate)} r="3.2" className={styles.attendancePoint}><title>{item.attendance_rate}% de asistencia</title></circle><circle cx={chartX(index, trend.length)} cy={chartY(item.tardiness_rate ?? 0)} r="2.6" className={styles.tardinessPoint}><title>{item.tardiness_rate ?? 0}% de tardanzas</title></circle></>}<text x={chartX(index, trend.length)} y="137" textAnchor="middle" className={styles.dateLabel}>{shortDate(item.date)}</text></g>)}
      </svg> : <div className={styles.empty}>Sin información semanal.</div>}</div>
    </article>

    <article className={styles.card}>
      <header><div><span><BarChart3 /></span><h2>Dotación por sede</h2></div></header>
      <div className={styles.barList}>{headcount.map(item => <div key={item.site}><span title={item.site}>{item.site}</span><div><i style={{ width: `${Math.max(5, item.total / maxHeadcount * 100)}%` }} /></div><strong>{item.total}</strong></div>)}{!headcount.length && <div className={styles.empty}>Sin personal activo registrado.</div>}</div>
    </article>
  </section>;
}

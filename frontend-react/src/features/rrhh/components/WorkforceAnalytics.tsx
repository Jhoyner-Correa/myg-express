import type { ReactNode } from 'react';
import { MoreVertical, UsersRound } from 'lucide-react';
import type { AttendanceTrendPoint } from '../types';
import styles from './WorkforceAnalytics.module.css';

type Props = {
  trend: AttendanceTrendPoint[];
  onOpenReport: () => void;
  attentionPanel: ReactNode;
  performancePanel: ReactNode;
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

function pointSegments(trend: AttendanceTrendPoint[], key: 'attendance_rate' | 'tardiness_rate') {
  const segments: string[][] = [];
  let current: string[] = [];
  trend.forEach((item, index) => {
    const value = item[key];
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push(`${chartX(index, trend.length)},${chartY(value)}`);
  });
  if (current.length) segments.push(current);
  return segments;
}

function areaPoints(points: string[]) {
  if (points.length < 2) return '';
  const firstPoint = points.at(0);
  const lastPoint = points.at(-1);
  if (!firstPoint || !lastPoint) return '';
  const firstX = firstPoint.split(',')[0];
  const lastX = lastPoint.split(',')[0];
  return `${firstX},${CHART_BOTTOM} ${points.join(' ')} ${lastX},${CHART_BOTTOM}`;
}

function shortDate(date: string) {
  const value = new Date(`${date}T12:00:00-05:00`);
  const day = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' }).format(value).replace('.', '');
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${value.getDate()}`;
}

export function WorkforceAnalytics({ trend, onOpenReport, attentionPanel, performancePanel }: Props) {
  const attendanceLines = pointSegments(trend, 'attendance_rate');
  const tardinessLines = pointSegments(trend, 'tardiness_rate');

  return <section className={styles.grid} aria-label="Analítica de Recursos Humanos">
    <div className={styles.attentionSlot}>{attentionPanel}</div>

    <div className={styles.performanceSlot}>{performancePanel}</div>

    <article className={`${styles.card} ${styles.weeklyCard}`}>
      <header><div><span><UsersRound /></span><h2>Asistencia semanal</h2></div><button type="button" className={styles.chartMenu} aria-label="Abrir reporte semanal" title="Abrir reporte semanal" onClick={onOpenReport}><MoreVertical /></button></header>
      <div className={styles.legend}><span><i className={styles.blue} />Asistencia (%)</span><span><i className={styles.orange} />Tardanzas</span></div>
      <div className={styles.lineChart}>{trend.length ? <svg viewBox="0 0 520 178" role="img" aria-label="Tendencia semanal de asistencia y tardanzas">
        <defs><linearGradient id="attendance-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#347ddc" stopOpacity=".2" /><stop offset="1" stopColor="#347ddc" stopOpacity=".015" /></linearGradient><linearGradient id="tardiness-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f27618" stopOpacity=".16" /><stop offset="1" stopColor="#f27618" stopOpacity=".015" /></linearGradient></defs>
        {[0, 25, 50, 75, 100].map(value => <g key={value}><line x1={CHART_LEFT} x2={CHART_RIGHT} y1={chartY(value)} y2={chartY(value)} className={styles.gridLine} /><text x="4" y={chartY(value) + 3} className={styles.axisLabel}>{value}%</text></g>)}
        {trend.map((item, index) => <line key={`grid-${item.date}`} x1={chartX(index, trend.length)} x2={chartX(index, trend.length)} y1={CHART_TOP} y2={CHART_BOTTOM} className={styles.verticalGridLine} />)}
        {attendanceLines.map((points, index) => areaPoints(points) && <polygon key={`attendance-area-${index}`} points={areaPoints(points)} className={styles.attendanceArea} />)}
        {tardinessLines.map((points, index) => areaPoints(points) && <polygon key={`tardiness-area-${index}`} points={areaPoints(points)} className={styles.tardinessArea} />)}
        {attendanceLines.map((points, index) => <polyline key={`attendance-${index}`} points={points.join(' ')} className={styles.attendanceLine} />)}
        {tardinessLines.map((points, index) => <polyline key={`tardiness-${index}`} points={points.join(' ')} className={styles.tardinessLine} />)}
        {trend.map((item, index) => { const [weekday, day] = shortDate(item.date).split(' '); return <g key={item.date}>{item.attendance_rate !== null && <><circle cx={chartX(index, trend.length)} cy={chartY(item.attendance_rate)} r="4" className={styles.attendancePoint}><title>{item.attendance_rate}% de asistencia</title></circle><circle cx={chartX(index, trend.length)} cy={chartY(item.tardiness_rate ?? 0)} r="3.7" className={styles.tardinessPoint}><title>{item.tardiness_rate ?? 0}% de tardanzas</title></circle></>}<text x={chartX(index, trend.length)} y="151" textAnchor="middle" className={styles.dateLabel}><tspan x={chartX(index, trend.length)}>{weekday}</tspan><tspan x={chartX(index, trend.length)} dy="14" className={styles.dateNumber}>{day}</tspan></text></g>; })}
      </svg> : <div className={styles.empty}>Sin información semanal.</div>}</div>
    </article>

  </section>;
}

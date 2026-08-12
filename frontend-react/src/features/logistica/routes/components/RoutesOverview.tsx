import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays, Flag, MapPinned } from 'lucide-react';
import type { RouteItem } from '../types';
import styles from './RoutesOverview.module.css';

type RoutesOverviewProps = {
  routes: RouteItem[];
};

const TIME_ZONE = 'America/Lima';
const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
});

function getRouteTimestamp(route: RouteItem): string {
  return route.created_at || route.fecha || route.updated_at || '';
}

function getDateKey(date: Date): string {
  return DAY_KEY_FORMATTER.format(date);
}

function getRouteDateKey(route: RouteItem): string {
  const timestamp = getRouteTimestamp(route);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp.slice(0, 10) : getDateKey(date);
}

function getDayLabel(date: Date): string {
  const [day = '', month = ''] = DAY_LABEL_FORMATTER.format(date).replace('.', '').split(' ');
  return `${day} ${month.charAt(0).toUpperCase()}${month.slice(1)}`.trim();
}

export function RoutesOverview({ routes }: RoutesOverviewProps) {
  const dashboard = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const todayKey = getDateKey(now);
    const yesterdayKey = getDateKey(yesterday);

    const today = routes.filter(route => getRouteDateKey(route) === todayKey).length;
    const yesterdayTotal = routes.filter(route => getRouteDateKey(route) === yesterdayKey).length;
    const completed = routes.filter(route => route.estado === 'completado').length;
    const variation = yesterdayTotal > 0
      ? Math.round(((today - yesterdayTotal) / yesterdayTotal) * 100)
      : today > 0 ? 100 : 0;

    const buckets = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (13 - index));
      const key = getDateKey(date);
      return {
        key,
        label: getDayLabel(date),
        count: routes.filter(route => getRouteDateKey(route) === key).length,
      };
    });

    return {
      metrics: { total: routes.length, today, completed, variation },
      categories: buckets.map(bucket => bucket.label),
      values: buckets.map(bucket => bucket.count),
    };
  }, [routes]);

  const { total, today, completed, variation } = dashboard.metrics;

  return (
    <section className={styles.overview} aria-labelledby="routes-overview-title">
      <div className={styles.metrics} aria-label="Indicadores de rutas">
        <Metric
          accent="success"
          icon={<MapPinned aria-hidden="true" />}
          label="Total de rutas"
          value={total}
          helper="En todas las sedes"
        />
        <Metric
          accent="info"
          icon={<CalendarDays aria-hidden="true" />}
          label="Creadas hoy"
          value={today}
          helper="Respecto a ayer"
          badge={`${variation >= 0 ? '+' : ''}${variation}%`}
        />
        <Metric
          accent="warning"
          icon={<Flag aria-hidden="true" />}
          label="Finalizadas"
          value={completed}
          helper="Completadas exitosamente"
        />
      </div>

      <div className={styles.chartPanel}>
        <header className={styles.chartHeader}>
          <div className={styles.chartTitle}>
            <span className={styles.eyebrow}>Actividad</span>
            <h2 id="routes-overview-title">Tendencia de rutas</h2>
          </div>
        </header>
        <div className={styles.chart}>
          <TrendChart labels={dashboard.categories} values={dashboard.values} />
        </div>
      </div>
    </section>
  );
}

function TrendChart({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 700;
  const height = 132;
  const padding = { top: 8, right: 10, bottom: 24, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(2, ...values);
  const x = (index: number) => padding.left + (index * plotWidth) / Math.max(values.length - 1, 1);
  const y = (value: number) => padding.top + plotHeight - (value / maximum) * plotHeight;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const area = values.length > 0
    ? `M ${x(0)} ${padding.top + plotHeight} L ${points.replaceAll(',', ' ')} L ${x(values.length - 1)} ${padding.top + plotHeight} Z`
    : '';
  const ticks = [maximum, Math.round(maximum / 2), 0];

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rutas creadas durante los últimos 14 días">
      <title>Tendencia de rutas creadas durante los últimos 14 días</title>
      <defs>
        <linearGradient id="routes-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22a85a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#22a85a" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {ticks.map((tick, index) => {
        const tickY = padding.top + (index * plotHeight) / 2;
        return (
          <g key={`${tick}-${index}`}>
            <line x1={padding.left} x2={width - padding.right} y1={tickY} y2={tickY} className={styles.gridLine} />
            <text x={padding.left - 7} y={tickY + 3} textAnchor="end" className={styles.axisLabel}>{tick}</text>
          </g>
        );
      })}
      {area && <path d={area} fill="url(#routes-area-gradient)" />}
      {points && <polyline points={points} className={styles.chartLine} />}
      {values.map((value, index) => value > 0 && (
        <circle key={`point-${labels[index]}`} cx={x(index)} cy={y(value)} r="3" className={styles.chartPoint}>
          <title>{labels[index]}: {value} {value === 1 ? 'ruta' : 'rutas'}</title>
        </circle>
      ))}
      {values.map((value, index) => (
        <text key={`${labels[index]}-${value}`} x={x(index)} y={height - 6} textAnchor="middle" className={styles.axisLabel}>
          {labels[index]}
        </text>
      ))}
    </svg>
  );
}

type MetricProps = {
  accent: 'success' | 'info' | 'warning';
  icon: ReactNode;
  label: string;
  value: number;
  helper: string;
  badge?: string;
};

function Metric({ accent, icon, label, value, helper, badge }: MetricProps) {
  return (
    <article className={`${styles.metric} ${styles[accent]}`}>
      <span className={styles.metricAccent} aria-hidden="true" />
      <span className={styles.metricIcon}>{icon}</span>
      <span className={styles.metricContent}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValueRow}>
          <strong>{value}</strong>
          {badge && <span className={styles.metricBadge}>{badge}</span>}
        </span>
        <small>{helper}</small>
      </span>
    </article>
  );
}

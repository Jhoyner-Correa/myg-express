import type { ReactNode } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import styles from './ExecutiveKpiCard.module.css';

type Comparison = {
  delta: number;
  suffix?: string;
  lowerIsBetter?: boolean;
};

type Props = {
  label: string;
  value: ReactNode;
  context: string;
  insight: string;
  icon: ReactNode;
  tone: 'blue' | 'green' | 'orange' | 'violet' | 'red';
  comparison?: Comparison;
  onClick: () => void;
};

function formatDelta(value: number, suffix = '') {
  const normalized = Math.round(value * 10) / 10;
  return `${normalized > 0 ? '+' : ''}${normalized}${suffix}`;
}

export function ExecutiveKpiCard({ label, value, context, insight, icon, tone, comparison, onClick }: Props) {
  const favorable = comparison ? comparison.lowerIsBetter ? comparison.delta < 0 : comparison.delta > 0 : false;
  const unfavorable = comparison ? comparison.lowerIsBetter ? comparison.delta > 0 : comparison.delta < 0 : false;
  const TrendIcon = comparison?.delta === 0 ? Minus : comparison && comparison.delta > 0 ? TrendingUp : TrendingDown;

  return <button type="button" className={styles.card} onClick={onClick} aria-label={`${label}: ${String(value)}`}>
    <span className={`${styles.icon} ${styles[tone]}`}>{icon}</span>
    <span className={styles.label}>{label}</span>
    <strong>{value}</strong>
    <span className={styles.insight}>
      {comparison && <TrendIcon className={favorable ? styles.favorable : unfavorable ? styles.unfavorable : styles.neutral} />}
      <b className={favorable ? styles.favorable : unfavorable ? styles.unfavorable : styles.neutral}>{comparison ? formatDelta(comparison.delta, comparison.suffix) : insight}</b>
      {comparison && <em>vs último día laborable</em>}
    </span>
    <small>{context}</small>
  </button>;
}

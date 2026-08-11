import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

type PageHeaderProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  metadata?: ReactNode;
};

export function PageHeader({ icon, title, subtitle, metadata }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <span className={styles.copy}>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </span>
      </div>
      {metadata && <div className={styles.metadata}>{metadata}</div>}
    </header>
  );
}

import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

type PageHeaderProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  metadata?: ReactNode;
  tone?: 'brand' | 'corporate' | 'blue';
  size?: 'default' | 'large';
  plainIcon?: boolean;
};

export function PageHeader({ icon, title, subtitle, metadata, tone = 'brand', size = 'default', plainIcon = false }: PageHeaderProps) {
  return (
    <header className={`${styles.header} ${tone === 'corporate' ? styles.corporate : ''} ${tone === 'blue' ? styles.blue : ''} ${size === 'large' ? styles.large : ''}`}>
      <div className={styles.identity}>
        <span className={`${styles.icon} ${plainIcon ? styles.plainIcon : ''}`} aria-hidden="true">{icon}</span>
        <span className={styles.copy}>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </span>
      </div>
      {metadata && <div className={styles.metadata}>{metadata}</div>}
    </header>
  );
}

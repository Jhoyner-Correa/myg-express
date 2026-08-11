import styles from './PageLoader.module.css';

type PageLoaderProps = {
  compact?: boolean;
  label?: string;
};

export function PageLoader({ compact = false, label = 'Cargando contenido' }: PageLoaderProps) {
  return (
    <div className={`${styles.loader} ${compact ? styles.compact : ''}`} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import styles from './AppErrorBoundary.module.css';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la interfaz:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className={styles.page}>
        <section className={styles.card} role="alert">
          <span className={styles.icon}><AlertTriangle aria-hidden="true" /></span>
          <p className={styles.eyebrow}>Error de interfaz</p>
          <h1>No pudimos mostrar esta pantalla</h1>
          <p>Tu información no se ha modificado. Recarga el sistema para continuar.</p>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" />Recargar sistema
          </button>
        </section>
      </main>
    );
  }
}

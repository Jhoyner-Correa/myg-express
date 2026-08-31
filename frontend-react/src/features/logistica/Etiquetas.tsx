// ============================================================
// frontend-react/src/features/logistica/Etiquetas.tsx
// Módulo de Generación de Etiquetas (Próximamente)
// ============================================================

import React from 'react';
import { Barcode, Clock } from 'lucide-react';

export const Etiquetas: React.FC = () => {
  return (
    <div style={styles.container}>
      <div className="glass-panel" style={styles.card}>
        <div style={styles.iconContainer}>
          <Barcode size={48} style={{ color: 'var(--color-success)' }} />
        </div>
        <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 800 }}>Generador de Etiquetas</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '380px', margin: '0 auto', lineHeight: '1.6' }}>
          Esta funcionalidad está siendo migrada al nuevo panel de control. Estará disponible próximamente para imprimir códigos de barra de paquetes en lotes.
        </p>
        
        <div style={styles.badge}>
          <Clock size={14} style={{ marginRight: 6 }} />
          Próximamente
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '460px',
    padding: '48px 32px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  iconContainer: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 16px',
    borderRadius: '20px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--glass-border)',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
  }
};

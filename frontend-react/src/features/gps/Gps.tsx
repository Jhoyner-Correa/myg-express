// ============================================================
// frontend-react/src/features/gps/Gps.tsx
// Vista del Módulo de Rastreo GPS en tiempo real
// ============================================================

import React from 'react';

export const Gps: React.FC = () => {
  return (
    <div className="glass-panel" style={{ padding: '32px' }}>
      <h2 style={{ marginBottom: '16px', color: '#fff' }}>Módulo de Rastreo GPS en Vivo</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Visualiza la ubicación geográfica en tiempo real de tus transportistas y consulta los recorridos de rutas históricas.
      </p>

      <div style={{ 
        height: '350px', 
        background: 'rgba(0, 0, 0, 0.2)', 
        border: '1px solid var(--glass-border)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <span style={{ fontSize: '2.5rem' }}>🗺️</span>
        <p>El mapa interactivo se renderizará aquí utilizando Leaflet / Google Maps</p>
      </div>
    </div>
  );
};

// ============================================================
// frontend-react/src/features/rrhh/Rrhh.tsx
// Vista del Módulo Recursos Humanos (RRHH)
// ============================================================

import React, { useState, useEffect } from 'react';
import apiClient from '../../core/api/apiClient';

export const Rrhh: React.FC = () => {
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Intentar listar empleados de la sede 1 por defecto para demostración
    const fetchEmpleados = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get('/rrhh/empleados/sede/1');
        if (response.data && response.data.ok) {
          setEmpleados(response.data.data);
        }
      } catch (error) {
        console.error('Error al listar empleados:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEmpleados();
  }, []);

  return (
    <div className="glass-panel" style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ color: '#fff' }}>Módulo de Recursos Humanos (RRHH)</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Gestiona la asistencia y el personal activo de la empresa.</p>
        </div>
        <button className="btn-primary">Registrar Nuevo Empleado</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner"></span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableRowHeader}>
                <th style={styles.th}>Código</th>
                <th style={styles.th}>Nombres y Apellidos</th>
                <th style={styles.th}>Documento (DNI)</th>
                <th style={styles.th}>Cargo</th>
                <th style={styles.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {empleados.length > 0 ? (
                empleados.map((emp) => (
                  <tr key={emp.id} style={styles.tr}>
                    <td style={styles.td}>{emp.codigoEmpleado}</td>
                    <td style={styles.td}>{emp.nombres} {emp.apellidos}</td>
                    <td style={styles.td}>{emp.dni}</td>
                    <td style={styles.td}>{emp.cargoNombre || 'Empleado'}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: emp.estado === 'ACTIVO' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: emp.estado === 'ACTIVO' ? 'var(--color-success)' : 'var(--color-error)'
                      }}>{emp.estado}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No se encontraron empleados registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  tableRowHeader: {
    borderBottom: '2px solid var(--glass-border)',
  },
  th: {
    padding: '16px',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    fontSize: '0.85rem',
    textTransform: 'uppercase',
  },
  tr: {
    borderBottom: '1px solid var(--glass-border)',
  },
  td: {
    padding: '16px',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
  }
};

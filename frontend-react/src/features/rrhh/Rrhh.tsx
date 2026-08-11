import { UserPlus, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { useEmployees } from './useEmployees';
import styles from './Rrhh.module.css';

export function Rrhh() {
  const { user } = useAuth();
  const branchId = user?.sede_id ?? null;
  const { employees, loading, error, reload } = useEmployees(branchId);

  return (
    <main className={styles.page} id="main-content">
      <PageHeader
        icon={<Users />}
        title="Recursos Humanos"
        subtitle="Personal, asistencia y operación por sede"
        metadata={user?.sede_nombre ?? 'Sede no asignada'}
      />
      <section className={styles.content}>
        <article className={styles.card}>
          <header className={styles.toolbar}>
            <div>
              <h2>Personal activo</h2>
              <p>{employees.length} {employees.length === 1 ? 'colaborador registrado' : 'colaboradores registrados'}</p>
            </div>
            <Button type="button" icon={<UserPlus size={16} />} disabled>
              Registrar empleado
            </Button>
          </header>

          {loading ? (
            <PageLoader compact label="Cargando personal" />
          ) : error ? (
            <div className={`${styles.state} ${styles.error}`} role="alert">
              <div>
                <p>{getApiErrorMessage(error, 'No se pudo cargar el personal.')}</p>
                <Button type="button" variant="secondary" onClick={() => void reload()}>Reintentar</Button>
              </div>
            </div>
          ) : branchId === null ? (
            <div className={styles.state}>Asigna una sede al usuario para consultar su personal.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Código</th><th>Nombres y apellidos</th><th>Documento</th><th>Cargo</th><th>Estado</th></tr></thead>
                <tbody>
                  {employees.length > 0 ? employees.map(employee => (
                    <tr key={employee.id}>
                      <td className={styles.code}>{employee.codigoEmpleado}</td>
                      <td className={styles.employee}>{employee.nombres} {employee.apellidos}</td>
                      <td>{employee.dni}</td>
                      <td>{employee.cargoNombre || 'Empleado'}</td>
                      <td><span className={`${styles.badge} ${employee.estado === 'ACTIVO' ? styles.active : styles.inactive}`}>{employee.estado}</span></td>
                    </tr>
                  )) : <tr><td colSpan={5}><div className={styles.state}>No hay empleados registrados en esta sede.</div></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

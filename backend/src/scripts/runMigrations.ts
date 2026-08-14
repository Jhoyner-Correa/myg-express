import { spawnSync } from 'child_process';
import path from 'path';

type MigrationStep = {
  label: string;
  script: string;
};

const steps: MigrationStep[] = [
  { label: 'Preflight de integridad', script: 'checkDatabaseIntegrity.js' },
  { label: 'Restricciones de integridad', script: 'applyIntegrityMigration.js' },
  { label: 'Alcance SAVAR por sede', script: 'applySavarSedeMigration.js' },
  { label: 'Fundación móvil de RR. HH.', script: 'applyRrhhMobileFoundation.js' },
  { label: 'Incidencias de RR. HH.', script: 'applyRrhhIncidentWorkflows.js' },
  { label: 'Contingencia biométrica', script: 'applyRrhhBiometricContingency.js' },
  { label: 'Políticas de horarios', script: 'applyRrhhSchedulePolicies.js' },
  { label: 'Calendario laboral de RR. HH.', script: 'applyRrhhWorkCalendar.js' },
  { label: 'Jerarquia semanal de RR. HH.', script: 'applyRrhhWeeklyScope.js' },
  { label: 'Modelo corporativo de acceso', script: 'applyAccessModel.js' },
  { label: 'Limpieza del modelo de acceso', script: 'applyAccessCleanup.js' },
  { label: 'Verificación final de accesos', script: 'verifyAccessCleanup.js' },
];

function execute(step: MigrationStep): void {
  console.log(`\n==> ${step.label}`);
  const result = spawnSync(process.execPath, [path.resolve(__dirname, step.script)], {
    cwd: path.resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`La etapa "${step.label}" terminó con código ${result.status ?? 'desconocido'}.`);
  }
}

for (const step of steps) execute(step);
console.log('\nMigraciones y verificaciones completadas correctamente.');

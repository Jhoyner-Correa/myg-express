import { spawnSync } from 'child_process';
import path from 'path';

type MigrationStep = {
  label: string;
  script: string;
};

const steps: MigrationStep[] = [
  { label: 'Reparación conservadora de referencias heredadas', script: 'repairDatabaseIntegrity.js' },
  { label: 'Preflight de integridad', script: 'checkDatabaseIntegrity.js' },
  { label: 'Restricciones de integridad', script: 'applyIntegrityMigration.js' },
  { label: 'Alcance SAVAR por sede', script: 'applySavarSedeMigration.js' },
  { label: 'Base instalable de RR. HH.', script: 'applyRrhhCoreFoundation.js' },
  { label: 'Fundación móvil de RR. HH.', script: 'applyRrhhMobileFoundation.js' },
  { label: 'Incidencias de RR. HH.', script: 'applyRrhhIncidentWorkflows.js' },
  { label: 'Contingencia biométrica', script: 'applyRrhhBiometricContingency.js' },
  { label: 'Políticas de horarios', script: 'applyRrhhSchedulePolicies.js' },
  { label: 'Calendario laboral de RR. HH.', script: 'applyRrhhWorkCalendar.js' },
  { label: 'Jerarquia semanal de RR. HH.', script: 'applyRrhhWeeklyScope.js' },
  { label: 'Modelo corporativo de acceso', script: 'applyAccessModel.js' },
  { label: 'Limpieza del modelo de acceso', script: 'applyAccessCleanup.js' },
  { label: 'Codigos automaticos de colaboradores', script: 'applyRrhhEmployeeCodes.js' },
  { label: 'Perfil laboral de colaboradores', script: 'applyRrhhEmployeeProfile.js' },
  { label: 'Fotos de perfil de colaboradores', script: 'applyRrhhEmployeeProfilePhotos.js' },
  { label: 'Fotos de perfil de usuarios', script: 'applyUserProfilePhotos.js' },
  { label: 'Ventanas de asistencia y sobretiempo', script: 'applyRrhhAttendanceWindows.js' },
  { label: 'Segmentos de sobretiempo', script: 'applyRrhhOvertimeSegments.js' },
  { label: 'Retención de selfies de RR. HH.', script: 'applyRrhhSelfieRetention.js' },
  { label: 'Cierre diario de asistencia', script: 'applyRrhhAttendanceDailyClosure.js' },
  { label: 'Revision de incidencias y sobretiempo', script: 'applyRrhhAttendanceReview.js' },
  { label: 'Propuestas externas de feriados', script: 'applyRrhhHolidayProposals.js' },
  { label: 'Cancelación auditable de solicitudes', script: 'applyRrhhAbsenceCancellation.js' },
  { label: 'Notificaciones móviles de RR. HH.', script: 'applyRrhhMobileNotifications.js' },
  { label: 'Solicitudes móviles de permisos', script: 'applyRrhhMobilePermissionRequests.js' },
  { label: 'Justificaciones de asistencia', script: 'applyRrhhAttendanceJustifications.js' },
  { label: 'Pagos mensuales por servicios', script: 'applyRrhhServicePayments.js' },
  { label: 'Workflow corporativo de pagos', script: 'applyRrhhPaymentWorkflow.js' },
  { label: 'Integridad de recibos por honorarios', script: 'applyRrhhPaymentReceiptIntegrity.js' },
  { label: 'Lotes historicos de pagos', script: 'applyRrhhPaymentLegacyBatches.js' },
  { label: 'Expediente individual de pagos', script: 'applyRrhhPaymentEmployeeLedger.js' },
  { label: 'Prorrateo auditable de pagos parciales', script: 'applyRrhhPaymentProration.js' },
  { label: 'Sustento movil de sobretiempo', script: 'applyRrhhOvertimeEvidence.js' },
  { label: 'Gobierno del esquema de RR. HH.', script: 'applyRrhhSchemaGovernance.js' },
  { label: 'Retiro de tablas heredadas de RR. HH.', script: 'applyRrhhLegacyRetirement.js' },
  { label: 'Verificación final de accesos', script: 'verifyAccessCleanup.js' },
  { label: 'Auditoría final del esquema de RR. HH.', script: 'verifyRrhhSchema.js' },
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

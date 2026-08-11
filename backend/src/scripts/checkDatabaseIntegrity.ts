import { pool } from '../core/database/database';

const checks = [
  ['avisos_lote', `SELECT COUNT(*) total FROM avisos_diarios a LEFT JOIN lotes_carga l ON l.id=a.lote_id WHERE l.id IS NULL`],
  ['avisos_sede', `SELECT COUNT(*) total FROM avisos_diarios a LEFT JOIN sedes s ON s.id=a.sede_id WHERE s.id IS NULL`],
  ['avisos_sesion', `SELECT COUNT(*) total FROM avisos_diarios a LEFT JOIN whatsapp_sesiones w ON w.id=a.whatsapp_sesion_id WHERE a.whatsapp_sesion_id IS NOT NULL AND w.id IS NULL`],
  ['avisos_plantilla', `SELECT COUNT(*) total FROM avisos_diarios a LEFT JOIN plantillas p ON p.id=a.id_plantilla WHERE a.id_plantilla IS NOT NULL AND p.id IS NULL`],
  ['mensajes_sede', `SELECT COUNT(*) total FROM mensajes_log m LEFT JOIN sedes s ON s.id=m.sede_id WHERE s.id IS NULL`],
  ['mensajes_lote', `SELECT COUNT(*) total FROM mensajes_log m LEFT JOIN lotes_carga l ON l.id=m.lote_id WHERE m.lote_id IS NOT NULL AND l.id IS NULL`],
  ['mensajes_aviso', `SELECT COUNT(*) total FROM mensajes_log m LEFT JOIN avisos_diarios a ON a.id=m.aviso_id WHERE m.aviso_id IS NOT NULL AND a.id IS NULL`],
  ['usuarios_sede', `SELECT COUNT(*) total FROM usuarios u LEFT JOIN sedes s ON s.id=u.sede_id WHERE u.sede_id IS NOT NULL AND s.id IS NULL`],
  ['sesiones_sede', `SELECT COUNT(*) total FROM whatsapp_sesiones w LEFT JOIN sedes s ON s.id=w.sede_id WHERE s.id IS NULL`],
  ['plantillas_sede', `SELECT COUNT(*) total FROM plantillas p LEFT JOIN sedes s ON s.id=p.sede_id WHERE p.sede_id IS NOT NULL AND s.id IS NULL`],
  ['zonas_sede', `SELECT COUNT(*) total FROM zonas z LEFT JOIN sedes s ON s.id=z.sede_id WHERE s.id IS NULL`],
  ['logs_duplicados_aviso_estado', `SELECT COUNT(*) total FROM (SELECT aviso_id,estado_envio FROM mensajes_log WHERE aviso_id IS NOT NULL GROUP BY aviso_id,estado_envio HAVING COUNT(*)>1) d`],
  ['relaciones_entre_sedes', `SELECT COUNT(*) total FROM avisos_diarios a JOIN lotes_carga l ON l.id=a.lote_id LEFT JOIN whatsapp_sesiones w ON w.id=a.whatsapp_sesion_id LEFT JOIN plantillas p ON p.id=a.id_plantilla WHERE a.sede_id<>l.sede_id OR (w.id IS NOT NULL AND a.sede_id<>w.sede_id) OR (p.id IS NOT NULL AND p.sede_id IS NOT NULL AND a.sede_id<>p.sede_id)`]
] as const;

async function main() {
  let failures = 0;
  for (const [name, sql] of checks) {
    const [[row]]: any = await pool.query(sql);
    const total = Number(row?.total || 0);
    if (total > 0) failures++;
    console.log(`${total === 0 ? 'OK' : 'FAIL'} ${name}: ${total}`);
  }
  if (failures) {
    throw new Error(`Preflight detenido: ${failures} comprobaciones requieren limpieza antes de migrar.`);
  }
  console.log('Preflight correcto: la migracion de integridad puede aplicarse.');
}

void main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

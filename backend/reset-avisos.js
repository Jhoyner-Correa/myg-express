const Redis = require('ioredis');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function limpiarYReiniciar() {
  const redis = new Redis();
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_mensajeria'
  });

  try {
    // 1. Limpiar TODO en Redis relacionado a la cola
    console.log('Limpiando cola de Redis...');
    const keys = await redis.keys('bull:whatsapp-mensajes:*');
    if (keys.length) {
      await redis.del(...keys);
      console.log(`  → ${keys.length} claves eliminadas de Redis`);
    } else {
      console.log('  → Cola ya estaba vacía');
    }

    // 2. Restablecer TODOS los avisos que no están enviados
    const [result] = await pool.query(
      `UPDATE avisos_diarios 
       SET estado_aviso = 'pendiente', 
           error_detalle = NULL, 
           id_trabajo_cola = NULL,
           intentos = 0
       WHERE estado_aviso IN ('en_cola', 'fallido', 'sin_whatsapp', 'cancelado')`
    );
    console.log(`\nAvisos restablecidos a pendiente: ${result.affectedRows}`);

    // 3. Mostrar estado actual
    const [estados] = await pool.query(
      'SELECT estado_aviso, COUNT(*) as total FROM avisos_diarios GROUP BY estado_aviso'
    );
    console.log('\nEstado actual de avisos:');
    console.table(estados);

    // 4. También actualizar el lote a "activo" si estaba en procesando
    const [lote] = await pool.query(
      `UPDATE lotes_carga SET estado = 'activo' WHERE estado = 'procesando'`
    );
    console.log(`Lotes restablecidos: ${lote.affectedRows}`);

  } finally {
    redis.disconnect();
    await pool.end();
  }
}

limpiarYReiniciar()
  .then(() => { console.log('\n✅ Todo listo. Ahora puedes dar clic en Enviar Lote.'); })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });

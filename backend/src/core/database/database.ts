// ============================================================
// backend/src/core/database/database.ts
// Configuración central y pool de conexiones MySQL/MariaDB
// ============================================================

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { DB_TIMEZONE } from '../utils/time';

// Cargar variables de entorno
dotenv.config();

export const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME || 'sistema_mensajeria',
  timezone:           DB_TIMEZONE,
  waitForConnections: true,
  connectionLimit:    Number(process.env.DB_CONNECTION_LIMIT || 15), // Limite de conexiones del pool
  queueLimit:         0
});

pool.on('connection', (connection) => {
  // mysql2 emite aqui la conexion base (callback), incluso desde PromisePool.
  (connection as any).query('SET time_zone = ?', [DB_TIMEZONE], (error: Error | null) => {
    if (error) {
      console.error(`[Database] No se pudo configurar time_zone=${DB_TIMEZONE}:`, error.message);
    }
  });
});

/**
 * Helper para ejecutar operaciones dentro de una transacción MySQL de forma segura.
 * Se encarga de obtener la conexión, iniciar la transacción, hacer commit o rollback en caso de error
 * y finalmente liberar la conexión de vuelta al pool.
 */
export async function runInTransaction<T>(
  action: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

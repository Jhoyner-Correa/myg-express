// ============================================================
// config/database.ts
// Configuración y exportación del pool de conexiones MySQL
// ============================================================

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

// Creamos un pool de conexiones para reutilizarlas eficientemente
// Un pool evita abrir/cerrar una conexión nueva en cada consulta
export const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'sistema_mensajeria',
  waitForConnections: true,
  connectionLimit:    10,   // máximo 10 conexiones simultáneas
  queueLimit:         0     // sin límite de cola
});

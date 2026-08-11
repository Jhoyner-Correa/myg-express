import { pool } from '../core/database/database';

async function run() {
  try {
    const [rows] = await pool.query('DESCRIBE usuarios');
    console.log('--- ESTRUCTURA DE USUARIOS ---');
    console.log(rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();

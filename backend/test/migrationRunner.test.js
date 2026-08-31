const test = require('node:test');
const assert = require('node:assert/strict');

const { migrationRunnerInternals } = require('../dist/scripts/runMigrations');

test('separa sentencias sin romper cadenas, identificadores ni comentarios', () => {
  const source = `
    -- comentario con ; ignorado
    CREATE TABLE \`demo;table\` (id INT, texto VARCHAR(50));
    INSERT INTO \`demo;table\` VALUES (1, 'valor;seguro');
    /* bloque con ; ignorado */
    SELECT "otro;valor";
  `;

  assert.deepEqual(migrationRunnerInternals.splitSqlStatements(source), [
    'CREATE TABLE `demo;table` (id INT, texto VARCHAR(50))',
    "INSERT INTO `demo;table` VALUES (1, 'valor;seguro')",
    'SELECT "otro;valor"',
  ]);
});

test('rechaza SQL con cadenas o comentarios sin cerrar', () => {
  assert.throws(
    () => migrationRunnerInternals.splitSqlStatements("SELECT 'incompleto;"),
    /sin cerrar/,
  );
  assert.throws(
    () => migrationRunnerInternals.splitSqlStatements('SELECT 1; /* incompleto'),
    /sin cerrar/,
  );
});

const assert = require('node:assert/strict');
const test = require('node:test');

const { validateRuntimeEnvironment } = require('../dist/core/config/runtimeEnvironment');
const { normalizeCspSource } = require('../dist/core/server/createHttpApp');

const managedKeys = [
  'NODE_ENV',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'PAYMENTS_DATA_ENCRYPTION_KEY',
  'URBANO_CREDENTIALS_SECRET',
  'APP_TRUST_PROXY_HOPS',
  'APP_CORS_ORIGINS',
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(managedKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of managedKeys) delete process.env[key];
    Object.assign(process.env, values);
    callback();
  } finally {
    for (const key of managedKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('permite configuracion local sin exigir secretos de produccion', () => {
  withEnvironment({ NODE_ENV: 'development' }, () => {
    assert.doesNotThrow(() => validateRuntimeEnvironment('api'));
  });
});

test('normaliza palabras reservadas CSP provenientes del archivo de entorno', () => {
  assert.equal(normalizeCspSource('self'), "'self'");
  assert.equal(normalizeCspSource("'self'"), "'self'");
  assert.equal(normalizeCspSource('unsafe-inline'), "'unsafe-inline'");
  assert.equal(normalizeCspSource('https://cdn.jsdelivr.net'), 'https://cdn.jsdelivr.net');
});

test('rechaza una API de produccion con secretos debiles y CORS local', () => {
  withEnvironment(
    {
      NODE_ENV: 'production',
      DB_HOST: 'db',
      DB_USER: 'app',
      DB_PASSWORD: 'secret',
      DB_NAME: 'myg',
      JWT_SECRET: 'weak',
      PAYMENTS_DATA_ENCRYPTION_KEY: 'weak',
      URBANO_CREDENTIALS_SECRET: 'weak',
      APP_TRUST_PROXY_HOPS: '0',
      APP_CORS_ORIGINS: 'http://localhost:5173',
    },
    () => {
      assert.throws(
        () => validateRuntimeEnvironment('api'),
        /Configuracion de produccion invalida/,
      );
    },
  );
});

test('acepta una API de produccion con configuracion explicita y segura', () => {
  withEnvironment(
    {
      NODE_ENV: 'production',
      DB_HOST: 'mariadb.internal',
      DB_USER: 'myg_app',
      DB_PASSWORD: 'database-password',
      DB_NAME: 'sistema_mensajeria',
      JWT_SECRET: 'j'.repeat(48),
      PAYMENTS_DATA_ENCRYPTION_KEY: 'p'.repeat(48),
      URBANO_CREDENTIALS_SECRET: 'u'.repeat(48),
      APP_TRUST_PROXY_HOPS: '1',
      APP_CORS_ORIGINS: 'https://rrhh.mygexpress.pe',
    },
    () => {
      assert.doesNotThrow(() => validateRuntimeEnvironment('api'));
      assert.doesNotThrow(() => validateRuntimeEnvironment('worker'));
    },
  );
});

test('rechaza CORS de produccion cuando se configura una URL y no un origen exacto', () => {
  withEnvironment(
    {
      NODE_ENV: 'production',
      DB_HOST: 'mariadb.internal',
      DB_USER: 'myg_app',
      DB_PASSWORD: 'database-password',
      DB_NAME: 'sistema_mensajeria',
      JWT_SECRET: 'j'.repeat(48),
      PAYMENTS_DATA_ENCRYPTION_KEY: 'p'.repeat(48),
      URBANO_CREDENTIALS_SECRET: 'u'.repeat(48),
      APP_TRUST_PROXY_HOPS: '1',
      APP_CORS_ORIGINS: 'https://rrhh.mygexpress.pe/ruta',
    },
    () => {
      assert.throws(
        () => validateRuntimeEnvironment('api'),
        /origenes HTTPS explicitos/,
      );
    },
  );
});

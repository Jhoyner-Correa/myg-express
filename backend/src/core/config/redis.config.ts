import Redis, { RedisOptions } from 'ioredis';

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisDb = Number(process.env.REDIS_DB || 0);
const redisUsername = process.env.REDIS_USERNAME || undefined;
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisTlsEnabled = String(process.env.REDIS_TLS || 'false').toLowerCase() === 'true';
const redisLogThrottleMs = Number(process.env.REDIS_LOG_THROTTLE_MS || 30000);

let lastRedisErrorLogAt = 0;

export const redisConfig: RedisOptions = {
  host: redisHost,
  port: Number.isFinite(redisPort) ? redisPort : 6379,
  db: Number.isFinite(redisDb) ? redisDb : 0,
  username: redisUsername,
  password: redisPassword,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectionName: process.env.REDIS_CONNECTION_NAME || 'myg-express',
  tls: redisTlsEnabled ? {} : undefined,
  retryStrategy: (times: number) => Math.min(times * 100, 5000)
};

export const redisConnection = new Redis(redisConfig);

redisConnection.on('error', (err) => {
  const now = Date.now();
  if (now - lastRedisErrorLogAt < redisLogThrottleMs) {
    return;
  }

  lastRedisErrorLogAt = now;
  console.error(`[Redis] Conexion no disponible en ${redisHost}:${redisConfig.port}. Detalle: ${err.message}`);
});

redisConnection.on('ready', () => {
  console.log(`[Redis] Conectado correctamente a ${redisHost}:${redisConfig.port}.`);
});

redisConnection.on('reconnecting', () => {
  console.warn(`[Redis] Reintentando conexion con ${redisHost}:${redisConfig.port}...`);
});

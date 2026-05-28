import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT) || 6379;

// Opciones de conexión robustas para producción
export const redisConfig = {
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    // Reintentar conexión cada vez más lento hasta un máximo de 5 segundos
    return Math.min(times * 50, 5000);
  }
};

export const redisConnection = new Redis(redisConfig);

redisConnection.on('error', (err) => {
  console.error('❌ Error de conexión con Redis:', err.message);
});

redisConnection.on('ready', () => {
  console.log('✅ Conectado a Redis exitosamente.');
});

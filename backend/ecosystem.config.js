const backendCwd = process.env.PM2_BACKEND_CWD || '/var/www/sistema/sistema-mensajeria/backend';

module.exports = {
  apps: [
    {
      name: 'sistema-api',
      script: 'dist/app.js',
      cwd: backendCwd,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Lima',
        APP_TIME_ZONE: 'America/Lima',
        DB_TIMEZONE: '-05:00',
        PORT: 3000
      }
    },
    {
      name: 'sistema-whatsapp-worker',
      script: 'dist/worker.js',
      cwd: backendCwd,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1400M',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Lima',
        APP_TIME_ZONE: 'America/Lima',
        DB_TIMEZONE: '-05:00',
        WHATSAPP_WORKER_PORT: 3001
      }
    }
  ]
};

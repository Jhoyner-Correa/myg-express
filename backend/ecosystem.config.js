module.exports = {
  apps: [
    {
      name: 'sistema-api',
      script: 'dist/app.js',
      cwd: '/var/www/sistema/sistema-mensajeria/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'sistema-whatsapp-worker',
      script: 'dist/worker.js',
      cwd: '/var/www/sistema/sistema-mensajeria/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1400M',
      env: {
        NODE_ENV: 'production',
        WHATSAPP_WORKER_PORT: 3001
      }
    }
  ]
};

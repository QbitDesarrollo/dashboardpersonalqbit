// PM2 ecosystem configuration for TIUSDEI Portal
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'tiusdei-api',
      cwd: './server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Low resource configuration for Ubuntu
      max_memory_restart: '150M',
      // Restart on failure
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      // Watch for changes (disable in production)
      watch: false,
    },
  ],
};

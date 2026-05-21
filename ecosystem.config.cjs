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
        PORT: 3003,
      },
      // Memory limit (increase for 100 concurrent users)
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=512',
      // Restart on failure
      autorestart: true,
      max_restarts: 15,
      restart_delay: 2000,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      log_type: 'json',
      // Watch for changes (disable in production)
      watch: false,
      // Exponential backoff restart
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'tiusdei-mcp',
      cwd: './mcp-server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        TIUSDEI_API_URL: 'http://127.0.0.1:3003/api',
      },
      max_memory_restart: '256M',
      autorestart: true,
      max_restarts: 15,
      restart_delay: 2000,
      kill_timeout: 5000,
      listen_timeout: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/mcp-error.log',
      out_file: './logs/mcp-out.log',
      merge_logs: true,
      watch: false,
    },
  ],
};

module.exports = {
    apps: [{
      name: `my-server-1-60`,
      script: './demo/udp-multiple-endpoints.js',
      
      // Restart configuration
      autorestart: true,
      max_restarts: 10,        // Max restart attempts
      min_uptime: '10s',       // Min uptime before restart
      max_memory_restart: '3G', // Restart if memory exceeds 1G
      
      // Error handling
      restart_delay: 4000,     // Delay between restarts (ms)
      exp_backoff_restart_delay: 100, // Exponential backoff
      
    //   Logging
    //   log_file: './logs/combined.log',
    //   out_file: './logs/out.log',
    //   error_file: './logs/error.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 4001,
        start : 0,
        end : 60
      },
    //   env_production: {
    //     NODE_ENV: 'production',
    //     PORT: 4001
    //   }
    }]
  };
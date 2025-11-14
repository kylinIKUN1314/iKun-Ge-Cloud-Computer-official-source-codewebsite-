/**
 * PM2配置文件
 * 用于生产环境的进程管理、监控和负载均衡
 */

module.exports = {
  apps: [
    {
      // 应用名称
      name: 'cloudpc-backend',
      
      // 启动文件
      script: 'src/server.js',
      
      // 实例数量
      instances: 1,
      
      // 自动重启
      autorestart: true,
      
      // 监控延迟（毫秒）
      watch: false,
      
      // 最大内存限制（超出时自动重启）
      max_memory_restart: '1G',
      
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      
      // 生产环境变量
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // 日志配置
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // 合并日志
      merge_logs: true,
      
      // 最小正常运行时间
      min_uptime: '10s',
      
      // 最大重启次数
      max_restarts: 10,
      
      // 启用集群模式
      exec_mode: 'fork',
      
      // 时间格式
      time: true,
      
      // 监听的文件变化（开发环境）
      watch_options: {
        followSymlinks: false,
        usePolling: true,
        alwaysFirst: true
      }
    }
  ],
  
  // 部署配置
  deploy: {
    // 生产环境
    production: {
      user: 'ubuntu',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/cloudpc-backend.git',
      path: '/var/www/cloudpc-backend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    
    // 开发环境
    development: {
      user: 'developer',
      host: ['dev-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/cloudpc-backend.git',
      path: '/var/www/cloudpc-backend-dev',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env development'
    }
  }
};
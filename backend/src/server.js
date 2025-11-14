const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const morgan = require('morgan');
const path = require('path');

// 导入路由
const authRoutes = require('./routes/auth');
const cloudPCRoutes = require('./routes/cloudpc');
const userRoutes = require('./routes/users');

// 导入中间件
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');
const logger = require('./utils/logger');

// 导入数据库连接
const { connect, healthCheck: dbHealthCheck, getConnectionStatus } = require('./config/database');

// 导入WebSocket服务
const { initializeCloudPCWebSocket } = require('./services/websocket');

// 导入缓存服务
const cacheService = require('./services/cacheService');

// 导入监控服务
const monitoringService = require('./services/monitoringService');
const client = require('prom-client');

// 创建Express应用
const app = express();
const server = createServer(app);

// 基本中间件配置
app.use(helmet({
  contentSecurityPolicy: false // 开发环境禁用CSP
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 安全中间件
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// 请求日志和性能监控中间件
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // 记录请求开始时间
  req.startTime = startTime;
  
  // 扩展响应对象以监控响应时间
  const originalSend = res.send;
  res.send = function(data) {
    const duration = (Date.now() - req.startTime) / 1000;
    
    // 记录HTTP请求指标
    monitoringService.recordHttpRequest(
      req.method,
      req.route ? req.route.path : req.path,
      res.statusCode.toString(),
      duration
    );
    
    return originalSend.call(this, data);
  };
  
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  next();
});

// 速率限制配置
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100个请求
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
    retryAfter: '15分钟'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 认证API专用限制
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 认证API最多5次尝试
  message: {
    success: false,
    error: '认证请求过于频繁，请稍后再试',
    retryAfter: '15分钟'
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

// 应用速率限制
app.use('/api/', generalLimiter);

// 健康检查端点
app.get('/health', (req, res) => {
  const health = {
    success: true,
    message: '服务运行正常',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };
  
  res.status(200).json(health);
});

// 数据库健康检查端点
app.get('/health/database', async (req, res) => {
  try {
    const dbStatus = await dbHealthCheck();
    const statusCode = dbStatus.status === 'connected' ? 200 : 503;
    
    res.status(statusCode).json({
      success: dbStatus.status === 'connected',
      data: dbStatus
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: '数据库健康检查失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 缓存健康检查端点
app.get('/health/cache', async (req, res) => {
  try {
    const cacheHealth = await cacheService.healthCheck();
    const statusCode = cacheHealth.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: cacheHealth.status === 'healthy',
      data: cacheHealth
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: '缓存健康检查失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 系统信息端点
app.get('/health/system', (req, res) => {
  const systemInfo = {
    success: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.status(200).json(systemInfo);
});

// 缓存统计端点
app.get('/stats/cache', async (req, res) => {
  try {
    const metrics = await cacheService.getMetrics();
    
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取缓存统计信息失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Prometheus指标端点
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await monitoringService.getMetrics();
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取Prometheus指标失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 监控统计端点
app.get('/stats/monitoring', (req, res) => {
  try {
    const performanceStats = monitoringService.getPerformanceStats();
    
    res.status(200).json({
      success: true,
      data: {
        performance: performanceStats,
        health: monitoringService.getHealthStatus()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取监控统计信息失败',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 连接状态端点
app.get('/status', (req, res) => {
  const connectionStatus = getConnectionStatus();
  
  res.status(200).json({
    success: true,
    data: {
      server: {
        status: 'running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      },
      database: connectionStatus,
      websocket: 'initialized' // WebSocket服务状态
    }
  });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/cloudpc', cloudPCRoutes);
app.use('/api/users', userRoutes);

// 静态文件服务（用于生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// 404处理
app.use(notFound);

// 错误处理
app.use(errorHandler);

// 服务器配置
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';

// 初始化数据库和启动服务器
const startServer = async () => {
  try {
    // 连接数据库
    await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudpc');
    logger.info('数据库连接成功');
    
    // 初始化缓存服务
    try {
      await cacheService.initialize();
      logger.info('缓存服务初始化成功');
      
      // 执行缓存预热
      if (process.env.NODE_ENV === 'production') {
        await cacheService.warmup();
      }
    } catch (cacheError) {
      logger.warn('缓存服务初始化失败，但服务器继续运行:', cacheError.message);
    }
    
    // 初始化监控服务
    try {
      // 设置定期更新监控指标
      setInterval(() => {
        monitoringService.updateMemoryUsage();
      }, 30000); // 每30秒更新内存使用指标
      
      logger.info('监控服务初始化成功');
    } catch (monitoringError) {
      logger.warn('监控服务初始化失败，但服务器继续运行:', monitoringError.message);
    }
    
    // 初始化WebSocket服务
    initializeCloudPCWebSocket(server);
    logger.info('WebSocket服务初始化成功');
    
    // 启动服务器
    server.listen(PORT, HOST, () => {
      logger.info(`服务器运行在 ${HOST}:${PORT}`);
      logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🚀 服务器启动成功!`);
        console.log(`📍 地址: http://${HOST}:${PORT}`);
        console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📊 健康检查: http://${HOST}:${PORT}/health`);
        console.log(`🔌 WebSocket: ws://${HOST}:${PORT}/ws`);
        console.log(`⚡ 缓存统计: http://${HOST}:${PORT}/stats/cache`);
      }
    });
    
  } catch (error) {
    logger.error('服务器启动失败', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// 启动服务器
startServer();

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  logger.info(`收到 ${signal} 信号，开始优雅关闭服务器...`);
  
  server.close(async () => {
    logger.info('HTTP服务器已关闭');
    
    try {
      // 关闭缓存服务
      if (cacheService) {
        await cacheService.close();
        logger.info('缓存服务已关闭');
      }
      
      // 关闭监控服务
      if (monitoringService) {
        await monitoringService.cleanup();
        logger.info('监控服务已关闭');
      }
      
      // 关闭数据库连接
      const { database } = require('./config/database');
      await database.disconnect();
      logger.info('数据库连接已关闭');
      
      process.exit(0);
    } catch (error) {
      logger.error('关闭过程中出错', {
        error: error.message
      });
      process.exit(1);
    }
  });
  
  // 强制关闭超时
  setTimeout(() => {
    logger.error('强制关闭服务器');
    process.exit(1);
  }, 10000);
};

// 监听进程信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// 未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', {
    reason: reason,
    promise: promise
  });
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;
const client = require('prom-client');

// 初始化Prometheus注册表
const register = new client.Registry();

// 添加默认指标（内存使用、事件循环延迟等）
client.collectDefaultMetrics({ register });

// 自定义业务指标
const metrics = {
  // HTTP请求相关指标
  httpRequestDuration: new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP请求持续时间（秒）',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),
  
  httpRequestsTotal: new client.Counter({
    name: 'http_requests_total',
    help: 'HTTP请求总数',
    labelNames: ['method', 'route', 'status_code']
  }),

  // 应用业务指标
  activeCloudPCs: new client.Gauge({
    name: 'active_cloudpcs_total',
    help: '活跃云电脑总数'
  }),

  cloudPCStatus: new client.Gauge({
    name: 'cloudpc_status_total',
    help: '云电脑状态统计',
    labelNames: ['status']
  }),

  // 缓存指标
  cacheHits: new client.Counter({
    name: 'cache_hits_total',
    help: '缓存命中次数',
    labelNames: ['type']
  }),

  cacheMisses: new client.Counter({
    name: 'cache_misses_total',
    help: '缓存未命中次数',
    labelNames: ['type']
  }),

  cacheOperationDuration: new client.Histogram({
    name: 'cache_operation_duration_seconds',
    help: '缓存操作持续时间（秒）',
    labelNames: ['operation'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5]
  }),

  // 数据库连接指标
  dbConnectionsActive: new client.Gauge({
    name: 'db_connections_active',
    help: '活跃数据库连接数'
  }),

  dbOperationDuration: new client.Histogram({
    name: 'db_operation_duration_seconds',
    help: '数据库操作持续时间（秒）',
    labelNames: ['operation', 'collection'],
    buckets: [0.01, 0.1, 0.5, 1, 2, 5]
  }),

  // WebSocket指标
  activeWebSocketConnections: new client.Gauge({
    name: 'websocket_connections_active',
    help: '活跃WebSocket连接数'
  }),

  webSocketMessagesTotal: new client.Counter({
    name: 'websocket_messages_total',
    help: 'WebSocket消息总数',
    labelNames: ['type', 'direction']
  }),

  // 系统资源指标
  memoryUsageBytes: new client.Gauge({
    name: 'memory_usage_bytes',
    help: '内存使用量（字节）',
    labelNames: ['type']
  })
};

// 注册自定义指标
Object.values(metrics).forEach(metric => {
  register.registerMetric(metric);
});

class MonitoringService {
  constructor() {
    this.startTime = Date.now();
    this.metrics = metrics;
  }

  /**
   * 记录HTTP请求指标
   */
  recordHttpRequest(method, route, statusCode, duration) {
    this.metrics.httpRequestDuration
      .labels(method, route, statusCode)
      .observe(duration);
    
    this.metrics.httpRequestsTotal
      .labels(method, route, statusCode)
      .inc();
  }

  /**
   * 更新云电脑状态统计
   */
  updateCloudPCStats(stats) {
    // 更新活跃云电脑总数
    this.metrics.activeCloudPCs.set(stats.active || 0);
    
    // 更新各状态统计
    if (stats.byStatus) {
      Object.entries(stats.byStatus).forEach(([status, count]) => {
        this.metrics.cloudPCStatus.labels(status).set(count);
      });
    }
  }

  /**
   * 记录缓存操作
   */
  recordCacheOperation(operation, type, success, duration) {
    this.metrics.cacheOperationDuration
      .labels(operation)
      .observe(duration);
    
    const metricName = success ? 'cacheHits' : 'cacheMisses';
    this.metrics[metricName].labels(type).inc();
  }

  /**
   * 更新数据库连接状态
   */
  updateDbConnections(active) {
    this.metrics.dbConnectionsActive.set(active || 0);
  }

  /**
   * 记录数据库操作
   */
  recordDbOperation(operation, collection, duration) {
    this.metrics.dbOperationDuration
      .labels(operation, collection)
      .observe(duration);
  }

  /**
   * 更新WebSocket连接数
   */
  updateWebSocketConnections(active) {
    this.metrics.activeWebSocketConnections.set(active || 0);
  }

  /**
   * 记录WebSocket消息
   */
  recordWebSocketMessage(type, direction) {
    this.metrics.webSocketMessagesTotal.labels(type, direction).inc();
  }

  /**
   * 更新内存使用情况
   */
  updateMemoryUsage() {
    const memUsage = process.memoryUsage();
    
    this.metrics.memoryUsageBytes.labels('heap_used').set(memUsage.heapUsed);
    this.metrics.memoryUsageBytes.labels('heap_total').set(memUsage.heapTotal);
    this.metrics.memoryUsageBytes.labels('external').set(memUsage.external);
    this.metrics.memoryUsageBytes.labels('rss').set(memUsage.rss);
  }

  /**
   * 记录错误
   */
  recordError(errorType, context = {}) {
    // 可以添加错误相关的指标
    this.metrics.httpRequestsTotal
      .labels('ERROR', errorType, '500')
      .inc();
  }

  /**
   * 获取所有指标的文本格式
   */
  async getMetrics() {
    // 定期更新系统指标
    this.updateMemoryUsage();
    
    // 返回指标数据
    return await register.metrics();
  }

  /**
   * 健康检查
   */
  getHealthStatus() {
    const uptime = Date.now() - this.startTime;
    
    return {
      status: 'healthy',
      uptime: uptime,
      timestamp: new Date().toISOString(),
      metrics: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        activeConnections: this.metrics.activeWebSocketConnections.get()
      }
    };
  }

  /**
   * 获取系统性能统计
   */
  getPerformanceStats() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      eventLoopDelay: process.eventLoopDelay || 0
    };
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      // 重置所有计数器
      Object.values(this.metrics).forEach(metric => {
        if (typeof metric.reset === 'function') {
          metric.reset();
        }
      });
      
      // 清理注册表
      await register.clear();
      
      return { success: true };
    } catch (error) {
      console.error('监控服务清理失败:', error);
      return { success: false, error: error.message };
    }
  }
}

// 导出单例实例
module.exports = new MonitoringService();
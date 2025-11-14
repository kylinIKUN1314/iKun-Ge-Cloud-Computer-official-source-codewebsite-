/**
 * 缓存服务层
 * 提供统一的缓存操作接口和业务逻辑
 */

const redisManager = require('./redis');
const cacheStrategy = require('../config/cacheStrategy');
const monitoringService = require('./monitoringService');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.redisManager = redisManager;
    this.strategy = cacheStrategy;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
  }

  /**
   * 初始化缓存服务
   */
  async initialize() {
    try {
      await this.redisManager.initialize();
      logger.info('缓存服务初始化成功');
      return true;
    } catch (error) {
      logger.error('缓存服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置缓存
   */
  async set(type, key, data, customTTL = null) {
    const startTime = Date.now();
    
    try {
      const cacheKey = this.strategy.generateKey(type, key);
      const ttl = customTTL || this.strategy.getAdaptiveTTL(type, data);

      const success = await this.redisManager.set(cacheKey, data, ttl);
      
      if (success) {
        this.metrics.sets++;
        monitoringService.recordCacheOperation('set', type, true, (Date.now() - startTime) / 1000);
        logger.debug(`缓存设置成功 - 键: ${cacheKey}, TTL: ${ttl}秒`);
      } else {
        monitoringService.recordCacheOperation('set', type, false, (Date.now() - startTime) / 1000);
      }

      return success;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.errors++;
      monitoringService.recordCacheOperation('set', type, false, duration);
      logger.error(`缓存设置失败 - 类型: ${type}, 键: ${key}:`, error);
      return false;
    }
  }

  /**
   * 缓存获取
   */
  async get(type, key) {
    const startTime = Date.now();
    
    try {
      const cacheKey = this.strategy.generateKey(type, key);
      const data = await this.redisManager.get(cacheKey);
      const duration = (Date.now() - startTime) / 1000;
      
      if (data !== null) {
        this.metrics.hits++;
        monitoringService.recordCacheOperation('get', type, true, duration);
        logger.debug(`缓存命中 - 键: ${cacheKey}`);
        return data;
      } else {
        this.metrics.misses++;
        monitoringService.recordCacheOperation('get', type, false, duration);
        logger.debug(`缓存未命中 - 键: ${cacheKey}`);
        return null;
      }
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.errors++;
      monitoringService.recordCacheOperation('get', type, false, duration);
      logger.error(`缓存获取失败 - 类型: ${type}, 键: ${key}:`, error);
      return null;
    }
  }

  /**
   * 缓存删除
   */
  async delete(type, key) {
    try {
      const cacheKey = this.strategy.generateKey(type, key);
      const result = await this.redisManager.del(cacheKey);
      
      if (result > 0) {
        this.metrics.deletes++;
        logger.debug(`缓存删除成功 - 键: ${cacheKey}`);
      }

      return result;
    } catch (error) {
      this.metrics.errors++;
      logger.error(`缓存删除失败 - 类型: ${type}, 键: ${key}:`, error);
      return false;
    }
  }

  /**
   * 批量缓存失效
   */
  async invalidate(operation, data = {}) {
    try {
      const patterns = this.strategy.getInvalidationPatterns(operation, data);
      let totalDeleted = 0;

      for (const pattern of patterns) {
        // 支持通配符删除
        if (pattern.includes('*')) {
          const deleted = await this.redisManager.delPattern(pattern);
          totalDeleted += deleted;
          logger.debug(`模式删除完成 - 模式: ${pattern}, 数量: ${deleted}`);
        } else {
          const result = await this.redisManager.del(pattern);
          totalDeleted += result;
        }
      }

      logger.info(`批量缓存失效完成 - 操作: ${operation}, 总数: ${totalDeleted}`);
      return totalDeleted;
    } catch (error) {
      this.metrics.errors++;
      logger.error(`批量缓存失效失败 - 操作: ${operation}:`, error);
      return 0;
    }
  }

  /**
   * 用户会话缓存
   */
  async cacheUserSession(userId, sessionData, ttl = null) {
    return await this.set('session', userId, sessionData, ttl);
  }

  async getUserSession(userId) {
    return await this.get('session', userId);
  }

  async invalidateUserSession(userId) {
    return await this.invalidate('userLogout', { userId });
  }

  /**
   * 用户信息缓存
   */
  async cacheUser(userId, userData, ttl = null) {
    return await this.set('user', userId, userData, ttl);
  }

  async getUser(userId) {
    return await this.get('user', userId);
  }

  async invalidateUser(userId) {
    return await this.invalidate('userUpdated', { userId });
  }

  /**
   * 云电脑列表缓存
   */
  async cacheCloudPCList(query, data, ttl = null) {
    const cacheKey = JSON.stringify(query); // 使用查询参数作为key
    return await this.set('cloudpc', `list:${cacheKey}`, data, ttl);
  }

  async getCloudPCList(query) {
    const cacheKey = JSON.stringify(query);
    return await this.get('cloudpc', `list:${cacheKey}`);
  }

  async invalidateCloudPCCache(cloudpcId = null) {
    if (cloudpcId) {
      return await this.invalidate('cloudpcChanged', { cloudpcId });
    } else {
      return await this.invalidate('cloudpcChanged', {});
    }
  }

  /**
   * 统计数据缓存
   */
  async cacheStats(type, data, ttl = null) {
    return await this.set('stats', type, data, ttl);
  }

  async getStats(type) {
    return await this.get('stats', type);
  }

  async invalidateStats() {
    return await this.invalidate('stats', {});
  }

  /**
   * 配置缓存
   */
  async cacheConfig(configKey, data, ttl = null) {
    return await this.set('config', configKey, data, ttl);
  }

  async getConfig(configKey) {
    return await this.get('config', configKey);
  }

  async invalidateConfig() {
    return await this.invalidate('configUpdated', {});
  }

  /**
   * 实时数据缓存
   */
  async cacheRealtimeData(key, data, ttl = null) {
    return await this.set('realtime', key, data, ttl);
  }

  async getRealtimeData(key) {
    return await this.get('realtime', key);
  }

  /**
   * 缓存中间件生成器
   */
  generateMiddleware(type, keyGenerator = null, customTTL = null) {
    return async (req, res, next) => {
      try {
        // 生成缓存键
        const cacheKey = keyGenerator ? keyGenerator(req) : req.originalUrl;
        
        // 尝试从缓存获取
        const cachedData = await this.get(type, cacheKey);
        
        if (cachedData) {
          logger.debug(`API缓存命中: ${cacheKey}`);
          return res.json({
            success: true,
            data: cachedData,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }

        // 重写res.json来缓存响应
        const originalJson = res.json;
        res.json = async function(data) {
          try {
            if (data && data.success !== false) {
              await this.set(type, cacheKey, data, customTTL);
              logger.debug(`API响应已缓存: ${cacheKey}`);
            }
          } catch (error) {
            logger.error('缓存API响应失败:', error);
          }
          return originalJson.call(this, data);
        }.bind(this);

        next();
      } catch (error) {
        logger.error('缓存中间件错误:', error);
        next();
      }
    };
  }

  /**
   * 获取缓存统计信息
   */
  async getMetrics() {
    const redisStats = await this.redisManager.getStats();
    
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests * 100).toFixed(2) : 0;
    
    return {
      redis: redisStats,
      application: {
        hits: this.metrics.hits,
        misses: this.metrics.misses,
        hitRate: `${hitRate}%`,
        sets: this.metrics.sets,
        deletes: this.metrics.deletes,
        errors: this.metrics.errors,
        uptime: process.uptime()
      }
    };
  }

  /**
   * 重置统计信息
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    logger.info('缓存统计信息已重置');
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const isHealthy = await this.redisManager.isHealthy();
      const metrics = await this.getMetrics();
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        redis: isHealthy,
        metrics: metrics.application,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('缓存健康检查失败:', error);
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 缓存预热
   */
  async warmup() {
    try {
      const warmupPlans = this.strategy.getWarmupPlan();
      let successCount = 0;
      
      logger.info('开始缓存预热...');
      
      for (const plan of warmupPlans) {
        try {
          for (const key of plan.keys) {
            // 这里可以添加具体的预热逻辑
            // 例如：从数据库加载基础数据并缓存
            await this.set(plan.type, key, { 
              warmed: true, 
              timestamp: new Date().toISOString() 
            });
            successCount++;
          }
        } catch (error) {
          logger.error(`预热失败 - 类型: ${plan.type}:`, error);
        }
      }
      
      logger.info(`缓存预热完成 - 成功数量: ${successCount}`);
      return successCount;
    } catch (error) {
      logger.error('缓存预热失败:', error);
      return 0;
    }
  }

  /**
   * 关闭缓存服务
   */
  async close() {
    try {
      await this.redisManager.close();
      logger.info('缓存服务已关闭');
    } catch (error) {
      logger.error('关闭缓存服务时出错:', error);
      throw error;
    }
  }
}

// 创建单例实例
const cacheService = new CacheService();

module.exports = cacheService;
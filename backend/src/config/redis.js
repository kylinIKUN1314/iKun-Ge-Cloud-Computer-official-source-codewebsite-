/**
 * Redis配置和连接管理
 * 提供Redis连接池和缓存配置
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisManager {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * 初始化Redis连接
   */
  async initialize() {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        
        // 连接池配置
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableOfflineQueue: true,
        
        // 重连配置
        lazyConnect: false,
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          return err.message.includes(targetError);
        },
        
        // 保持连接配置
        keepAlive: true,
        family: 4, // IPv4
        connectTimeout: 10000,
        commandTimeout: 5000,
        
        // 自动重连
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          if (times > this.maxReconnectAttempts) {
            throw new Error('Redis重连次数超过限制');
          }
          return delay;
        }
      };

      this.redis = new Redis(redisConfig);

      // 监听连接事件
      this.redis.on('connect', () => {
        logger.info('Redis连接已建立');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.redis.on('ready', () => {
        logger.info('Redis连接已就绪');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.redis.on('error', (err) => {
        logger.error('Redis连接错误:', err);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        logger.warn('Redis连接已关闭');
        this.isConnected = false;
      });

      this.redis.on('reconnecting', () => {
        this.reconnectAttempts++;
        logger.info(`Redis正在重连... (第${this.reconnectAttempts}次)`);
      });

      // 测试连接
      await this.redis.ping();
      logger.info('Redis连接测试成功');

    } catch (error) {
      logger.error('Redis初始化失败:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * 获取Redis客户端实例
   */
  getClient() {
    if (!this.isConnected || !this.redis) {
      throw new Error('Redis未连接');
    }
    return this.redis;
  }

  /**
   * 检查Redis连接状态
   */
  async isHealthy() {
    try {
      if (!this.redis) return false;
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 关闭Redis连接
   */
  async close() {
    try {
      if (this.redis) {
        await this.redis.quit();
        this.redis = null;
        this.isConnected = false;
        logger.info('Redis连接已关闭');
      }
    } catch (error) {
      logger.error('关闭Redis连接时出错:', error);
      throw error;
    }
  }

  /**
   * 获取缓存键的完整名称
   */
  getCacheKey(prefix, key) {
    return `${prefix}:${key}`;
  }

  /**
   * 设置缓存
   */
  async set(key, value, ttl = 3600) {
    try {
      const client = this.getClient();
      const serializedValue = JSON.stringify(value);
      
      if (ttl > 0) {
        await client.setex(key, ttl, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      logger.debug(`缓存设置成功: ${key}`);
      return true;
    } catch (error) {
      logger.error('设置缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存
   */
  async get(key) {
    try {
      const client = this.getClient();
      const value = await client.get(key);
      
      if (value === null) {
        logger.debug(`缓存未命中: ${key}`);
        return null;
      }
      
      logger.debug(`缓存命中: ${key}`);
      return JSON.parse(value);
    } catch (error) {
      logger.error('获取缓存失败:', error);
      return null;
    }
  }

  /**
   * 删除缓存
   */
  async del(key) {
    try {
      const client = this.getClient();
      const result = await client.del(key);
      logger.debug(`缓存删除: ${key}, 影响行数: ${result}`);
      return result;
    } catch (error) {
      logger.error('删除缓存失败:', error);
      return false;
    }
  }

  /**
   * 批量删除缓存
   */
  async delPattern(pattern) {
    try {
      const client = this.getClient();
      const keys = await client.keys(pattern);
      
      if (keys.length > 0) {
        await client.del(...keys);
        logger.debug(`批量删除缓存: ${pattern}, 删除数量: ${keys.length}`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error('批量删除缓存失败:', error);
      return 0;
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key) {
    try {
      const client = this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('检查缓存键存在性失败:', error);
      return false;
    }
  }

  /**
   * 获取键的TTL
   */
  async ttl(key) {
    try {
      const client = this.getClient();
      const ttl = await client.ttl(key);
      return ttl;
    } catch (error) {
      logger.error('获取缓存TTL失败:', error);
      return -2;
    }
  }

  /**
   * 清除所有缓存
   */
  async flushAll() {
    try {
      const client = this.getClient();
      await client.flushall();
      logger.info('所有缓存已清除');
      return true;
    } catch (error) {
      logger.error('清除所有缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    try {
      const client = this.getClient();
      const info = await client.info('stats');
      
      const stats = {
        connected: this.isConnected,
        serverTime: new Date().toISOString(),
      };

      // 解析Redis info统计信息
      info.split('\r\n').forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key && value) {
            stats[key] = parseInt(value) || value;
          }
        }
      });

      return stats;
    } catch (error) {
      logger.error('获取Redis统计信息失败:', error);
      return null;
    }
  }

  /**
   * 缓存中间件
   */
  middleware(ttl = 3600, keyGenerator = null) {
    return async (req, res, next) => {
      try {
        // 生成缓存键
        const cacheKey = keyGenerator ? keyGenerator(req) : this.getCacheKey('api', req.originalUrl);
        
        // 尝试从缓存获取
        const cachedData = await this.get(cacheKey);
        
        if (cachedData) {
          logger.debug(`从缓存返回: ${cacheKey}`);
          return res.json({
            success: true,
            data: cachedData,
            fromCache: true
          });
        }

        // 重写res.json来缓存响应
        const originalJson = res.json;
        res.json = async function(data) {
          try {
            if (data && data.success !== false) {
              await this.set(cacheKey, data, ttl);
            }
          } catch (error) {
            logger.error('缓存响应失败:', error);
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
}

// 创建单例实例
const redisManager = new RedisManager();

module.exports = redisManager;
/**
 * 缓存策略配置
 * 定义不同类型数据的缓存策略
 */

class CacheStrategy {
  constructor() {
    this.strategies = {
      // 云电脑相关缓存 (60分钟)
      cloudpc: {
        ttl: 3600,
        prefix: 'cloudpc'
      },
      
      // 用户会话缓存 (24小时)
      session: {
        ttl: 86400,
        prefix: 'session'
      },
      
      // 用户信息缓存 (2小时)
      user: {
        ttl: 7200,
        prefix: 'user'
      },
      
      // API响应缓存 (10分钟)
      api: {
        ttl: 600,
        prefix: 'api'
      },
      
      // 统计数据缓存 (30分钟)
      stats: {
        ttl: 1800,
        prefix: 'stats'
      },
      
      // 系统配置缓存 (1小时)
      config: {
        ttl: 3600,
        prefix: 'config'
      },
      
      // 实时数据缓存 (5分钟)
      realtime: {
        ttl: 300,
        prefix: 'realtime'
      },
      
      // 操作日志缓存 (10分钟)
      logs: {
        ttl: 600,
        prefix: 'logs'
      }
    };
  }

  /**
   * 根据类型获取缓存策略
   */
  getStrategy(type) {
    return this.strategies[type] || this.strategies.api;
  }

  /**
   * 生成缓存键
   */
  generateKey(type, ...args) {
    const strategy = this.getStrategy(type);
    const suffix = args.length > 0 ? ':' + args.join(':') : '';
    return `${strategy.prefix}${suffix}`;
  }

  /**
   * 获取TTL
   */
  getTTL(type) {
    return this.getStrategy(type).ttl;
  }

  /**
   * 检查是否应该缓存
   */
  shouldCache(type, operation = 'read') {
    const strategy = this.getStrategy(type);
    
    // 对于写操作，通常不缓存
    if (operation === 'write') {
      return ['config', 'user'].includes(type);
    }
    
    // 对于读操作，根据类型决定
    const cacheableTypes = ['cloudpc', 'user', 'api', 'stats', 'config', 'logs'];
    return cacheableTypes.includes(type);
  }

  /**
   * 获取缓存失效策略
   */
  getInvalidationRules() {
    return {
      // 当用户信息更新时，需要失效的缓存类型
      userUpdated: ['user', 'session'],
      
      // 当云电脑创建/更新/删除时，需要失效的缓存类型
      cloudpcChanged: ['cloudpc', 'stats', 'api'],
      
      // 当配置更新时，需要失效的缓存类型
      configUpdated: ['config', 'api'],
      
      // 当登录时，需要处理的缓存
      userLogin: ['session', 'user'],
      
      // 当登出时，需要清理的缓存
      userLogout: ['session']
    };
  }

  /**
   * 获取需要失效的缓存键模式
   */
  getInvalidationPatterns(operation, data = {}) {
    const rules = this.getInvalidationRules();
    const patterns = [];
    
    switch (operation) {
      case 'userUpdated':
        patterns.push(
          this.generateKey('user', data.userId),
          this.generateKey('session', data.userId)
        );
        break;
        
      case 'cloudpcChanged':
        patterns.push(
          this.generateKey('cloudpc'),
          this.generateKey('cloudpc', data.cloudpcId),
          this.generateKey('stats')
        );
        break;
        
      case 'configUpdated':
        patterns.push(this.generateKey('config'));
        break;
        
      case 'userLogin':
        patterns.push(this.generateKey('session', data.userId));
        break;
        
      case 'userLogout':
        patterns.push(this.generateKey('session', data.userId));
        break;
        
      default:
        patterns.push(this.generateKey(operation));
    }
    
    return patterns;
  }

  /**
   * 自适应TTL策略
   */
  getAdaptiveTTL(type, data) {
    const baseTTL = this.getTTL(type);
    
    // 根据数据量和复杂性调整TTL
    if (type === 'api') {
      const dataSize = JSON.stringify(data).length;
      if (dataSize > 10000) {
        // 大数据减少缓存时间
        return Math.floor(baseTTL * 0.5);
      } else if (dataSize < 1000) {
        // 小数据增加缓存时间
        return Math.floor(baseTTL * 1.5);
      }
    }
    
    return baseTTL;
  }

  /**
   * 缓存预热策略
   */
  getWarmupPlan() {
    return [
      {
        type: 'config',
        keys: ['system', 'pricing', 'features'],
        priority: 1
      },
      {
        type: 'stats',
        keys: ['overview'],
        priority: 2
      },
      {
        type: 'cloudpc',
        keys: ['templates'],
        priority: 3
      }
    ];
  }
}

// 创建单例实例
const cacheStrategy = new CacheStrategy();

module.exports = cacheStrategy;
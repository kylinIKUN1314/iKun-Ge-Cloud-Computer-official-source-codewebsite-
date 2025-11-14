const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * 数据库连接管理类
 * 提供MongoDB连接、断开、健康检查等功能
 */
class DatabaseConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5秒
  }

  /**
   * 连接MongoDB数据库
   * @param {string} connectionString - 数据库连接字符串
   * @returns {Promise<mongoose.Connection>} 数据库连接对象
   */
  async connect(connectionString) {
    try {
      if (this.isConnected) {
        logger.info('数据库已连接，跳过重复连接');
        return this.connection;
      }

      // 验证连接字符串
      if (!connectionString) {
        throw new Error('数据库连接字符串未提供');
      }

      logger.info('正在连接MongoDB数据库...', {
        host: connectionString.split('@')[1] || 'localhost'
      });

      // MongoDB连接选项
      const options = {
        maxPoolSize: 10, // 最大连接池大小
        serverSelectionTimeoutMS: 5000, // 服务器选择超时
        socketTimeoutMS: 45000, // socket超时
        bufferMaxEntries: 0, // 禁用mongoose缓冲
        bufferCommands: false, // 禁用命令缓冲
        useNewUrlParser: true,
        useUnifiedTopology: true,
        // 认证选项
        authSource: 'admin',
        retryWrites: true,
        w: 'majority'
      };

      // 建立连接
      this.connection = await mongoose.connect(connectionString, options);
      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('MongoDB数据库连接成功', {
        host: this.connection.host,
        port: this.connection.port,
        name: this.connection.name
      });

      // 设置连接事件监听
      this.setupEventListeners();

      return this.connection;

    } catch (error) {
      logger.error('MongoDB数据库连接失败', {
        error: error.message,
        stack: error.stack
      });
      
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * 断开数据库连接
   */
  async disconnect() {
    try {
      if (!this.isConnected || !this.connection) {
        logger.info('数据库未连接，无需断开');
        return;
      }

      logger.info('正在断开MongoDB数据库连接...');
      
      await mongoose.disconnect();
      this.connection = null;
      this.isConnected = false;
      
      logger.info('MongoDB数据库连接已断开');

    } catch (error) {
      logger.error('断开MongoDB数据库连接时发生错误', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 检查数据库健康状态
   * @returns {Promise<Object>} 健康状态信息
   */
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return {
          status: 'disconnected',
          message: '数据库未连接',
          timestamp: new Date().toISOString()
        };
      }

      // 检查连接状态
      const readyState = mongoose.connection.readyState;
      const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      // 执行ping操作
      await mongoose.connection.db.admin().ping();
      
      const stats = await mongoose.connection.db.stats();
      
      return {
        status: states[readyState] || 'unknown',
        message: '数据库连接正常',
        timestamp: new Date().toISOString(),
        host: this.connection.host,
        port: this.connection.port,
        name: this.connection.name,
        collections: stats.collections,
        dataSize: stats.dataSize,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize
      };

    } catch (error) {
      logger.error('数据库健康检查失败', {
        error: error.message
      });
      
      return {
        status: 'error',
        message: `数据库健康检查失败: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 设置连接事件监听器
   */
  setupEventListeners() {
    if (!this.connection) return;

    // 连接成功事件
    this.connection.on('connected', () => {
      logger.info('Mongoose已连接到MongoDB');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    // 连接错误事件
    this.connection.on('error', (error) => {
      logger.error('Mongoose连接错误', {
        error: error.message,
        stack: error.stack
      });
      this.isConnected = false;
    });

    // 连接断开事件
    this.connection.on('disconnected', () => {
      logger.warn('Mongoose已从MongoDB断开连接');
      this.isConnected = false;
      
      // 尝试重连
      this.attemptReconnect();
    });

    // 重新连接事件
    this.connection.on('reconnected', () => {
      logger.info('Mongoose重新连接到MongoDB');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    // 完全断开事件
    this.connection.on('close', () => {
      logger.info('Mongoose连接已完全关闭');
      this.isConnected = false;
    });

    // 认证错误事件
    this.connection.on('authError', (error) => {
      logger.error('Mongoose认证错误', {
        error: error.message
      });
    });
  }

  /**
   * 尝试重新连接
   */
  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('达到最大重连次数，停止重连尝试', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      return;
    }

    this.reconnectAttempts++;
    logger.info(`尝试重新连接数据库 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000
        });
      } catch (error) {
        logger.error('重连失败', {
          attempt: this.reconnectAttempts,
          error: error.message
        });
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      }
    }, this.reconnectDelay);
  }

  /**
   * 获取连接状态信息
   * @returns {Object} 连接状态信息
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: this.connection?.host || 'N/A',
      port: this.connection?.port || 'N/A',
      name: this.connection?.name || 'N/A',
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      readyStateText: this.getReadyStateText()
    };
  }

  /**
   * 获取连接状态文本描述
   * @returns {string} 状态描述
   */
  getReadyStateText() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState] || 'unknown';
  }

  /**
   * 创建数据库索引
   * @param {string} modelName - 模型名称
   * @param {Array} indexes - 索引定义数组
   */
  async createIndexes(modelName, indexes) {
    try {
      if (!this.isConnected) {
        throw new Error('数据库未连接，无法创建索引');
      }

      const Model = mongoose.model(modelName);
      const results = [];

      for (const index of indexes) {
        try {
          const result = await Model.collection.createIndex(index.fields, index.options);
          results.push({
            index: result,
            fields: index.fields,
            options: index.options,
            status: 'success'
          });
          
          logger.info(`索引创建成功`, {
            model: modelName,
            index: result,
            fields: index.fields
          });
        } catch (error) {
          results.push({
            index: index.fields,
            error: error.message,
            status: 'failed'
          });
          
          logger.error(`索引创建失败`, {
            model: modelName,
            fields: index.fields,
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      logger.error('创建索引时发生错误', {
        modelName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 清理数据库连接池
   */
  async cleanup() {
    try {
      if (this.isConnected) {
        // 关闭所有连接
        await mongoose.disconnect();
        
        // 清除连接池
        if (mongoose.connection.db) {
          await mongoose.connection.db.close();
        }
        
        logger.info('数据库连接池已清理');
      }
    } catch (error) {
      logger.error('清理数据库连接池时发生错误', {
        error: error.message
      });
    }
  }
}

// 创建单例实例
const dbConnection = new DatabaseConnection();

// 导出数据库连接实例和方法
module.exports = {
  dbConnection,
  connect: (connectionString) => dbConnection.connect(connectionString),
  disconnect: () => dbConnection.disconnect(),
  healthCheck: () => dbConnection.healthCheck(),
  getConnectionStatus: () => dbConnection.getConnectionStatus()
};

// 处理进程信号，确保优雅关闭
process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号，正在关闭数据库连接...');
  await dbConnection.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，正在关闭数据库连接...');
  await dbConnection.disconnect();
  process.exit(0);
});

// 处理未捕获的异常
process.on('uncaughtException', async (error) => {
  logger.error('未捕获的异常，正在关闭数据库连接...', {
    error: error.message,
    stack: error.stack
  });
  await dbConnection.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('未处理的Promise拒绝，正在关闭数据库连接...', {
    reason: reason,
    promise: promise
  });
  await dbConnection.disconnect();
  process.exit(1);
});
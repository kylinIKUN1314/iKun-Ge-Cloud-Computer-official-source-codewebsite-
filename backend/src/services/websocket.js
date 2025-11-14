const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// WebSocket连接管理
class WebSocketManager {
  constructor() {
    this.clients = new Map(); // 存储客户端连接
    this.cloudPCConnections = new Map(); // 存储云电脑连接
  }

  // 初始化WebSocket服务器
  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      clientTracking: true
    });

    // 连接处理
    this.wss.on('connection', this.handleConnection.bind(this));
    
    logger.info('WebSocket服务器初始化成功');
  }

  // 处理新连接
  handleConnection(ws, req) {
    try {
      // 解析URL和查询参数
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const cloudPCId = url.searchParams.get('cloudPCId');
      const connectionType = url.searchParams.get('type') || 'general';

      // 验证token
      if (!token) {
        ws.close(1008, '需要认证令牌');
        return;
      }

      // 验证JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      // 存储连接信息
      ws.userId = userId;
      ws.cloudPCId = cloudPCId;
      ws.connectionType = connectionType;
      ws.isAlive = true;

      // 添加到客户端列表
      this.clients.set(ws, {
        userId,
        cloudPCId,
        connectionType,
        connectedAt: new Date()
      });

      // 如果是云电脑连接，添加到云电脑连接列表
      if (cloudPCId) {
        if (!this.cloudPCConnections.has(cloudPCId)) {
          this.cloudPCConnections.set(cloudPCId, new Set());
        }
        this.cloudPCConnections.get(cloudPCId).add(ws);
      }

      logger.info('WebSocket连接建立', {
        userId,
        cloudPCId,
        connectionType,
        ip: ws._socket.remoteAddress
      });

      // 发送连接成功消息
      this.sendMessage(ws, {
        type: 'connected',
        message: '连接建立成功',
        timestamp: new Date().toISOString()
      });

      // 监听消息
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      // 监听关闭
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      // 监听错误
      ws.on('error', (error) => {
        logger.error('WebSocket错误', {
          error: error.message,
          userId: ws.userId,
          cloudPCId: ws.cloudPCId
        });
      });

      // 心跳检测
      ws.on('pong', () => {
        ws.isAlive = true;
      });

    } catch (error) {
      logger.error('WebSocket连接错误', {
        error: error.message,
        stack: error.stack
      });
      ws.close(1008, '认证失败');
    }
  }

  // 处理消息
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      logger.info('收到WebSocket消息', {
        userId: ws.userId,
        type,
        cloudPCId: ws.cloudPCId
      });

      switch (type) {
        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;

        case 'cloudpc_control':
          this.handleCloudPCControl(ws, payload);
          break;

        case 'terminal_command':
          this.handleTerminalCommand(ws, payload);
          break;

        case 'clipboard':
          this.handleClipboard(ws, payload);
          break;

        default:
          logger.warn('未知的消息类型', { type });
      }
    } catch (error) {
      logger.error('消息处理错误', {
        error: error.message,
        userId: ws.userId
      });
    }
  }

  // 处理云电脑控制命令
  handleCloudPCControl(ws, payload) {
    const { action, cloudPCId, data } = payload;

    // 验证用户权限
    const client = this.clients.get(ws);
    if (!client || client.cloudPCId !== cloudPCId) {
      this.sendMessage(ws, {
        type: 'error',
        message: '无权执行此操作',
        timestamp: new Date().toISOString()
      });
      return;
    }

    switch (action) {
      case 'start':
        this.sendToCloudPC(cloudPCId, {
          type: 'start',
          userId: ws.userId,
          timestamp: new Date().toISOString()
        });
        break;

      case 'stop':
        this.sendToCloudPC(cloudPCId, {
          type: 'stop',
          userId: ws.userId,
          timestamp: new Date().toISOString()
        });
        break;

      case 'restart':
        this.sendToCloudPC(cloudPCId, {
          type: 'restart',
          userId: ws.userId,
          timestamp: new Date().toISOString()
        });
        break;

      case 'status_request':
        this.requestCloudPCStatus(cloudPCId);
        break;

      default:
        this.sendMessage(ws, {
          type: 'error',
          message: '不支持的控制命令',
          timestamp: new Date().toISOString()
        });
    }
  }

  // 处理终端命令
  handleTerminalCommand(ws, payload) {
    const { command, cloudPCId } = payload;

    // 验证用户权限
    const client = this.clients.get(ws);
    if (!client || client.cloudPCId !== cloudPCId) {
      this.sendMessage(ws, {
        type: 'error',
        message: '无权执行此操作',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 模拟执行命令（在实际项目中这里会转发到云电脑）
    const output = this.simulateTerminalCommand(command);
    
    this.sendMessage(ws, {
      type: 'terminal_output',
      command,
      output,
      timestamp: new Date().toISOString()
    });

    logger.info('终端命令执行', {
      userId: ws.userId,
      cloudPCId,
      command
    });
  }

  // 处理剪贴板同步
  handleClipboard(ws, payload) {
    const { content, cloudPCId } = payload;

    // 验证用户权限
    const client = this.clients.get(ws);
    if (!client || client.cloudPCId !== cloudPCId) {
      return;
    }

    // 转发剪贴板内容到云电脑
    this.sendToCloudPC(cloudPCId, {
      type: 'clipboard_update',
      content,
      userId: ws.userId,
      timestamp: new Date().toISOString()
    });
  }

  // 处理断开连接
  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    
    if (client) {
      // 从云电脑连接中移除
      if (client.cloudPCId && this.cloudPCConnections.has(client.cloudPCId)) {
        this.cloudPCConnections.get(client.cloudPCId).delete(ws);
      }

      // 移除客户端连接
      this.clients.delete(ws);

      logger.info('WebSocket连接断开', {
        userId: client.userId,
        cloudPCId: client.cloudPCId,
        connectionType: client.connectionType,
        duration: Date.now() - client.connectedAt.getTime()
      });
    }
  }

  // 发送消息到特定客户端
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // 发送消息到所有连接到指定云电脑的客户端
  sendToCloudPC(cloudPCId, message) {
    if (this.cloudPCConnections.has(cloudPCId)) {
      const connections = this.cloudPCConnections.get(cloudPCId);
      connections.forEach(ws => {
        this.sendMessage(ws, message);
      });
    }
  }

  // 请求云电脑状态
  requestCloudPCStatus(cloudPCId) {
    // 在实际项目中，这里会发送状态请求到云电脑
    this.sendToCloudPC(cloudPCId, {
      type: 'status_response',
      status: 'running',
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      timestamp: new Date().toISOString()
    });
  }

  // 模拟终端命令执行
  simulateTerminalCommand(command) {
    const responses = {
      'dir': 'Directory of C:\\Users\\CloudPC\\Desktop',
      'ls': 'total 8\ndrwxr-xr-x 3 CloudPC users 4096 Jan 15 10:30 Documents\ndrwxr-xr-x 3 CloudPC users 4096 Jan 15 10:30 Downloads',
      'pwd': '/home/cloudpc',
      'whoami': 'cloudpc',
      'date': new Date().toString(),
      'ipconfig': 'IPv4 Address: 192.168.1.100',
      'ifconfig': 'inet 192.168.1.100 netmask 255.255.255.0'
    };

    return responses[command.toLowerCase().split(' ')[0]] || `Command executed: ${command}`;
  }

  // 获取连接统计
  getConnectionStats() {
    const totalConnections = this.clients.size;
    const cloudPCConnections = this.cloudPCConnections.size;
    
    const connectionsByType = {};
    this.clients.forEach(client => {
      connectionsByType[client.connectionType] = 
        (connectionsByType[client.connectionType] || 0) + 1;
    });

    return {
      totalConnections,
      cloudPCConnections,
      connectionsByType
    };
  }

  // 启动心跳检测
  startHeartbeat() {
    const interval = setInterval(() => {
      this.clients.forEach(ws => {
        if (ws.isAlive === false) {
          ws.terminate();
          this.clients.delete(ws);
        } else {
          ws.isAlive = false;
          ws.ping();
        }
      });
    }, 30000); // 每30秒检查一次

    return interval;
  }
}

// 创建全局实例
const wsManager = new WebSocketManager();

// 中间件函数
const initializeWebSocket = (server) => {
  wsManager.initialize(server);
  wsManager.startHeartbeat();
};

// 导出实例和方法
module.exports = {
  wsManager,
  initializeWebSocket
};
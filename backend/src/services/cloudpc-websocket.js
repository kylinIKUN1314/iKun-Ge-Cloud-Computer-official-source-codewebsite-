const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// WebSocket连接管理
class CloudPCWebSocketService {
  constructor() {
    this.connections = new Map(); // 存储所有WebSocket连接
    this.cloudPCConnections = new Map(); // 存储云电脑连接映射
    this.terminalSessions = new Map(); // 存储终端会话
  }

  // 初始化WebSocket服务
  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/cloudpc',
      clientTracking: true
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    logger.info('云电脑WebSocket服务初始化成功');
  }

  // 处理新连接
  handleConnection(ws, req) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const cloudPCId = url.searchParams.get('cloudPCId');
      const sessionId = url.searchParams.get('sessionId') || this.generateSessionId();

      if (!token || !cloudPCId) {
        ws.close(1008, '缺少必要的认证参数');
        return;
      }

      // 验证JWT token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        ws.close(1008, '无效的认证令牌');
        return;
      }

      // 存储连接信息
      const connectionInfo = {
        userId: decoded.id,
        cloudPCId,
        sessionId,
        connectedAt: new Date(),
        isAlive: true,
        userAgent: req.headers['user-agent']
      };

      ws.connectionInfo = connectionInfo;
      this.connections.set(ws, connectionInfo);

      // 映射云电脑连接
      if (!this.cloudPCConnections.has(cloudPCId)) {
        this.cloudPCConnections.set(cloudPCId, new Set());
      }
      this.cloudPCConnections.get(cloudPCId).add(ws);

      logger.info('云电脑WebSocket连接建立', {
        userId: decoded.id,
        cloudPCId,
        sessionId,
        userAgent: req.headers['user-agent']
      });

      // 发送连接成功响应
      this.sendMessage(ws, {
        type: 'connection_established',
        message: '云电脑连接建立成功',
        data: {
          sessionId,
          cloudPCId,
          timestamp: new Date().toISOString()
        }
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
        logger.error('云电脑WebSocket错误', {
          error: error.message,
          sessionId,
          cloudPCId
        });
      });

      // 心跳检测
      ws.on('pong', () => {
        ws.connectionInfo.isAlive = true;
      });

      // 初始化Web终端会话
      this.initializeTerminalSession(ws, cloudPCId, sessionId);

    } catch (error) {
      logger.error('WebSocket连接处理错误', {
        error: error.message,
        stack: error.stack
      });
      ws.close(1011, '服务器内部错误');
    }
  }

  // 处理消息
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      logger.debug('收到WebSocket消息', {
        type,
        sessionId: ws.connectionInfo.sessionId,
        cloudPCId: ws.connectionInfo.cloudPCId
      });

      switch (type) {
        case 'terminal_input':
          this.handleTerminalInput(ws, payload);
          break;
        case 'terminal_resize':
          this.handleTerminalResize(ws, payload);
          break;
        case 'clipboard_sync':
          this.handleClipboardSync(ws, payload);
          break;
        case 'mouse_event':
          this.handleMouseEvent(ws, payload);
          break;
        case 'keyboard_event':
          this.handleKeyboardEvent(ws, payload);
          break;
        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        default:
          logger.warn('未知的消息类型', { type });
      }
    } catch (error) {
      logger.error('消息处理错误', {
        error: error.message,
        sessionId: ws.connectionInfo?.sessionId
      });
      this.sendMessage(ws, {
        type: 'error',
        message: '消息格式错误',
        timestamp: new Date().toISOString()
      });
    }
  }

  // 初始化终端会话
  initializeTerminalSession(ws, cloudPCId, sessionId) {
    const terminalSession = {
      id: sessionId,
      cloudPCId,
      userId: ws.connectionInfo.userId,
      createdAt: new Date(),
      isActive: true,
      commands: [],
      output: []
    };

    this.terminalSessions.set(sessionId, terminalSession);

    // 发送欢迎消息
    this.sendMessage(ws, {
      type: 'terminal_welcome',
      message: '云电脑Web终端已连接',
      data: {
        sessionId,
        cloudPCId,
        welcomeMessage: '欢迎使用云电脑Web终端！输入 help 命令查看可用命令。'
      }
    });
  }

  // 处理终端输入
  handleTerminalInput(ws, payload) {
    const { command, sessionId } = payload;
    const terminalSession = this.terminalSessions.get(sessionId);

    if (!terminalSession) {
      this.sendMessage(ws, {
        type: 'terminal_error',
        message: '终端会话不存在',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 记录命令
    terminalSession.commands.push({
      command,
      timestamp: new Date(),
      userId: ws.connectionInfo.userId
    });

    // 模拟命令执行
    const output = this.executeCommand(command, terminalSession);
    
    // 记录输出
    terminalSession.output.push({
      command,
      output,
      timestamp: new Date()
    });

    // 限制历史记录数量
    if (terminalSession.commands.length > 100) {
      terminalSession.commands.shift();
      terminalSession.output.shift();
    }

    // 发送输出
    this.sendMessage(ws, {
      type: 'terminal_output',
      data: {
        sessionId,
        command,
        output,
        timestamp: new Date().toISOString()
      }
    });

    logger.info('终端命令执行', {
      sessionId,
      cloudPCId: terminalSession.cloudPCId,
      command
    });
  }

  // 模拟命令执行
  executeCommand(command, session) {
    const trimmedCommand = command.trim().toLowerCase();
    
    const commands = {
      'help': this.getHelpMessage(),
      'clear': { type: 'clear', message: '清屏' },
      'whoami': 'cloudpc',
      'pwd': '/home/cloudpc',
      'ls': this.listDirectory(),
      'dir': this.listDirectory(),
      'ps': this.listProcesses(),
      'top': this.showSystemInfo(),
      'systeminfo': this.showSystemInfo(),
      'ipconfig': 'Windows IP Configuration',
      'ifconfig': 'Network configuration',
      'netstat': 'Active connections',
      'date': new Date().toString(),
      'uname': 'CloudPC Linux 4.19.0',
      'uptime': this.getUptime(),
      'df': this.showDiskUsage(),
      'free': this.showMemoryUsage(),
      'hostname': 'cloudpc-instance',
      'history': this.getCommandHistory(session),
      'exit': { type: 'exit', message: '退出终端会话' },
      'logout': { type: 'exit', message: '登出系统' }
    };

    if (trimmedCommand.startsWith('cat ')) {
      const fileName = trimmedCommand.substring(4).trim();
      return this.readFile(fileName);
    }

    if (trimmedCommand.startsWith('echo ')) {
      return trimmedCommand.substring(5).trim();
    }

    if (trimmedCommand.startsWith('mkdir ')) {
      const dirName = trimmedCommand.substring(6).trim();
      return `目录 "${dirName}" 已创建`;
    }

    if (trimmedCommand.startsWith('rm ')) {
      const fileName = trimmedCommand.substring(3).trim();
      return `文件 "${fileName}" 已删除`;
    }

    if (trimmedCommand.startsWith('cp ')) {
      return '文件复制完成';
    }

    if (trimmedCommand.startsWith('mv ')) {
      return '文件移动完成';
    }

    if (trimmedCommand.startsWith('chmod ')) {
      return '权限修改完成';
    }

    if (trimmedCommand.startsWith('sudo ')) {
      return '需要管理员权限';
    }

    if (commands[trimmedCommand]) {
      return commands[trimmedCommand];
    }

    if (trimmedCommand === '') {
      return '';
    }

    return `bash: ${command}: 命令未找到\n输入 'help' 查看可用命令。`;
  }

  // 获取帮助信息
  getHelpMessage() {
    return `
云电脑Web终端帮助

可用命令：
  基本命令：
    help          - 显示此帮助信息
    clear         - 清屏
    whoami        - 显示当前用户
    pwd           - 显示当前目录
    ls/dir        - 列出目录内容
    cat           - 显示文件内容
    echo          - 显示文本
    mkdir         - 创建目录
    rm            - 删除文件
    cp            - 复制文件
    mv            - 移动文件
    chmod         - 修改权限

  系统信息：
    ps            - 显示进程
    top           - 显示系统信息
    uname         - 显示系统信息
    hostname      - 显示主机名
    uptime        - 显示运行时间
    date          - 显示日期时间

  网络：
    ipconfig      - 显示网络配置
    ifconfig      - 显示网络接口
    netstat       - 显示网络连接

  磁盘：
    df            - 显示磁盘使用情况
    free          - 显示内存使用情况

  其他：
    history       - 显示命令历史
    exit/logout   - 退出终端

联系技术支持获取更多帮助。
    `.trim();
  }

  // 列出目录内容
  listDirectory() {
    return `total 16
drwxr-xr-x 2 cloudpc cloudpc 4096 Jan 15 10:00 Desktop
drwxr-xr-xr-x 2 cloudpc cloudpc 4096 Jan 15 10:00 Documents  
drwxr-xr-xr-x 2 cloudpc cloudpc 4096 Jan 15 10:00 Downloads
-rw-r--r-- 1 cloudpc cloudpc 1234 Jan 15 10:00 readme.txt
-rw-r--r-- 1 cloudpc cloudpc 5678 Jan 15 10:00 config.json`;
  }

  // 列出进程
  listProcesses() {
    return `  PID TTY          TIME CMD
    1 ?        00:00:01 systemd
  1234 ?        00:00:00 cloudpc-service
  5678 pts/0    00:00:00 bash
  9012 pts/0    00:00:00 web-terminal`;
  }

  // 显示系统信息
  showSystemInfo() {
    return `系统负载: 0.15, 0.10, 0.05
CPU: Intel(R) Xeon(R) Gold 6248R @ 3.00GHz (4 cores)
内存: 8.0GB total, 4.2GB used, 3.8GB free
磁盘: 100GB total, 45.2GB used, 54.8GB free
运行时间: 2 days, 14 hours, 30 minutes`;
  }

  // 显示磁盘使用情况
  showDiskUsage() {
    return `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/sda1       104857600 46213120  58644640  45% /
tmpfs            8388608         0   8388608   0% /dev/shm
/dev/sdb1       209715200 125829120  83886080  60% /data`;
  }

  // 显示内存使用情况
  showMemoryUsage() {
    return `              total        used        free      shared  buff/cache   available
Mem:        8388608     4404019      987654      123456     2994935     3772159
Swap:       2097152           0     2097152`;
  }

  // 获取运行时间
  getUptime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    return `${days} days, ${hours} hours, ${minutes} minutes`;
  }

  // 获取命令历史
  getCommandHistory(session) {
    const recentCommands = session.commands
      .slice(-10)
      .map((cmd, index) => `${index + 1}  ${cmd.command}`)
      .join('\n');
    return recentCommands || '没有命令历史';
  }

  // 读取文件
  readFile(fileName) {
    const files = {
      'readme.txt': `欢迎使用云电脑服务！

这是一个示例云电脑环境。您可以通过Web终端管理文件和运行命令。

如需技术支持，请联系客服。`,
      'config.json': `{
  "cloudpc": {
    "instance_id": "cloudpc_123456789",
    "os": "Ubuntu 20.04",
    "cpu": 4,
    "memory": 8,
    "storage": 100,
    "status": "running"
  }
}`,
      'log.txt': `[2024-01-15 10:00:00] System started
[2024-01-15 10:05:00] User logged in
[2024-01-15 10:10:00] Terminal session started`
    };

    if (files[fileName]) {
      return files[fileName];
    }

    return `cat: ${fileName}: No such file or directory`;
  }

  // 处理终端窗口调整
  handleTerminalResize(ws, payload) {
    const { cols, rows, sessionId } = payload;
    const terminalSession = this.terminalSessions.get(sessionId);

    if (terminalSession) {
      terminalSession.resizeInfo = { cols, rows };
      this.sendMessage(ws, {
        type: 'terminal_resized',
        data: {
          sessionId,
          cols,
          rows,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // 处理剪贴板同步
  handleClipboardSync(ws, payload) {
    const { content, action, sessionId } = payload;
    
    // 同步剪贴板内容到云电脑
    this.sendMessage(ws, {
      type: 'clipboard_synced',
      data: {
        sessionId,
        action,
        timestamp: new Date().toISOString()
      }
    });
  }

  // 处理鼠标事件
  handleMouseEvent(ws, payload) {
    // 模拟鼠标事件处理
    this.sendMessage(ws, {
      type: 'mouse_event_ack',
      data: {
        timestamp: new Date().toISOString()
      }
    });
  }

  // 处理键盘事件
  handleKeyboardEvent(ws, payload) {
    // 模拟键盘事件处理
    this.sendMessage(ws, {
      type: 'keyboard_event_ack',
      data: {
        timestamp: new Date().toISOString()
      }
    });
  }

  // 处理断开连接
  handleDisconnect(ws) {
    const connectionInfo = this.connections.get(ws);
    if (!connectionInfo) return;

    // 清理连接映射
    this.connections.delete(ws);
    
    if (this.cloudPCConnections.has(connectionInfo.cloudPCId)) {
      this.cloudPCConnections.get(connectionInfo.cloudPCId).delete(ws);
      if (this.cloudPCConnections.get(connectionInfo.cloudPCId).size === 0) {
        this.cloudPCConnections.delete(connectionInfo.cloudPCId);
      }
    }

    // 清理终端会话
    if (this.terminalSessions.has(connectionInfo.sessionId)) {
      const session = this.terminalSessions.get(connectionInfo.sessionId);
      session.isActive = false;
    }

    logger.info('云电脑WebSocket连接断开', {
      sessionId: connectionInfo.sessionId,
      cloudPCId: connectionInfo.cloudPCId,
      duration: Date.now() - connectionInfo.connectedAt.getTime()
    });
  }

  // 发送消息
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('发送WebSocket消息失败', {
          error: error.message,
          sessionId: ws.connectionInfo?.sessionId
        });
      }
    }
  }

  // 生成会话ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取连接统计
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      cloudPCConnections: this.cloudPCConnections.size,
      terminalSessions: this.terminalSessions.size,
      activeSessions: Array.from(this.terminalSessions.values())
        .filter(session => session.isActive).length
    };
  }

  // 启动心跳检测
  startHeartbeat() {
    setInterval(() => {
      this.connections.forEach((connectionInfo, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          if (!connectionInfo.isAlive) {
            ws.terminate();
            this.connections.delete(ws);
          } else {
            connectionInfo.isAlive = false;
            ws.ping();
          }
        }
      });
    }, 30000); // 30秒
  }
}

// 创建服务实例
const cloudPCWebSocketService = new CloudPCWebSocketService();

// 导出服务和方法
module.exports = {
  cloudPCWebSocketService,
  initializeCloudPCWebSocket: (server) => {
    cloudPCWebSocketService.initialize(server);
    cloudPCWebSocketService.startHeartbeat();
  }
};
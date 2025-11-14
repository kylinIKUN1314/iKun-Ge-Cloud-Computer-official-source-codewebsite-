# 坤哥云电脑平台后端服务

一个基于Express.js和MongoDB的云电脑平台后端API服务，支持用户认证、云电脑管理、实时通信等功能。

## 🚀 功能特性

- **用户认证系统**：JWT令牌认证、用户注册登录、角色管理
- **云电脑管理**：创建、配置、启动、停止云电脑实例
- **实时通信**：WebSocket支持云电脑远程连接和控制
- **安全管理**：输入验证、CORS配置、速率限制
- **日志监控**：结构化日志记录、健康检查端点
- **错误处理**：全局错误处理、自定义错误类

## 📋 系统要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- MongoDB >= 5.0
- Windows/Linux/macOS

## 🛠️ 安装指南

### 1. 克隆项目

```bash
git clone <your-repository-url>
cd cloudpc-backend
```

### 2. 安装依赖

```bash
npm install
```

### 3. 环境配置

复制环境变量文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要参数：

```env
# 服务器配置
NODE_ENV=development
PORT=5000
HOST=localhost

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/cloudpc

# JWT配置
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=7d

# 前端URL
FRONTEND_URL=http://localhost:3000
```

### 4. 启动服务

开发环境：
```bash
npm run dev
```

生产环境：
```bash
npm start
```

## 📚 API文档

### 认证API

#### 用户注册
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123",
  "fullName": "测试用户"
}
```

#### 用户登录
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123"
}
```

#### 获取当前用户信息
```
GET /api/auth/me
Authorization: Bearer <token>
```

### 云电脑API

#### 获取云电脑列表
```
GET /api/cloudpc
Authorization: Bearer <token>
```

#### 创建云电脑
```
POST /api/cloudpc
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "我的云电脑",
  "configuration": {
    "cpu": 2,
    "memory": 4,
    "storage": 50
  }
}
```

#### 启动云电脑
```
POST /api/cloudpc/:id/start
Authorization: Bearer <token>
```

### 管理API

#### 获取用户列表（管理员）
```
GET /api/users
Authorization: Bearer <token>
```

#### 更新用户角色（管理员）
```
PATCH /api/users/:id/role
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin"
}
```

## 🔌 WebSocket连接

### 连接端点
```
ws://localhost:5000/ws
```

### 认证
连接时需要在查询参数中包含JWT令牌：
```
ws://localhost:5000/ws?token=<jwt_token>
```

### 支持的消息类型

#### 云电脑控制
```json
{
  "type": "cloudpc_control",
  "action": "start",
  "cloudpcId": "cloudpc123"
}
```

#### 终端命令
```json
{
  "type": "terminal_command",
  "cloudpcId": "cloudpc123",
  "command": "ls -la"
}
```

#### 剪贴板同步
```json
{
  "type": "clipboard_sync",
  "cloudpcId": "cloudpc123",
  "content": "同步的文本内容"
}
```

## 🔧 配置说明

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| NODE_ENV | 运行环境 | development |
| PORT | 服务器端口 | 5000 |
| HOST | 服务器主机 | localhost |
| MONGODB_URI | MongoDB连接字符串 | mongodb://localhost:27017/cloudpc |
| JWT_SECRET | JWT密钥 | - |
| JWT_EXPIRE | JWT过期时间 | 7d |
| FRONTEND_URL | 前端应用URL | http://localhost:3000 |

### 中间件配置

#### 速率限制
- 普通API：100请求/15分钟
- 认证API：5请求/15分钟

#### 安全配置
- Helmet安全头
- CORS跨域支持
- XSS防护
- NoSQL注入防护

## 📁 项目结构

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # 数据库配置
│   ├── middleware/
│   │   ├── auth.js             # 认证中间件
│   │   ├── errorHandler.js     # 错误处理
│   │   └── validation.js       # 输入验证
│   ├── models/
│   │   ├── User.js             # 用户模型
│   │   └── CloudPC.js          # 云电脑模型
│   ├── routes/
│   │   ├── auth.js             # 认证路由
│   │   ├── cloudpc.js          # 云电脑路由
│   │   └── users.js            # 用户管理路由
│   ├── services/
│   │   ├── websocket.js        # WebSocket服务
│   │   └── cloudpc-websocket.js # 云电脑WebSocket
│   ├── utils/
│   │   └── logger.js           # 日志工具
│   └── server.js               # 应用入口
├── package.json
├── .env.example
└── README.md
```

## 🧪 测试

### 运行测试
```bash
npm test
```

### 测试覆盖率
```bash
npm run test:coverage
```

## 🚀 部署指南

### Docker部署

1. 创建Dockerfile：
```dockerfile
FROM node:16-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 5000

CMD ["npm", "start"]
```

2. 构建镜像：
```bash
docker build -t cloudpc-backend .
```

3. 运行容器：
```bash
docker run -p 5000:5000 --env-file .env cloudpc-backend
```

### PM2部署

1. 安装PM2：
```bash
npm install -g pm2
```

2. 创建ecosystem.config.js：
```javascript
module.exports = {
  apps: [{
    name: 'cloudpc-backend',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
```

3. 启动应用：
```bash
pm2 start ecosystem.config.js --env production
```

## 📊 监控和日志

### 健康检查端点
- `GET /health` - 基础健康检查
- `GET /health/database` - 数据库健康检查
- `GET /health/system` - 系统信息
- `GET /status` - 详细状态信息

### 日志文件
- 错误日志：`logs/error.log`
- 综合日志：`logs/combined.log`
- 日志轮转：按天轮转，保留30天

## 🔒 安全考虑

1. **JWT令牌安全**
   - 使用强密钥
   - 设置合适的过期时间
   - 定期轮换令牌

2. **输入验证**
   - 所有输入都经过验证
   - 防止SQL/NoSQL注入
   - XSS防护

3. **CORS配置**
   - 限制允许的域名
   - 仅允许必要的HTTP方法
   - 禁用通配符配置

4. **速率限制**
   - API请求限制
   - 认证尝试限制
   - IP黑白名单

## 🤝 贡献指南

1. Fork项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 📄 许可证

本项目使用MIT许可证。详情请见LICENSE文件。

## 🆘 故障排除

### 常见问题

#### 1. 数据库连接失败
- 检查MongoDB服务是否运行
- 验证连接字符串是否正确
- 确认防火墙设置

#### 2. JWT令牌无效
- 检查JWT_SECRET是否设置
- 验证令牌是否过期
- 确认令牌格式正确

#### 3. WebSocket连接失败
- 确认端口未被占用
- 检查CORS配置
- 验证认证令牌

### 日志分析

查看详细日志：
```bash
tail -f logs/combined.log
```

错误日志：
```bash
tail -f logs/error.log
```

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 项目Issues：[GitHub Issues](https://github.com/kylinIKUN1314)
- 邮箱：1685563877@qq.com

---

© 2025 坤哥IKUN. 保留所有权利。
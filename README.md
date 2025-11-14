# 坤哥云电脑官网 CloudPC

这个是坤哥一个一个代码编写的云电脑官网,现在开源给大家用,希望大家在用的时候记得在主页备注一下我,坤哥，我编写这个官网不易，感谢支持

一个现代化的云电脑管理平台，提供云端计算资源的服务、管理和控制功能。

## 🌟 项目概述

坤哥云电脑官网是一个全栈Web应用，采用现代化的前后端分离架构，为用户提供云端计算资源的管理服务。

### 技术栈

**前端：**
- ⚛️ **React 18** - 现代UI框架
- 📘 **TypeScript** - 类型安全的JavaScript
- ⚡ **Vite** - 快速的构建工具
- 🎨 **Tailwind CSS** - 实用优先的CSS框架
- 🔗 **React Router** - 客户端路由管理

**后端：**
- 🚀 **Node.js** - JavaScript运行时
- 🌐 **Express.js** - Web应用框架
- 📊 **MongoDB** - NoSQL数据库
- 🔄 **WebSocket** - 实时通信
- 🔐 **JWT** - 用户认证
- 🛡️ **Helmet** - 安全中间件

## 📁 项目结构

```
云电脑官网/
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── components/      # 可复用组件
│   │   ├── pages/          # 页面组件
│   │   ├── services/       # API服务
│   │   └── lib/            # 工具库
│   ├── public/             # 静态资源
│   └── package.json        # 前端依赖配置
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── middleware/     # 中间件
│   │   ├── models/         # 数据模型
│   │   ├── routes/         # 路由定义
│   │   ├── services/       # 业务服务
│   │   ├── utils/          # 工具函数
│   │   └── scripts/        # 脚本文件
│   ├── tests/              # 测试文件
│   ├── package.json        # 后端依赖配置
│   └── pm2.config.js       # PM2配置
└── docs/                   # 项目文档
```

## 🚀 快速开始

### 系统要求

- **Node.js** >= 16.0.0
- **MongoDB** >= 5.0
- **npm** >= 8.0.0
- **Git** (可选)

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd 云电脑官网
   ```

2. **安装后端依赖**
   ```bash
   cd backend
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，配置您的数据库连接和其他设置
   ```

4. **初始化数据库**
   ```bash
   node scripts/seed.js
   ```

5. **安装前端依赖**
   ```bash
   cd ../frontend
   npm install
   ```

6. **启动开发服务器**
   
   后端服务 (端口 3000):
   ```bash
   cd backend
   npm run dev
   ```
   
   前端服务 (端口 5173):
   ```bash
   cd frontend
   npm run dev
   ```

7. **访问应用**
   - 前端: http://localhost:5173
   - 后端API: http://localhost:3000/api
   - 健康检查: http://localhost:3000/api/health

## 📋 主要功能

### 🏠 首页
- 现代化的着陆页设计
- 产品特性展示
- 定价计划说明
- 用户注册入口

### 👤 用户认证
- 用户注册和登录
- JWT令牌认证
- 密码强度验证
- 会话管理

### 🖥️ 云电脑管理
- 创建和管理云电脑实例
- 配置CPU、内存、存储
- 实时状态监控
- 启动/停止/重启操作
- 资源使用统计

### 📊 用户仪表板
- 个人资料管理
- 云电脑概览
- 使用统计图表
- 账单和支付历史

### 🔧 管理后台
- 用户管理
- 云电脑资源分配
- 系统监控
- 日志查看

## 🔧 开发指南

### 后端开发

```bash
# 进入后端目录
cd backend

# 启动开发模式 (支持热重载)
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build

# 启动生产服务
npm start
```

### 前端开发

```bash
# 进入前端目录
cd frontend

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 代码检查
npm run lint

# 类型检查
npm run type-check
```

### 数据库操作

```bash
# 初始化测试数据
npm run seed

# 数据库备份
npm run db:backup

# 数据库恢复
npm run db:restore
```

## 🧪 测试

项目包含完整的测试套件：

### 后端测试
```bash
cd backend
npm test                    # 运行所有测试
npm run test:watch         # 监听模式运行测试
npm run test:coverage      # 生成测试覆盖率报告
```

### 前端测试
```bash
cd frontend
npm test                   # 运行组件测试
npm run test:ui           # 交互式测试界面
```

## 📦 部署

### 自动部署

**Linux/macOS:**
```bash
cd backend
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**Windows:**
```cmd
cd backend
scripts\deploy.bat
```

### 手动部署

#### 后端部署
```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start pm2.config.js --env production

# 监控应用
pm2 monit
```

#### 前端部署
```bash
# 构建前端
cd frontend
npm run build

# 部署到服务器
# 将 dist/ 目录内容上传到Web服务器
```

### Docker部署 (可选)

```bash
# 构建并运行容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 🔧 配置

### 环境变量

项目使用环境变量进行配置，主要配置项：

**后端配置 (.env):**
```env
# 服务器配置
NODE_ENV=development
PORT=3000

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/cloudpc

# JWT配置
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# 前端配置
FRONTEND_URL=http://localhost:5173

# 云电脑配置
CLOUDPC_BASE_URL=http://cloudpc-provider.com
CLOUDPC_WS_PORT=8080
```

### 数据库配置

项目使用MongoDB作为主要数据库，支持：
- 本地MongoDB实例
- MongoDB Atlas云数据库
- 自定义连接字符串

### 缓存配置

项目集成了Redis用于会话管理和缓存：
- 用户会话存储
- API响应缓存
- 临时数据存储

## 🔒 安全特性

- **JWT认证** - 安全的用户认证机制
- **密码加密** - bcrypt加密存储
- **SQL注入防护** - MongoDB查询验证
- **XSS防护** - 输入数据清理
- **CSRF防护** - 跨站请求伪造防护
- **率限制** - API调用频率限制
- **CORS配置** - 跨域资源共享控制
- **安全头** - Helmet安全中间件

## 📊 监控和日志

### 日志系统
- **Winston** - 结构化日志记录
- **日志轮转** - 自动日志文件管理
- **日志级别** - 不同环境的日志级别
- **日志格式** - JSON格式便于解析

### 监控指标
- **API响应时间** - 请求性能监控
- **错误率统计** - 系统健康度监控
- **资源使用率** - 服务器资源监控
- **WebSocket连接** - 实时连接监控

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

### 代码规范
- 使用 ESLint 进行代码检查
- 遵循 Prettier 代码格式化规范
- 编写单元测试和集成测试
- 更新相关文档

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 故障排除

### 常见问题

**Q: MongoDB连接失败**
```bash
# 检查MongoDB服务状态
sudo systemctl status mongod

# 重启MongoDB服务
sudo systemctl restart mongod
```

**Q: 前端构建失败**
```bash
# 清除npm缓存
npm cache clean --force

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

**Q: WebSocket连接异常**
- 检查防火墙设置
- 确认端口配置正确
- 查看浏览器控制台错误

### 调试模式

**后端调试:**
```bash
# 启用详细日志
DEBUG=app:* npm run dev

# 或使用nodemon
DEBUG=app:* nodemon src/server.js
```

**前端调试:**
```bash
# 启用React Developer Tools
npm run dev -- --debug
```

## 📞 支持

如有问题或建议，请：
1. 查看 [FAQ](docs/FAQ.md)
2. 搜索现有的 [Issues](issues)
3. 创建新的 [Issue](issues/new)

## 🎯 路线图

### v1.1.0 (计划中)
- [ ] 支付系统集成
- [ ] 多租户支持
- [ ] API版本控制
- [ ] 国际化支持

### v1.2.0 (规划中)
- [ ] 移动端适配
- [ ] 离线功能支持
- [ ] 数据导出功能
- [ ] 高级统计分析

---

**Happy Coding! 🎉**
整个云电脑官网项目现在具备了企业级的监控、部署和运维能力！🎊
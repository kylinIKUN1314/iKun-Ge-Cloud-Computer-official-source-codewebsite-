@echo off
setlocal enabledelayedexpansion

REM 云电脑官网后端部署脚本 (Windows)
REM 用于快速部署和配置云电脑官网后端服务

set SCRIPT_NAME=云电脑官网后端部署脚本

echo ==================================
echo    %SCRIPT_NAME%
echo ==================================
echo.

REM 检查Node.js
echo [INFO] 检查Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo [SUCCESS] Node.js已安装: !NODE_VERSION!
)

REM 检查npm
echo [INFO] 检查npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到npm，请检查Node.js安装
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo [SUCCESS] npm已安装: !NPM_VERSION!
)

REM 检查package.json
if not exist "package.json" (
    echo [ERROR] 未找到package.json文件，请在项目根目录运行此脚本
    pause
    exit /b 1
)

REM 安装项目依赖
echo [INFO] 安装项目依赖...
npm install
if errorlevel 1 (
    echo [ERROR] 依赖安装失败
    pause
    exit /b 1
)
echo [SUCCESS] 项目依赖安装完成

REM 配置环境变量
echo [INFO] 配置环境变量...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [SUCCESS] 已从.env.example创建.env文件
        echo [WARNING] 请编辑.env文件以配置您的环境变量
    ) else (
        echo [ERROR] 未找到.env.example文件
        pause
        exit /b 1
    )
) else (
    echo [INFO] .env文件已存在，跳过创建
)

REM 运行数据库初始化
echo.
set /p INIT_DB="是否运行数据库初始化脚本? (y/N): "
if /i "!INIT_DB!"=="y" (
    echo [INFO] 运行数据库初始化...
    node scripts\seed.js
    if errorlevel 1 (
        echo [WARNING] 数据库初始化可能失败，请检查MongoDB连接
    ) else (
        echo [SUCCESS] 数据库初始化完成
    )
) else (
    echo [INFO] 跳过数据库初始化
)

REM 运行测试
echo.
set /p RUN_TESTS="是否运行API测试? (y/N): "
if /i "!RUN_TESTS!"=="y" (
    echo [INFO] 运行API测试...
    npm test
    if errorlevel 1 (
        echo [WARNING] 测试失败，请检查代码和配置
    ) else (
        echo [SUCCESS] 测试完成
    )
) else (
    echo [INFO] 跳过测试
)

REM 启动应用
echo.
set /p START_APP="是否启动应用? (y/N): "
if /i "!START_APP!"=="y" (
    echo [INFO] 您可以使用以下命令启动应用:
    echo   开发模式: npm run dev
    echo   生产模式: npm start
    echo.
    echo [INFO] 安装PM2进行生产部署:
    echo   npm install -g pm2
    echo   pm2 start src\server.js --name cloudpc-backend
) else (
    echo [INFO] 应用未启动
)

echo.
echo ==================================
echo [SUCCESS] 部署脚本执行完成!
echo ==================================
echo.
echo 后续步骤:
echo 1. 编辑.env文件配置环境变量
echo 2. 运行 npm run dev 启动开发服务器
echo 3. 访问 http://localhost:3000/api/health 检查服务状态
echo.

pause
#!/bin/bash

# 云电脑官网后端部署脚本
# 用于快速部署和配置云电脑官网后端服务

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "检测到以root用户运行，建议使用非root用户运行此脚本"
        read -p "是否继续? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检查系统类型
check_system() {
    log_info "检查系统环境..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get >/dev/null 2>&1; then
            PACKAGE_MANAGER="apt"
        elif command -v yum >/dev/null 2>&1; then
            PACKAGE_MANAGER="yum"
        elif command -v dnf >/dev/null 2>&1; then
            PACKAGE_MANAGER="dnf"
        else
            log_error "不支持的Linux发行版"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        PACKAGE_MANAGER="brew"
    else
        log_error "不支持的操作系统: $OSTYPE"
        exit 1
    fi
    
    log_success "系统检查完成: $PACKAGE_MANAGER"
}

# 安装Node.js
install_nodejs() {
    log_info "检查Node.js..."
    
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        log_success "Node.js已安装: $NODE_VERSION"
        
        # 检查版本是否满足要求
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$MAJOR_VERSION" -lt 16 ]; then
            log_warning "Node.js版本过低，建议升级到16或更高版本"
        fi
    else
        log_info "安装Node.js..."
        
        case $PACKAGE_MANAGER in
            "apt")
                curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
                sudo apt-get install -y nodejs
                ;;
            "yum"|"dnf")
                curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
                sudo $PACKAGE_MANAGER install -y nodejs
                ;;
            "brew")
                brew install node
                ;;
            *)
                log_error "无法自动安装Node.js，请手动安装"
                exit 1
                ;;
        esac
        
        log_success "Node.js安装完成"
    fi
}

# 安装MongoDB
install_mongodb() {
    log_info "检查MongoDB..."
    
    if command -v mongod >/dev/null 2>&1; then
        MONGO_VERSION=$(mongod --version | head -n1)
        log_success "MongoDB已安装: $MONGO_VERSION"
    else
        log_info "安装MongoDB..."
        
        case $PACKAGE_MANAGER in
            "apt")
                # 添加MongoDB官方仓库
                wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
                echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
                sudo apt-get update
                sudo apt-get install -y mongodb-org
                ;;
            "yum")
                # 添加MongoDB官方仓库
                cat > /tmp/mongodb-org-6.0.repo <<EOF
[mongodb-org-6.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/6.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-6.0.asc
EOF
                sudo mv /tmp/mongodb-org-6.0.repo /etc/yum.repos.d/mongodb-org-6.0.repo
                sudo $PACKAGE_MANAGER install -y mongodb-org
                ;;
            "brew")
                brew tap mongodb/brew
                brew install mongodb-community@6.0
                ;;
            *)
                log_error "无法自动安装MongoDB，请手动安装"
                exit 1
                ;;
        esac
        
        log_success "MongoDB安装完成"
    fi
}

# 安装Redis
install_redis() {
    log_info "检查Redis..."
    
    if command -v redis-server >/dev/null 2>&1; then
        REDIS_VERSION=$(redis-server --version)
        log_success "Redis已安装: $REDIS_VERSION"
    else
        log_info "安装Redis..."
        
        case $PACKAGE_MANAGER in
            "apt")
                sudo apt-get update
                sudo apt-get install -y redis-server
                ;;
            "yum"|"dnf")
                sudo $PACKAGE_MANAGER install -y redis
                ;;
            "brew")
                brew install redis
                ;;
            *)
                log_error "无法自动安装Redis，请手动安装"
                exit 1
                ;;
        esac
        
        log_success "Redis安装完成"
    fi
}

# 配置系统服务
configure_services() {
    log_info "配置系统服务..."
    
    # 配置MongoDB
    if [[ "$PACKAGE_MANAGER" == "apt" ]]; then
        sudo systemctl enable mongod
        sudo systemctl start mongod
    elif [[ "$PACKAGE_MANAGER" == "yum" || "$PACKAGE_MANAGER" == "dnf" ]]; then
        sudo systemctl enable mongod
        sudo systemctl start mongod
    elif [[ "$PACKAGE_MANAGER" == "brew" ]]; then
        # macOS使用launchctl
        brew services start mongodb/brew/mongodb-community
    fi
    
    # 配置Redis
    if [[ "$PACKAGE_MANAGER" == "apt" ]]; then
        sudo systemctl enable redis-server
        sudo systemctl start redis-server
    elif [[ "$PACKAGE_MANAGER" == "yum" || "$PACKAGE_MANAGER" == "dnf" ]]; then
        sudo systemctl enable redis
        sudo systemctl start redis
    elif [[ "$PACKAGE_MANAGER" == "brew" ]]; then
        brew services start redis
    fi
    
    log_success "系统服务配置完成"
}

# 安装项目依赖
install_dependencies() {
    log_info "安装项目依赖..."
    
    if [ ! -f "package.json" ]; then
        log_error "未找到package.json文件，请在项目根目录运行此脚本"
        exit 1
    fi
    
    npm install
    
    log_success "项目依赖安装完成"
}

# 配置环境变量
configure_environment() {
    log_info "配置环境变量..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "已从.env.example创建.env文件"
            log_warning "请编辑.env文件以配置您的环境变量"
        else
            log_error "未找到.env.example文件"
            exit 1
        fi
    else
        log_info ".env文件已存在，跳过创建"
    fi
}

# 初始化数据库
init_database() {
    log_info "初始化数据库..."
    
    read -p "是否运行数据库初始化脚本? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node scripts/seed.js
        log_success "数据库初始化完成"
    else
        log_info "跳过数据库初始化"
    fi
}

# 运行测试
run_tests() {
    log_info "运行测试..."
    
    read -p "是否运行API测试? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm test
        log_success "测试完成"
    else
        log_info "跳过测试"
    fi
}

# 启动应用
start_application() {
    log_info "启动应用..."
    
    read -p "是否启动应用? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "使用以下命令启动应用:"
        echo "  开发模式: npm run dev"
        echo "  生产模式: npm start"
        echo ""
        log_info "您也可以使用PM2进行生产部署:"
        echo "  npm install -g pm2"
        echo "  pm2 start src/server.js --name cloudpc-backend"
    else
        log_info "应用未启动"
    fi
}

# 主函数
main() {
    echo "=================================="
    echo "   云电脑官网后端部署脚本"
    echo "=================================="
    echo
    
    check_root
    check_system
    install_nodejs
    install_mongodb
    install_redis
    configure_services
    install_dependencies
    configure_environment
    init_database
    run_tests
    start_application
    
    echo
    log_success "部署脚本执行完成!"
    echo
    echo "后续步骤:"
    echo "1. 编辑.env文件配置环境变量"
    echo "2. 运行 npm run dev 启动开发服务器"
    echo "3. 访问 http://localhost:3000/api/health 检查服务状态"
    echo
}

# 执行主函数
main "$@"
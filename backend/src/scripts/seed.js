#!/usr/bin/env node

/**
 * 数据库初始化脚本
 * 用于创建初始用户、云电脑配置和索引
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// 导入模型
const User = require('../models/User');
const CloudPC = require('../models/CloudPC');

// 数据库连接配置
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudpc';

// 预设配置数据
const CONFIGURATIONS = [
  {
    name: '基础配置',
    cpu: 2,
    memory: 4,
    storage: 50,
    price: 0.5,
    description: '适用于日常办公和学习'
  },
  {
    name: '标准配置',
    cpu: 4,
    memory: 8,
    storage: 100,
    price: 1.0,
    description: '适用于开发和中型应用'
  },
  {
    name: '高性能配置',
    cpu: 8,
    memory: 16,
    storage: 200,
    price: 2.0,
    description: '适用于大型应用和高性能计算'
  },
  {
    name: '专业配置',
    cpu: 16,
    memory: 32,
    storage: 500,
    price: 4.0,
    description: '适用于专业开发和大型项目'
  }
];

// 初始用户数据
const INITIAL_USERS = [
  {
    username: 'admin',
    email: 'admin@cloudpc.com',
    password: 'admin123456',
    fullName: '系统管理员',
    role: 'admin'
  },
  {
    username: 'user',
    email: 'user@cloudpc.com',
    password: 'user123456',
    fullName: '普通用户',
    role: 'user'
  }
];

// 创建索引
const createIndexes = async () => {
  try {
    logger.info('开始创建数据库索引...');
    
    // 用户索引
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ role: 1 });
    await User.collection.createIndex({ createdAt: 1 });
    
    // 云电脑索引
    await CloudPC.collection.createIndex({ userId: 1 });
    await CloudPC.collection.createIndex({ status: 1 });
    await CloudPC.collection.createIndex({ configuration: 1 });
    await CloudPC.collection.createIndex({ createdAt: 1 });
    await CloudPC.collection.createIndex({ 'configuration.cpu': 1 });
    await CloudPC.collection.createIndex({ 'configuration.memory': 1 });
    
    logger.info('数据库索引创建完成');
  } catch (error) {
    logger.error('创建索引失败', { error: error.message });
    throw error;
  }
};

// 清理现有数据
const cleanExistingData = async () => {
  try {
    logger.info('清理现有数据...');
    
    await User.deleteMany({});
    await CloudPC.deleteMany({});
    
    logger.info('现有数据清理完成');
  } catch (error) {
    logger.error('清理数据失败', { error: error.message });
    throw error;
  }
};

// 创建初始用户
const createInitialUsers = async () => {
  try {
    logger.info('创建初始用户...');
    
    const users = [];
    for (const userData of INITIAL_USERS) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      const user = new User({
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        fullName: userData.fullName,
        role: userData.role,
        isEmailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await user.save();
      users.push(user);
      logger.info(`用户已创建: ${userData.username} (${userData.email})`);
    }
    
    return users;
  } catch (error) {
    logger.error('创建初始用户失败', { error: error.message });
    throw error;
  }
};

// 创建示例云电脑
const createSampleCloudPCs = async (users) => {
  try {
    logger.info('创建示例云电脑...');
    
    const sampleCloudPCs = [
      {
        name: '开发测试电脑',
        description: '用于开发和测试的云电脑',
        configuration: CONFIGURATIONS[1], // 标准配置
        status: 'stopped',
        region: 'cn-beijing',
        userId: users[1]._id // 普通用户
      },
      {
        name: '管理员测试电脑',
        description: '管理员专用的测试环境',
        configuration: CONFIGURATIONS[2], // 高性能配置
        status: 'running',
        region: 'cn-beijing',
        userId: users[0]._id // 管理员用户
      }
    ];
    
    const cloudPCs = [];
    for (const pcData of sampleCloudPCs) {
      const cloudPC = new CloudPC({
        ...pcData,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date()
      });
      
      await cloudPC.save();
      cloudPCs.push(cloudPC);
      logger.info(`云电脑已创建: ${pcData.name}`);
    }
    
    return cloudPCs;
  } catch (error) {
    logger.error('创建示例云电脑失败', { error: error.message });
    throw error;
  }
};

// 验证初始化结果
const validateInitialization = async (users, cloudPCs) => {
  try {
    logger.info('验证初始化结果...');
    
    // 验证用户数据
    const userCount = await User.countDocuments();
    const adminExists = await User.findOne({ role: 'admin' });
    const normalUserExists = await User.findOne({ role: 'user' });
    
    // 验证云电脑数据
    const cloudPCCount = await CloudPC.countDocuments();
    const runningPCs = await CloudPC.countDocuments({ status: 'running' });
    const stoppedPCs = await CloudPC.countDocuments({ status: 'stopped' });
    
    const validationResults = {
      users: {
        total: userCount,
        adminExists: !!adminExists,
        normalUserExists: !!normalUserExists
      },
      cloudPCs: {
        total: cloudPCCount,
        running: runningPCs,
        stopped: stoppedPCs
      }
    };
    
    logger.info('初始化验证结果', validationResults);
    return validationResults;
  } catch (error) {
    logger.error('验证初始化结果失败', { error: error.message });
    throw error;
  }
};

// 主初始化函数
const initializeDatabase = async () => {
  try {
    logger.info('开始数据库初始化...');
    
    // 连接数据库
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    logger.info('数据库连接成功');
    
    // 创建索引
    await createIndexes();
    
    // 清理现有数据
    await cleanExistingData();
    
    // 创建初始用户
    const users = await createInitialUsers();
    
    // 创建示例云电脑
    const cloudPCs = await createSampleCloudPCs(users);
    
    // 验证初始化结果
    const validation = await validateInitialization(users, cloudPCs);
    
    logger.info('数据库初始化完成', {
      message: '初始化成功',
      results: validation
    });
    
    // 打印管理员账户信息
    console.log('\n🎉 数据库初始化完成！');
    console.log('\n📊 初始化结果:');
    console.log(`   用户总数: ${validation.users.total}`);
    console.log(`   云电脑总数: ${validation.cloudPCs.total}`);
    console.log(`   运行中云电脑: ${validation.cloudPCs.running}`);
    console.log(`   已停止云电脑: ${validation.cloudPCs.stopped}`);
    
    console.log('\n👤 默认管理员账户:');
    console.log('   用户名: admin');
    console.log('   邮箱: admin@cloudpc.com');
    console.log('   密码: admin123456');
    
    console.log('\n👤 默认用户账户:');
    console.log('   用户名: user');
    console.log('   邮箱: user@cloudpc.com');
    console.log('   密码: user123456');
    
    console.log('\n⚠️  重要提醒:');
    console.log('   - 请在生产环境中修改默认密码');
    console.log('   - 建议删除或修改示例数据');
    console.log('   - 定期备份数据库');
    
  } catch (error) {
    logger.error('数据库初始化失败', {
      error: error.message,
      stack: error.stack
    });
    console.error('\n❌ 数据库初始化失败:', error.message);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await mongoose.connection.close();
    logger.info('数据库连接已关闭');
  }
};

// 清理函数
const cleanDatabase = async () => {
  try {
    logger.info('开始清理数据库...');
    
    // 连接数据库
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    // 清理数据
    await cleanExistingData();
    
    logger.info('数据库清理完成');
    console.log('✅ 数据库清理完成');
    
  } catch (error) {
    logger.error('数据库清理失败', {
      error: error.message,
      stack: error.stack
    });
    console.error('❌ 数据库清理失败:', error.message);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await mongoose.connection.close();
    logger.info('数据库连接已关闭');
  }
};

// CLI选项处理
const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'init':
      await initializeDatabase();
      break;
    case 'clean':
      await cleanDatabase();
      break;
    case 'help':
      console.log(`
云电脑数据库管理工具

用法:
  node seed.js <命令>

命令:
  init     初始化数据库（默认）
  clean    清理数据库
  help     显示帮助信息

示例:
  node seed.js init      # 初始化数据库
  node seed.js clean     # 清理数据库
      `);
      break;
    default:
      await initializeDatabase();
  }
};

// 执行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  initializeDatabase,
  cleanDatabase,
  createIndexes
};
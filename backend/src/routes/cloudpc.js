const express = require('express');
const CloudPC = require('../models/CloudPC');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validateCreateCloudPC, validateUpdateCloudPC, validateCloudPCId, validatePagination } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const router = express.Router();

// @desc    获取云电脑列表
// @route   GET /api/cloudpc
// @access  Private
const getCloudPCs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sort = '-createdAt',
    status,
    search
  } = req.query;

  // 构建查询条件
  const query = { user: req.user.id };
  
  if (status) {
    query.status = status;
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  // 生成缓存键
  const cacheKey = `list:${JSON.stringify({ query, page, limit, sort })}`;
  
  // 尝试从缓存获取
  const cachedResult = await cacheService.get('cloudpc', cacheKey);
  if (cachedResult) {
    logger.debug('云电脑列表缓存命中', { userId: req.user.id, cacheKey });
    return res.json({
      success: true,
      data: cachedResult,
      fromCache: true
    });
  }

  // 执行查询
  const cloudPCs = await CloudPC.find(query)
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate('user', 'name email');

  // 获取总数
  const total = await CloudPC.countDocuments(query);

  // 获取统计信息
  const stats = await CloudPC.aggregate([
    { $match: { user: req.user._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const statusStats = stats.reduce((acc, stat) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});

  const result = {
    cloudPCs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    },
    stats: statusStats
  };

  // 缓存结果
  await cacheService.set('cloudpc', cacheKey, result);
  logger.debug('云电脑列表缓存设置', { userId: req.user.id, cacheKey });

  res.json({
    success: true,
    data: result
  });
});

// @desc    获取单个云电脑详情
// @route   GET /api/cloudpc/:id
// @access  Private
const getCloudPC = asyncHandler(async (req, res) => {
  const cacheKey = `detail:${req.params.id}`;
  
  // 尝试从缓存获取
  const cachedCloudPC = await cacheService.get('cloudpc', cacheKey);
  if (cachedCloudPC) {
    logger.debug('云电脑详情缓存命中', { userId: req.user.id, cloudPCId: req.params.id });
    return res.json({
      success: true,
      data: {
        cloudPC: cachedCloudPC
      },
      fromCache: true
    });
  }

  const cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  }).populate('user', 'name email');

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  // 缓存详情数据
  await cacheService.set('cloudpc', cacheKey, cloudPC);

  res.json({
    success: true,
    data: {
      cloudPC
    }
  });
});

// @desc    创建云电脑
// @route   POST /api/cloudpc
// @access  Private
const createCloudPC = asyncHandler(async (req, res) => {
  const cloudPCData = {
    ...req.body,
    user: req.user.id
  };

  const cloudPC = new CloudPC(cloudPCData);
  await cloudPC.save();

  // 缓存新创建的云电脑详情
  await cacheService.set('cloudpc', `detail:${cloudPC._id}`, cloudPC);
  
  // 失效相关缓存
  await cacheService.invalidateCloudPCCache(cloudPC._id);
  await cacheService.invalidateStats();

  // 模拟创建云电脑（在实际项目中这里会调用云服务商的API）
  logger.info('创建云电脑', {
    cloudPCId: cloudPC._id,
    userId: req.user.id,
    specs: {
      cpu: cloudPC.cpu,
      memory: cloudPC.memory,
      storage: cloudPC.storage,
      os: cloudPC.os
    },
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    data: {
      cloudPC
    }
  });
});

// @desc    更新云电脑
// @route   PUT /api/cloudpc/:id
// @access  Private
const updateCloudPC = asyncHandler(async (req, res) => {
  let cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  // 检查云电脑状态（运行中不能修改某些属性）
  if (cloudPC.status === 'running' && (req.body.cpu || req.body.memory || req.body.storage)) {
    return res.status(400).json({
      success: false,
      error: '运行中的云电脑不能修改CPU、内存或存储配置'
    });
  }

  const updatedCloudPC = await CloudPC.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  // 更新缓存
  await cacheService.set('cloudpc', `detail:${updatedCloudPC._id}`, updatedCloudPC);
  await cacheService.invalidateCloudPCCache(updatedCloudPC._id);
  await cacheService.invalidateStats();

  logger.info('更新云电脑配置', {
    cloudPCId: cloudPC._id,
    userId: req.user.id,
    updatedFields: Object.keys(req.body),
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      cloudPC: updatedCloudPC
    }
  });
});

// @desc    删除云电脑
// @route   DELETE /api/cloudpc/:id
// @access  Private
const deleteCloudPC = asyncHandler(async (req, res) => {
  const cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  // 检查云电脑状态
  if (cloudPC.status === 'running') {
    return res.status(400).json({
      success: false,
      error: '运行中的云电脑不能删除，请先停止'
    });
  }

  await cloudPC.deleteOne();

  // 清理相关缓存
  await cacheService.delete('cloudpc', `detail:${cloudPC._id}`);
  await cacheService.invalidateCloudPCCache(cloudPC._id);
  await cacheService.invalidateStats();

  logger.info('删除云电脑', {
    cloudPCId: cloudPC._id,
    userId: req.user.id,
    ip: req.ip
  });

  res.json({
    success: true,
    message: '云电脑删除成功'
  });
});

// @desc    启动云电脑
// @route   POST /api/cloudpc/:id/start
// @access  Private
const startCloudPC = asyncHandler(async (req, res) => {
  const cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  if (cloudPC.status === 'running') {
    return res.status(400).json({
      success: false,
      error: '云电脑已在运行中'
    });
  }

  if (cloudPC.status === 'error') {
    return res.status(400).json({
      success: false,
      error: '云电脑处于错误状态，无法启动'
    });
  }

  // 更新状态为启动中
  cloudPC.status = 'starting';
  cloudPC.startedAt = new Date();
  await cloudPC.save();

  // 模拟启动过程
  setTimeout(async () => {
    cloudPC.status = 'running';
    cloudPC.connectionInfo = {
      endpoint: `${process.env.CLOUDPC_BASE_URL || 'https://cloudpc.example.com'}/connect/${cloudPC._id}`,
      protocol: 'RDP',
      port: 3389,
      username: cloudPC.username
    };
    await cloudPC.save();
    
    logger.info('云电脑启动成功', {
      cloudPCId: cloudPC._id,
      userId: req.user.id
    });
  }, 3000);

  logger.info('启动云电脑', {
    cloudPCId: cloudPC._id,
    userId: req.user.id,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      cloudPC,
      message: '云电脑启动中，请稍候...'
    }
  });
});

// @desc    停止云电脑
// @route   POST /api/cloudpc/:id/stop
// @access  Private
const stopCloudPC = asyncHandler(async (req, res) => {
  const cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  if (cloudPC.status === 'stopped') {
    return res.status(400).json({
      success: false,
      error: '云电脑已停止'
    });
  }

  if (cloudPC.status === 'starting') {
    return res.status(400).json({
      success: false,
      error: '云电脑启动中，无法停止'
    });
  }

  // 更新状态为停止中
  cloudPC.status = 'stopping';
  await cloudPC.save();

  // 模拟停止过程
  setTimeout(async () => {
    cloudPC.status = 'stopped';
    cloudPC.connectionInfo = undefined;
    await cloudPC.save();
    
    logger.info('云电脑停止成功', {
      cloudPCId: cloudPC._id,
      userId: req.user.id
    });
  }, 2000);

  logger.info('停止云电脑', {
    cloudPCId: cloudPC._id,
    userId: req.user.id,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      cloudPC,
      message: '云电脑停止中，请稍候...'
    }
  });
});

// @desc    重启云电脑
// @route   POST /api/cloudpc/:id/restart
// @access  Private
const restartCloudPC = asyncHandler(async (req, res) => {
  const cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  if (cloudPC.status !== 'running') {
    return res.status(400).json({
      success: false,
      error: '只能重启运行中的云电脑'
    });
  }

  // 更新状态为重启中
  cloudPC.status = 'restarting';
  await cloudPC.save();

  // 模拟重启过程
  setTimeout(async () => {
    cloudPC.status = 'running';
    await cloudPC.save();
    
    logger.info('云电脑重启成功', {
      cloudPCId: cloudPC._id,
      userId: req.user.id
    });
  }, 5000);

  logger.info('重启云电脑', {
    cloudPCId: cloudPC._id,
    userId: req.user.id,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      cloudPC,
      message: '云电脑重启中，请稍候...'
    }
  });
});

// @desc    获取云电脑监控数据
// @route   GET /api/cloudpc/:id/monitor
// @access  Private
const getMonitorData = asyncHandler(async (req, res) => {
  const cloudPC = await CloudPC.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!cloudPC) {
    return res.status(404).json({
      success: false,
      error: '云电脑未找到'
    });
  }

  // 生成模拟监控数据
  const now = new Date();
  const monitorData = {
    cpu: {
      current: Math.random() * 100,
      history: Array.from({ length: 24 }, (_, i) => ({
        time: new Date(now.getTime() - (23 - i) * 60 * 60 * 1000),
        value: Math.random() * 100
      }))
    },
    memory: {
      current: (cloudPC.memory * (Math.random() * 0.8 + 0.1)).toFixed(2),
      total: cloudPC.memory,
      history: Array.from({ length: 24 }, (_, i) => ({
        time: new Date(now.getTime() - (23 - i) * 60 * 60 * 1000),
        value: (cloudPC.memory * (Math.random() * 0.8 + 0.1)).toFixed(2)
      }))
    },
    storage: {
      current: (cloudPC.storage * (Math.random() * 0.6 + 0.1)).toFixed(2),
      total: cloudPC.storage,
      usage: ((Math.random() * 0.6 + 0.1) * 100).toFixed(1),
      history: Array.from({ length: 24 }, (_, i) => ({
        time: new Date(now.getTime() - (23 - i) * 60 * 60 * 1000),
        value: (cloudPC.storage * (Math.random() * 0.6 + 0.1)).toFixed(2)
      }))
    },
    network: {
      inbound: (Math.random() * 100).toFixed(2),
      outbound: (Math.random() * 100).toFixed(2),
      history: Array.from({ length: 24 }, (_, i) => ({
        time: new Date(now.getTime() - (23 - i) * 60 * 60 * 1000),
        inbound: (Math.random() * 100).toFixed(2),
        outbound: (Math.random() * 100).toFixed(2)
      }))
    }
  };

  res.json({
    success: true,
    data: {
      monitorData
    }
  });
});

// 路由配置
router.get('/', authenticate, validatePagination, getCloudPCs);
router.get('/:id', authenticate, validateCloudPCId, getCloudPC);
router.post('/', authenticate, validateCreateCloudPC, createCloudPC);
router.put('/:id', authenticate, validateCloudPCId, validateUpdateCloudPC, updateCloudPC);
router.delete('/:id', authenticate, validateCloudPCId, deleteCloudPC);
router.post('/:id/start', authenticate, validateCloudPCId, startCloudPC);
router.post('/:id/stop', authenticate, validateCloudPCId, stopCloudPC);
router.post('/:id/restart', authenticate, validateCloudPCId, restartCloudPC);

// 监控路由（实时数据，短时间缓存）
const monitorCacheMiddleware = cacheService.generateMiddleware('realtime', null, 60); // 60秒缓存
router.get('/:id/monitor', authenticate, validateCloudPCId, monitorCacheMiddleware, getMonitorData);

module.exports = router;
const express = require('express');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const { validateUpdateProfile, validatePasswordChange, validatePagination } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// @desc    获取所有用户（仅管理员）
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sort = '-createdAt',
    status,
    role,
    search
  } = req.query;

  // 构建查询条件
  const query = {};
  
  if (status) {
    query.status = status;
  }
  
  if (role) {
    query.role = role;
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // 执行查询
  const users = await User.find(query)
    .select('-password -refreshTokens -loginAttempts -lockUntil')
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit);

  // 获取总数
  const total = await User.countDocuments(query);

  // 获取统计信息
  const stats = await User.aggregate([
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

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: statusStats
    }
  });
});

// @desc    获取单个用户
// @route   GET /api/users/:id
// @access  Private
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password -refreshTokens -loginAttempts -lockUntil');

  if (!user) {
    return res.status(404).json({
      success: false,
      error: '用户未找到'
    });
  }

  // 权限检查：用户只能查看自己的信息，管理员可以查看所有用户
  if (user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: '没有权限访问此用户信息'
    });
  }

  res.json({
    success: true,
    data: {
      user
    }
  });
});

// @desc    更新用户状态（仅管理员）
// @route   PUT /api/users/:id/status
// @access  Private/Admin
const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!['active', 'suspended', 'deactivated'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: '无效的状态值'
    });
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: '用户未找到'
    });
  }

  user.status = status;
  await user.save();

  logger.info('管理员更新用户状态', {
    adminId: req.user.id,
    targetUserId: req.params.id,
    newStatus: status,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      user: user.toObject()
    }
  });
});

// @desc    更新用户角色（仅管理员）
// @route   PUT /api/users/:id/role
// @access  Private/Admin
const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({
      success: false,
      error: '无效的角色值'
    });
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: '用户未找到'
    });
  }

  // 防止管理员撤消自己的管理员权限
  if (user._id.toString() === req.user.id && role !== 'admin') {
    return res.status(400).json({
      success: false,
      error: '不能修改自己的角色'
    });
  }

  user.role = role;
  await user.save();

  logger.info('管理员更新用户角色', {
    adminId: req.user.id,
    targetUserId: req.params.id,
    newRole: role,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      user: user.toObject()
    }
  });
});

// @desc    删除用户（仅管理员）
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: '用户未找到'
    });
  }

  // 防止管理员删除自己
  if (user._id.toString() === req.user.id) {
    return res.status(400).json({
      success: false,
      error: '不能删除自己的账户'
    });
  }

  await user.deleteOne();

  logger.info('管理员删除用户', {
    adminId: req.user.id,
    deletedUserId: req.params.id,
    deletedUserEmail: user.email,
    ip: req.ip
  });

  res.json({
    success: true,
    message: '用户删除成功'
  });
});

// @desc    获取用户统计信息（仅管理员）
// @route   GET /api/users/stats/overview
// @access  Private/Admin
const getUserStats = asyncHandler(async (req, res) => {
  // 总用户数
  const totalUsers = await User.countDocuments();

  // 按状态统计
  const statusStats = await User.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // 按角色统计
  const roleStats = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);

  // 今日注册用户
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRegistrations = await User.countDocuments({
    createdAt: { $gte: today }
  });

  // 本月注册用户
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const thisMonthRegistrations = await User.countDocuments({
    createdAt: { $gte: thisMonth }
  });

  const stats = {
    total: totalUsers,
    status: statusStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
    role: roleStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
    registrations: {
      today: todayRegistrations,
      thisMonth: thisMonthRegistrations
    }
  };

  res.json({
    success: true,
    data: {
      stats
    }
  });
});

// @desc    获取用户云电脑统计信息
// @route   GET /api/users/:id/cloudpc-stats
// @access  Private
const getUserCloudPCStats = asyncHandler(async (req, res) => {
  const CloudPC = require('../models/CloudPC');
  
  const userId = req.params.id;
  
  // 权限检查
  if (userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: '没有权限访问此用户的云电脑统计信息'
    });
  }

  // 云电脑统计
  const totalCloudPCs = await CloudPC.countDocuments({ user: userId });
  
  const statusStats = await CloudPC.aggregate([
    { $match: { user: CloudPC.castObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // 总计费用
  const costStats = await CloudPC.aggregate([
    { $match: { user: CloudPC.castObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalCost: { $sum: '$billing.total' },
        totalHours: { $sum: '$billing.hours' }
      }
    }
  ]);

  const stats = {
    totalCloudPCs,
    status: statusStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
    billing: costStats[0] || { totalCost: 0, totalHours: 0 }
  };

  res.json({
    success: true,
    data: {
      stats
    }
  });
});

// 路由映射
router.get('/', authenticate, authorize('admin'), validatePagination, getUsers);
router.get('/stats/overview', authenticate, authorize('admin'), getUserStats);
router.get('/:id', authenticate, getUser);
router.get('/:id/cloudpc-stats', authenticate, getUserCloudPCStats);
router.put('/:id/status', authenticate, authorize('admin'), updateUserStatus);
router.put('/:id/role', authenticate, authorize('admin'), updateUserRole);
router.delete('/:id', authenticate, authorize('admin'), deleteUser);

module.exports = router;
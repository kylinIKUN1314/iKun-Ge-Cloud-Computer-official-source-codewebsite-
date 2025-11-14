const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// @desc    用户注册
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  // 检查用户是否已存在
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: '该邮箱已被注册'
    });
  }

  // 创建用户
  const user = new User({
    name,
    email,
    password,
    phone
  });

  await user.save();

  // 生成JWT令牌
  const token = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );

  // 记录注册日志
  logger.info('新用户注册', {
    userId: user._id,
    email: user.email,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // 移除密码响应
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(201).json({
    success: true,
    data: {
      user: userResponse,
      token
    }
  });
});

// @desc    用户登录
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // 查找用户
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({
      success: false,
      error: '邮箱或密码错误'
    });
  }

  // 检查账户状态
  if (user.status === 'suspended') {
    return res.status(403).json({
      success: false,
      error: '账户已被暂停，请联系客服'
    });
  }

  if (user.status === 'deactivated') {
    return res.status(403).json({
      success: false,
      error: '账户已被停用'
    });
  }

  // 验证密码
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    // 记录失败登录尝试
    await user.incrementLoginAttempts();
    logger.warn('登录失败', {
      email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(401).json({
      success: false,
      error: '邮箱或密码错误'
    });
  }

  // 重置登录尝试次数
  await user.resetLoginAttempts();

  // 检查是否需要邮箱验证
  if (!user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      error: '请先验证邮箱后再登录',
      requiresEmailVerification: true
    });
  }

  // 生成令牌
  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );

  // 生成刷新令牌
  const refreshToken = crypto.randomBytes(40).toString('hex');
  user.refreshTokens.push({
    token: refreshToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天
  });
  await user.save();

  // 清理过期的刷新令牌
  user.refreshTokens = user.refreshTokens.filter(
    rt => rt.expiresAt > new Date()
  );
  await user.save();

  // 记录成功登录
  logger.info('用户登录成功', {
    userId: user._id,
    email: user.email,
    ip: req.ip
  });

  // 移除敏感信息
  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.refreshTokens;
  delete userResponse.loginAttempts;
  delete userResponse.lockUntil;

  res.json({
    success: true,
    data: {
      user: userResponse,
      token,
      refreshToken
    }
  });
});

// @desc    获取当前用户信息
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  res.json({
    success: true,
    data: {
      user
    }
  });
});

// @desc    更新用户资料
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, avatar } = req.body;
  
  const user = await User.findById(req.user.id);
  
  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (avatar) user.avatar = avatar;
  
  await user.save();
  
  logger.info('用户资料更新', {
    userId: user._id,
    updatedFields: Object.keys(req.body)
  });
  
  res.json({
    success: true,
    data: {
      user
    }
  });
});

// @desc    修改密码
// @route   PUT /api/auth/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  const user = await User.findById(req.user.id).select('+password');
  
  // 验证当前密码
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      error: '当前密码不正确'
    });
  }
  
  // 更新密码
  user.password = newPassword;
  await user.save();
  
  // 清除所有刷新令牌（强制重新登录）
  user.refreshTokens = [];
  await user.save();
  
  logger.info('用户修改密码', {
    userId: user._id,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: '密码修改成功，请重新登录'
  });
});

// @desc    刷新令牌
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: '刷新令牌不能为空'
    });
  }
  
  const user = await User.findById(req.user?.id);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: '无效的令牌'
    });
  }
  
  // 验证刷新令牌
  const tokenRecord = user.refreshTokens.find(
    rt => rt.token === refreshToken && rt.expiresAt > new Date()
  );
  
  if (!tokenRecord) {
    return res.status(401).json({
      success: false,
      error: '无效的刷新令牌'
    });
  }
  
  // 生成新令牌
  const newToken = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
  
  res.json({
    success: true,
    data: {
      token: newToken
    }
  });
});

// @desc    用户登出
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  const user = await User.findById(req.user.id);
  if (user && refreshToken) {
    // 移除指定的刷新令牌
    user.refreshTokens = user.refreshTokens.filter(
      rt => rt.token !== refreshToken
    );
    await user.save();
  }
  
  logger.info('用户登出', {
    userId: req.user.id,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: '登出成功'
  });
});

// 路由映射
router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);
router.post('/refresh', authenticate, refreshToken);
router.post('/logout', authenticate, logout);

module.exports = router;
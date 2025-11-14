const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// JWT认证中间件
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '访问被拒绝，未提供认证令牌'
      });
    }

    const token = authHeader.substring(7); // 移除 "Bearer " 前缀

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 从数据库获取用户信息
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({
          success: false,
          error: '用户不存在'
        });
      }

      // 检查用户是否被禁用
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: '账户已被禁用'
        });
      }

      // 检查账户是否被锁定
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          error: '账户已被锁定，请稍后再试'
        });
      }

      // 更新最后登录时间
      user.lastLoginAt = new Date();
      await user.save();

      // 将用户信息附加到请求对象
      req.user = user;
      next();
      
    } catch (jwtError) {
      logger.warn(`JWT验证失败: ${jwtError.message}`, { token });
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: '认证令牌已过期'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: '认证令牌无效'
        });
      }
      
      throw jwtError;
    }
  } catch (error) {
    logger.error('认证中间件错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
};

// 授权中间件 - 检查用户角色
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '需要认证'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: '权限不足'
      });
    }

    next();
  };
};

// 可选认证中间件 - 不强制要求认证
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.isActive && !user.isLocked) {
          req.user = user;
        }
      } catch (jwtError) {
        // 静默失败，继续执行
        logger.warn('可选认证失败:', jwtError.message);
      }
    }
    
    next();
  } catch (error) {
    logger.error('可选认证中间件错误:', error);
    next(); // 继续执行，不阻断请求
  }
};

// 验证当前用户是否为资源拥有者或管理员
const validateOwnership = (modelName, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName];
      const userId = req.user.id;
      
      const Model = require(`../models/${modelName}`);
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: '资源不存在'
        });
      }
      
      // 检查是否为资源拥有者或管理员
      const isOwner = resource.user && resource.user.toString() === userId.toString();
      const isAdmin = req.user.role === 'admin';
      
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: '无权访问此资源'
        });
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      logger.error('资源所有权验证错误:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  };
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  validateOwnership
};
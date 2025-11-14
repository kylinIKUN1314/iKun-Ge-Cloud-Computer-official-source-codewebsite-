const logger = require('../utils/logger');

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 记录错误日志
  logger.error('服务器错误:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? req.user.id : 'anonymous'
  });

  // Mongoose验证错误
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map(val => val.message)
      .join(', ');
    return res.status(400).json({
      success: false,
      error: message
    });
  }

  // Mongoose重复键错误
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field}已存在`;
    return res.status(400).json({
      success: false,
      error: message
    });
  }

  // Mongoosecast错误
  if (err.name === 'CastError') {
    const message = '资源未找到';
    return res.status(404).json({
      success: false,
      error: message
    });
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    const message = '认证令牌无效';
    return res.status(401).json({
      success: false,
      error: message
    });
  }

  if (err.name === 'TokenExpiredError') {
    const message = '认证令牌已过期';
    return res.status(401).json({
      success: false,
      error: message
    });
  }

  // 默认错误
  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404处理中间件
const notFound = (req, res, next) => {
  const error = new Error(`接口不存在 - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// 异步错误处理包装器
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 创建自定义错误类
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 验证错误处理
const handleValidationError = (errors) => {
  const formattedErrors = errors.array().map(error => ({
    field: error.param,
    message: error.msg,
    value: error.value
  }));

  return {
    success: false,
    error: '验证失败',
    details: formattedErrors
  };
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  AppError,
  handleValidationError
};
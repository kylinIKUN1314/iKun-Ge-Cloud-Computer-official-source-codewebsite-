const { body, param, query, validationResult } = require('express-validator');
const { AppError, handleValidationError } = require('./errorHandler');

// 处理验证结果
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json(handleValidationError(errors));
  }
  next();
};

// 用户注册验证
const validateRegister = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('姓名必须为2-50个字符'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('邮箱格式不正确'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('密码必须包含字母和数字'),
  body('phone')
    .optional()
    .isMobilePhone('zh-CN')
    .withMessage('手机号格式不正确'),
  handleValidation
];

// 用户登录验证
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('邮箱格式不正确'),
  body('password')
    .notEmpty()
    .withMessage('密码不能为空'),
  handleValidation
];

// 云电脑创建验证
const validateCreateCloudPC = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('云电脑名称必须为1-50个字符'),
  body('os')
    .isIn(['Windows 10', 'Windows 11', 'Ubuntu 20.04', 'Ubuntu 22.04', 'CentOS 8', 'Debian 11'])
    .withMessage('不支持的操作系统'),
  body('cpu')
    .isInt({ min: 1, max: 32 })
    .withMessage('CPU核心数必须为1-32'),
  body('memory')
    .isInt({ min: 1, max: 128 })
    .withMessage('内存必须为1-128GB'),
  body('storage')
    .isInt({ min: 10, max: 10000 })
    .withMessage('存储空间必须为10GB-10TB'),
  body('location')
    .optional()
    .isIn(['beijing', 'shanghai', 'guangzhou', 'shenzhen'])
    .withMessage('不支持的机房位置'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('描述不能超过500个字符'),
  handleValidation
];

// 云电脑更新验证
const validateUpdateCloudPC = [
  param('id').isMongoId().withMessage('云电脑ID格式不正确'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('云电脑名称必须为1-50个字符'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('描述不能超过500个字符'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('标签最多10个'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('每个标签为1-20个字符'),
  handleValidation
];

// 云电脑ID验证
const validateCloudPCId = [
  param('id').isMongoId().withMessage('云电脑ID格式不正确'),
  handleValidation
];

// 分页验证
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('页码必须为正整数')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('每页数量必须为1-100')
    .toInt(),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'name', '-name', 'status', '-status'])
    .withMessage('排序字段不支持'),
  query('status')
    .optional()
    .isIn(['stopped', 'starting', 'running', 'stopping', 'restarting', 'error'])
    .withMessage('状态值不支持'),
  handleValidation
];

// 用户资料更新验证
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('姓名必须为2-50个字符'),
  body('phone')
    .optional()
    .isMobilePhone('zh-CN')
    .withMessage('手机号格式不正确'),
  handleValidation
];

// 密码更新验证
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('当前密码不能为空'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('新密码至少6个字符')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('新密码必须包含字母和数字'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('确认密码与新密码不一致');
      }
      return true;
    }),
  handleValidation
];

// 重置密码验证
const validateResetPassword = [
  body('token')
    .notEmpty()
    .withMessage('重置令牌不能为空'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('密码必须包含字母和数字'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('确认密码与密码不一致');
      }
      return true;
    }),
  handleValidation
];

// 邮箱验证
const validateEmail = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('邮箱格式不正确'),
  handleValidation
];

// 刷新令牌验证
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('刷新令牌不能为空'),
  handleValidation
];

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateCloudPC,
  validateUpdateCloudPC,
  validateCloudPCId,
  validatePagination,
  validateUpdateProfile,
  validatePasswordChange,
  validateResetPassword,
  validateEmail,
  validateRefreshToken,
  handleValidation
};
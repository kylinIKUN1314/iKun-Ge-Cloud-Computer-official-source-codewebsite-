const mongoose = require('mongoose');

const cloudPCSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, '云电脑名称不能为空'],
    trim: true,
    maxlength: [50, '名称不能超过50个字符']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['stopped', 'starting', 'running', 'stopping', 'restarting', 'error'],
    default: 'stopped',
    index: true
  },
  os: {
    type: String,
    required: [true, '操作系统不能为空'],
    enum: ['Windows 10', 'Windows 11', 'Ubuntu 20.04', 'Ubuntu 22.04', 'CentOS 8', 'Debian 11']
  },
  cpu: {
    type: Number,
    required: [true, 'CPU配置不能为空'],
    min: [1, '至少需要1个CPU核心'],
    max: [32, '最多支持32个CPU核心']
  },
  memory: {
    type: Number,
    required: [true, '内存配置不能为空'],
    min: [1, '至少需要1GB内存'],
    max: [128, '最多支持128GB内存']
  },
  storage: {
    type: Number,
    required: [true, '存储空间不能为空'],
    min: [10, '至少需要10GB存储空间'],
    max: [10000, '最多支持10TB存储空间']
  },
  ip: {
    type: String,
    required: true,
    match: [/^(\d{1,3}\.){3}\d{1,3}$/, 'IP地址格式不正确']
  },
  port: {
    type: Number,
    required: true,
    min: [1024, '端口号不能小于1024'],
    max: [65535, '端口号不能大于65535']
  },
  bandwidth: {
    type: Number,
    default: 100, // Mbps
    min: [1, '带宽至少1Mbps'],
    max: [10000, '带宽最多10000Mbps']
  },
  location: {
    type: String,
    default: 'beijing',
    enum: ['beijing', 'shanghai', 'guangzhou', 'shenzhen']
  },
  pricing: {
    hourly: {
      type: Number,
      required: true,
      min: [0, '价格不能为负数']
    },
    currency: {
      type: String,
      default: 'CNY',
      enum: ['CNY', 'USD']
    }
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, '标签不能超过20个字符']
  }],
  description: {
    type: String,
    maxlength: [500, '描述不能超过500个字符']
  },
  rdpUrl: {
    type: String
  },
  sshUrl: {
    type: String
  },
  webUrl: {
    type: String
  },
  backupEnabled: {
    type: Boolean,
    default: false
  },
  autoBackup: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    },
    retention: {
      type: Number,
      default: 30, // 保留30天
      min: [1, '保留期至少1天'],
      max: [365, '保留期最多365天']
    }
  },
  monitoring: {
    enabled: {
      type: Boolean,
      default: true
    },
    alerts: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    thresholds: {
      cpu: {
        type: Number,
        default: 80,
        min: [1, 'CPU阈值至少1%'],
        max: [100, 'CPU阈值最多100%']
      },
      memory: {
        type: Number,
        default: 85,
        min: [1, '内存阈值至少1%'],
        max: [100, '内存阈值最多100%']
      },
      disk: {
        type: Number,
        default: 90,
        min: [1, '磁盘阈值至少1%'],
        max: [100, '磁盘阈值最多100%']
      }
    }
  },
  usage: {
    cpuUsage: {
      type: Number,
      default: 0,
      min: [0, 'CPU使用率不能小于0'],
      max: [100, 'CPU使用率不能大于100']
    },
    memoryUsage: {
      type: Number,
      default: 0,
      min: [0, '内存使用率不能小于0'],
      max: [100, '内存使用率不能大于100']
    },
    diskUsage: {
      type: Number,
      default: 0,
      min: [0, '磁盘使用率不能小于0'],
      max: [100, '磁盘使用率不能大于100']
    },
    networkIn: {
      type: Number,
      default: 0 // MB/s
    },
    networkOut: {
      type: Number,
      default: 0 // MB/s
    },
    uptime: {
      type: String,
      default: '0s' // 格式: 1d 2h 3m 4s
    }
  },
  billing: {
    totalCost: {
      type: Number,
      default: 0
    },
    lastBillingDate: {
      type: Date
    },
    billingCycle: {
      type: String,
      enum: ['hourly', 'daily', 'monthly'],
      default: 'hourly'
    }
  },
  logs: [{
    level: {
      type: String,
      enum: ['info', 'warning', 'error'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    source: {
      type: String,
      default: 'system'
    }
  }],
  snapshots: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      maxlength: [200, '快照描述不能超过200个字符']
    },
    size: {
      type: Number,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：运行时长
cloudPCSchema.virtual('runtime').get(function() {
  if (this.status === 'running') {
    const now = new Date();
    const startTime = this.updatedAt;
    return Math.floor((now - startTime) / 1000); // 秒数
  }
  return 0;
});

// 虚拟字段：预估成本
cloudPCSchema.virtual('estimatedCost').get(function() {
  const hourlyRate = this.pricing.hourly;
  const runtime = this.runtime;
  const hours = runtime / 3600; // 转换为小时
  return (hourlyRate * hours).toFixed(4);
});

// 静态方法：获取可用配置
cloudPCSchema.statics.getAvailableConfigs = function() {
  return [
    {
      name: '基础配置',
      cpu: 2,
      memory: 4,
      storage: 50,
      hourly: 0.5,
      os: ['Windows 10', 'Ubuntu 20.04']
    },
    {
      name: '标准配置',
      cpu: 4,
      memory: 8,
      storage: 100,
      hourly: 1.0,
      os: ['Windows 10', 'Windows 11', 'Ubuntu 20.04', 'Ubuntu 22.04']
    },
    {
      name: '高性能配置',
      cpu: 8,
      memory: 16,
      storage: 200,
      hourly: 2.0,
      os: ['Windows 11', 'Ubuntu 22.04', 'CentOS 8']
    },
    {
      name: '企业配置',
      cpu: 16,
      memory: 32,
      storage: 500,
      hourly: 4.0,
      os: ['Windows 11', 'Ubuntu 22.04', 'CentOS 8', 'Debian 11']
    }
  ];
};

// 实例方法：添加日志
cloudPCSchema.methods.addLog = function(level, message, source = 'user') {
  this.logs.push({
    level,
    message,
    source,
    timestamp: new Date()
  });
  // 只保留最近100条日志
  if (this.logs.length > 100) {
    this.logs = this.logs.slice(-100);
  }
  return this.save();
};

// 实例方法：创建快照
cloudPCSchema.methods.createSnapshot = function(name, description = '') {
  this.snapshots.push({
    name,
    description,
    size: this.storage * 1024, // 估算大小(MB)
    createdAt: new Date()
  });
  return this.save();
};

// 索引
cloudPCSchema.index({ user: 1, status: 1 });
cloudPCSchema.index({ createdAt: -1 });
cloudPCSchema.index({ ip: 1 });

module.exports = mongoose.model('CloudPC', cloudPCSchema);
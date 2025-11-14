/**
 * 云电脑API测试
 * 测试云电脑的创建、管理、控制等功能
 */

const request = require('supertest');
const app = require('../src/server');
const User = require('../src/models/User');
const CloudPC = require('../src/models/CloudPC');
const mongoose = require('mongoose');

describe('云电脑API测试', () => {
  let authToken = '';
  let userId = '';
  let cloudPCId = '';
  
  beforeAll(async () => {
    // 确保数据库连接
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    }
  });
  
  afterAll(async () => {
    // 清理测试数据
    await CloudPC.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });
  
  beforeEach(async () => {
    // 创建测试用户并获取认证令牌
    const userData = {
      username: 'cloudpcuser',
      email: 'cloudpc@example.com',
      password: 'password123',
      fullName: '云电脑测试用户'
    };
    
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(userData);
    
    authToken = registerResponse.body.data.token;
    userId = registerResponse.body.data.user._id;
  });
  
  describe('GET /api/cloudpc', () => {
    beforeEach(async () => {
      // 创建测试云电脑
      const cloudPCData = {
        name: '测试云电脑',
        description: '用于测试的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该返回用户的云电脑列表', async () => {
      const response = await request(app)
        .get('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('cloudPCs');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.cloudPCs)).toBe(true);
      expect(response.body.data.cloudPCs.length).toBeGreaterThan(0);
    });
    
    it('应该支持分页查询', async () => {
      const response = await request(app)
        .get('/api/cloudpc?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 10);
    });
    
    it('应该支持状态过滤', async () => {
      const response = await request(app)
        .get('/api/cloudpc?status=stopped')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      // 所有返回的云电脑状态都应该是stopped
      response.body.data.cloudPCs.forEach(cloudPC => {
        expect(cloudPC.status).toBe('stopped');
      });
    });
    
    it('在未认证情况下应该返回401', async () => {
      const response = await request(app)
        .get('/api/cloudpc')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('访问被拒绝');
    });
  });
  
  describe('GET /api/cloudpc/:id', () => {
    beforeEach(async () => {
      // 创建测试云电脑
      const cloudPCData = {
        name: '测试云电脑详情',
        description: '用于详情测试的云电脑',
        configuration: {
          cpu: 4,
          memory: 8,
          storage: 100
        },
        region: 'cn-beijing'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该返回指定云电脑的详细信息', async () => {
      const response = await request(app)
        .get(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id', cloudPCId);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('configuration');
      expect(response.body.data).toHaveProperty('status');
    });
    
    it('应该拒绝访问不存在的云电脑', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .get(`/api/cloudpc/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('云电脑不存在');
    });
    
    it('应该拒绝访问其他用户的云电脑', async () => {
      // 创建另一个用户
      const otherUserData = {
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123',
        fullName: '其他用户'
      };
      
      const otherResponse = await request(app)
        .post('/api/auth/register')
        .send(otherUserData);
      
      const otherToken = otherResponse.body.data.token;
      
      // 尝试用其他用户的令牌访问第一个云电脑
      const response = await request(app)
        .get(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('无权访问此云电脑');
    });
  });
  
  describe('POST /api/cloudpc', () => {
    it('应该成功创建新的云电脑', async () => {
      const cloudPCData = {
        name: '我的云电脑',
        description: '新创建的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe(cloudPCData.name);
      expect(response.body.data.description).toBe(cloudPCData.description);
      expect(response.body.data.configuration.cpu).toBe(cloudPCData.configuration.cpu);
      expect(response.body.data.status).toBe('stopped');
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该验证云电脑名称不能为空', async () => {
      const cloudPCData = {
        name: '',
        description: '测试描述',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        }
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('云电脑名称是必填项');
    });
    
    it('应该验证CPU配置的有效性', async () => {
      const cloudPCData = {
        name: '测试云电脑',
        description: '测试描述',
        configuration: {
          cpu: 0, // 无效的CPU值
          memory: 4,
          storage: 50
        }
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('CPU核心数必须为正数');
    });
    
    it('应该验证内存配置的有效性', async () => {
      const cloudPCData = {
        name: '测试云电脑',
        description: '测试描述',
        configuration: {
          cpu: 2,
          memory: 0, // 无效的内存值
          storage: 50
        }
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('内存大小必须为正数');
    });
  });
  
  describe('PATCH /api/cloudpc/:id', () => {
    beforeEach(async () => {
      // 创建测试云电脑
      const cloudPCData = {
        name: '待更新云电脑',
        description: '用于更新测试的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该成功更新云电脑信息', async () => {
      const updateData = {
        name: '更新后的云电脑名称',
        description: '更新后的描述',
        configuration: {
          cpu: 4,
          memory: 8,
          storage: 100
        }
      };
      
      const response = await request(app)
        .patch(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.configuration.cpu).toBe(updateData.configuration.cpu);
    });
    
    it('不应该允许更新其他用户的云电脑', async () => {
      // 创建另一个用户
      const otherUserData = {
        username: 'otheruser2',
        email: 'other2@example.com',
        password: 'password123',
        fullName: '其他用户2'
      };
      
      const otherResponse = await request(app)
        .post('/api/auth/register')
        .send(otherUserData);
      
      const otherToken = otherResponse.body.data.token;
      
      const updateData = {
        name: '被修改的名称'
      };
      
      const response = await request(app)
        .patch(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(updateData)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('无权修改此云电脑');
    });
  });
  
  describe('DELETE /api/cloudpc/:id', () => {
    beforeEach(async () => {
      // 创建测试云电脑
      const cloudPCData = {
        name: '待删除云电脑',
        description: '用于删除测试的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该成功删除云电脑', async () => {
      const response = await request(app)
        .delete(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('云电脑删除成功');
      
      // 验证云电脑已被删除
      const getResponse = await request(app)
        .get(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
      
      expect(getResponse.body.success).toBe(false);
    });
    
    it('不应该允许删除其他用户的云电脑', async () => {
      // 创建另一个用户
      const otherUserData = {
        username: 'otheruser3',
        email: 'other3@example.com',
        password: 'password123',
        fullName: '其他用户3'
      };
      
      const otherResponse = await request(app)
        .post('/api/auth/register')
        .send(otherUserData);
      
      const otherToken = otherResponse.body.data.token;
      
      const response = await request(app)
        .delete(`/api/cloudpc/${cloudPCId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('无权删除此云电脑');
    });
  });
  
  describe('POST /api/cloudpc/:id/start', () => {
    beforeEach(async () => {
      // 创建停止状态的云电脑
      const cloudPCData = {
        name: '待启动云电脑',
        description: '用于启动测试的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing',
        status: 'stopped'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该成功启动云电脑', async () => {
      const response = await request(app)
        .post(`/api/cloudpc/${cloudPCId}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('starting');
    });
    
    it('不应该允许启动运行中的云电脑', async () => {
      // 先启动云电脑
      await request(app)
        .post(`/api/cloudpc/${cloudPCId}/start`)
        .set('Authorization', `Bearer ${authToken}`);
      
      // 尝试再次启动
      const response = await request(app)
        .post(`/api/cloudpc/${cloudPCId}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('云电脑已在运行或正在启动');
    });
  });
  
  describe('POST /api/cloudpc/:id/stop', () => {
    beforeEach(async () => {
      // 创建运行状态的云电脑
      const cloudPCData = {
        name: '待停止云电脑',
        description: '用于停止测试的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing',
        status: 'running'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该成功停止云电脑', async () => {
      const response = await request(app)
        .post(`/api/cloudpc/${cloudPCId}/stop`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(['stopping', 'stopped']).toContain(response.body.data.status);
    });
  });
  
  describe('GET /api/cloudpc/:id/metrics', () => {
    beforeEach(async () => {
      // 创建云电脑
      const cloudPCData = {
        name: '监控测试云电脑',
        description: '用于监控测试的云电脑',
        configuration: {
          cpu: 2,
          memory: 4,
          storage: 50
        },
        region: 'cn-beijing',
        status: 'running'
      };
      
      const response = await request(app)
        .post('/api/cloudpc')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cloudPCData);
      
      cloudPCId = response.body.data._id;
    });
    
    it('应该返回云电脑的监控数据', async () => {
      const response = await request(app)
        .get(`/api/cloudpc/${cloudPCId}/metrics`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('cloudpcId', cloudPCId);
      expect(response.body.data).toHaveProperty('cpuUsage');
      expect(response.body.data).toHaveProperty('memoryUsage');
      expect(response.body.data).toHaveProperty('networkIO');
      expect(response.body.data).toHaveProperty('diskIO');
    });
    
    it('应该验证时间范围参数', async () => {
      const response = await request(app)
        .get(`/api/cloudpc/${cloudPCId}/metrics?timeRange=24h`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('timeRange', '24h');
    });
  });
});
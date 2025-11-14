/**
 * 认证API测试
 * 测试用户注册、登录、JWT令牌验证等功能
 */

const request = require('supertest');
const app = require('../src/server');
const User = require('../src/models/User');
const mongoose = require('mongoose');

describe('认证API测试', () => {
  
  beforeAll(async () => {
    // 确保数据库连接
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    }
  });
  
  afterAll(async () => {
    // 清理测试数据
    await User.deleteMany({});
    await mongoose.connection.close();
  });
  
  describe('POST /api/auth/register', () => {
    it('应该成功注册新用户', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        fullName: '测试用户'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.username).toBe(userData.username);
      expect(response.body.data.user.fullName).toBe(userData.fullName);
      expect(response.body.data.user).not.toHaveProperty('password');
    });
    
    it('不应该接受重复的邮箱注册', async () => {
      const userData = {
        username: 'testuser2',
        email: 'duplicate@example.com',
        password: 'password123',
        fullName: '测试用户2'
      };
      
      // 先注册第一个用户
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);
      
      // 尝试注册相同邮箱的用户
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...userData,
          username: 'different_username'
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('邮箱已存在');
    });
    
    it('不应该接受无效的邮箱格式', async () => {
      const userData = {
        username: 'testuser3',
        email: 'invalid-email',
        password: 'password123',
        fullName: '测试用户3'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('邮箱格式无效');
    });
    
    it('不应该接受过短的密码', async () => {
      const userData = {
        username: 'testuser4',
        email: 'test4@example.com',
        password: '123',
        fullName: '测试用户4'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('密码至少需要6个字符');
    });
  });
  
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // 创建测试用户
      const userData = {
        username: 'testloginuser',
        email: 'login@example.com',
        password: 'password123',
        fullName: '登录测试用户'
      };
      
      await request(app)
        .post('/api/auth/register')
        .send(userData);
    });
    
    it('应该成功登录并返回JWT令牌', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'password123'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe(loginData.email);
    });
    
    it('不应该使用错误的密码登录', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'wrongpassword'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('密码错误');
    });
    
    it('不应该使用不存在的邮箱登录', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };
      
      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('用户不存在');
    });
  });
  
  describe('GET /api/auth/me', () => {
    let authToken = '';
    
    beforeEach(async () => {
      // 注册并登录用户
      const userData = {
        username: 'meuser',
        email: 'me@example.com',
        password: 'password123',
        fullName: 'Me测试用户'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      authToken = response.body.data.token;
    });
    
    it('应该返回当前用户信息', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('me@example.com');
      expect(response.body.data.user.username).toBe('meuser');
      expect(response.body.data.user).not.toHaveProperty('password');
    });
    
    it('在没有认证的情况下应该返回401', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('访问被拒绝');
    });
    
    it('应该拒绝无效的JWT令牌', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('PATCH /api/auth/profile', () => {
    let authToken = '';
    
    beforeEach(async () => {
      // 注册并登录用户
      const userData = {
        username: 'profileuser',
        email: 'profile@example.com',
        password: 'password123',
        fullName: 'Profile测试用户'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      authToken = response.body.data.token;
    });
    
    it('应该成功更新用户资料', async () => {
      const updateData = {
        fullName: '更新后的用户名',
        phone: '13800138000'
      };
      
      const response = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.fullName).toBe(updateData.fullName);
      expect(response.body.data.user.phone).toBe(updateData.phone);
    });
    
    it('应该验证更新的邮箱格式', async () => {
      const updateData = {
        email: 'invalid-email-format'
      };
      
      const response = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('邮箱格式无效');
    });
  });
  
  describe('PATCH /api/auth/password', () => {
    let authToken = '';
    
    beforeEach(async () => {
      // 注册并登录用户
      const userData = {
        username: 'passworduser',
        email: 'password@example.com',
        password: 'oldpassword123',
        fullName: '密码测试用户'
      };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      authToken = response.body.data.token;
    });
    
    it('应该成功修改密码', async () => {
      const passwordData = {
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123'
      };
      
      const response = await request(app)
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('密码修改成功');
    });
    
    it('不应该接受错误的当前密码', async () => {
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123'
      };
      
      const response = await request(app)
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('当前密码错误');
    });
    
    it('不应该接受过短的新密码', async () => {
      const passwordData = {
        currentPassword: 'oldpassword123',
        newPassword: '123'
      };
      
      const response = await request(app)
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('新密码至少需要6个字符');
    });
  });
});
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { closeDb } = require('../src/database/db');
const app = require('../src/app');

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message');
  });
});

afterAll(() => {
  closeDb();
});

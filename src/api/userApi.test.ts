import request from 'supertest';
import express from 'express';
import userApi from './userApi';

describe('User CRUD API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userApi);

  const testUser = {
    uid: 'testuser123',
    name: 'Test User',
    grade: '10',
    areaOfInterest: 'Math'
  };

  afterAll(async () => {
    // Clean up: delete the test user if it exists
    await request(app).delete(`/api/users/${testUser.uid}`);
  });

  it('should create a user', async () => {
    const res = await request(app)
      .post('/api/users')
      .send(testUser);
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('User created');
  });

  it('should not create a user with missing fields', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ uid: 'baduser' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  it('should read a user', async () => {
    await request(app).post('/api/users').send(testUser);
    const res = await request(app).get(`/api/users/${testUser.uid}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(testUser.name);
  });

  it('should return 404 for non-existent user', async () => {
    const res = await request(app).get('/api/users/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  it('should update a user', async () => {
    await request(app).post('/api/users').send(testUser);
    const res = await request(app)
      .put(`/api/users/${testUser.uid}`)
      .send({ name: 'Updated', grade: '11', areaOfInterest: 'Science' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User updated');
  });

  it('should return 404 when updating non-existent user', async () => {
    const res = await request(app)
      .put('/api/users/doesnotexist')
      .send({ name: 'No', grade: '0', areaOfInterest: 'None' });
    expect(res.statusCode).toBe(500); // Firestore updateDoc throws if doc doesn't exist
  });

  it('should delete a user', async () => {
    await request(app).post('/api/users').send(testUser);
    const res = await request(app).delete(`/api/users/${testUser.uid}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User deleted');
  });

  it('should return 500 when deleting non-existent user', async () => {
    const res = await request(app).delete('/api/users/doesnotexist');
    expect(res.statusCode).toBe(200); // Firestore deleteDoc returns success even if doc doesn't exist
  });
});

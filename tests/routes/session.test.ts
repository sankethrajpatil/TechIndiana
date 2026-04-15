import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks that are referenced in vi.mock factories
const { mockFindOne, mockGetUser, mockSendMail, mockVerify } = vi.hoisted(() => ({
  mockFindOne: vi.fn(),
  mockGetUser: vi.fn(),
  mockSendMail: vi.fn(),
  mockVerify: vi.fn(),
}));

// Mock UserProfile
vi.mock('../../src/models/UserProfile', () => ({
  default: {
    findOne: mockFindOne,
  },
}));

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  default: {
    apps: [{ name: 'test' }],
    auth: () => ({
      getUser: mockGetUser,
      verifyIdToken: vi.fn().mockResolvedValue({ uid: 'test-uid' }),
    }),
  },
}));

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify,
    }),
  },
}));

// Mock the auth middleware to always pass through
vi.mock('../../src/middleware/auth', () => ({
  firebaseAuthMiddleware: (req: any, _res: any, next: any) => {
    req.uid = 'test-uid-from-middleware';
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import sessionRouter from '../../server/routes/session';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/session', sessionRouter);
  return app;
}

describe('POST /api/session/end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 404 when user profile is not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User profile not found');
  });

  it('should return 400 when user email is not found in Firebase', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'Test User',
      study_plan: null,
      conversation_summary: null,
    });
    mockGetUser.mockResolvedValue({
      email: null,
      displayName: 'Test User',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('User email not found in Firebase');
  });

  it('should successfully send email and return success', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'Sanketh',
      study_plan: null,
      conversation_summary: 'Discussed career goals.',
    });
    mockGetUser.mockResolvedValue({
      email: 'sanketh@test.com',
      displayName: 'Sanketh',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    const res = await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Session ended and summary emailed.');
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  it('should format JSON study plan as HTML in email', async () => {
    const planJson = JSON.stringify({
      plan_title: 'Cloud Architect Path',
      action_items: ['Get AWS Certified', 'Learn Terraform'],
    });

    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'Sanketh',
      study_plan: planJson,
      conversation_summary: 'Discussed cloud.',
    });
    mockGetUser.mockResolvedValue({
      email: 'sanketh@test.com',
      displayName: 'Sanketh',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('Cloud Architect Path');
    expect(mailOptions.html).toContain('Get AWS Certified');
    expect(mailOptions.html).toContain('Learn Terraform');
  });

  it('should fallback to plain text when study_plan is not valid JSON', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'User',
      study_plan: 'Learn Python, then learn AWS.',
      conversation_summary: null,
    });
    mockGetUser.mockResolvedValue({
      email: 'user@test.com',
      displayName: 'User',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('Learn Python, then learn AWS.');
  });

  it('should show default message when no study plan exists', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'User',
      study_plan: null,
      conversation_summary: null,
    });
    mockGetUser.mockResolvedValue({
      email: 'user@test.com',
      displayName: 'User',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('No study plan generated yet.');
  });

  it('should use profile name or fall back to Firebase displayName', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: null,
      study_plan: null,
      conversation_summary: null,
    });
    mockGetUser.mockResolvedValue({
      email: 'user@test.com',
      displayName: 'Firebase Name',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('Firebase Name');
  });

  it('should return 500 when sendMail throws', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'User',
      study_plan: null,
      conversation_summary: null,
    });
    mockGetUser.mockResolvedValue({
      email: 'user@test.com',
      displayName: 'User',
    });
    mockSendMail.mockRejectedValue(new Error('SMTP error'));

    const app = createApp();
    const res = await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to end session and send email.');
  });

  it('should include TechIndiana branding in email', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'Sanketh',
      study_plan: null,
      conversation_summary: 'Good session.',
    });
    mockGetUser.mockResolvedValue({
      email: 'sanketh@test.com',
      displayName: 'Sanketh',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.html).toContain('TechIndiana');
    expect(mailOptions.subject).toContain('TechIndiana');
    expect(mailOptions.html).toContain('Good session.');
  });

  it('should send email to both user and admin address', async () => {
    mockFindOne.mockResolvedValue({
      firebaseUid: 'test-uid',
      name: 'User',
      study_plan: null,
      conversation_summary: null,
    });
    mockGetUser.mockResolvedValue({
      email: 'user@test.com',
      displayName: 'User',
    });
    mockSendMail.mockResolvedValue({ response: '250 OK' });

    const app = createApp();
    await request(app)
      .post('/api/session/end')
      .set('Authorization', 'Bearer dev:test-uid');

    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toContain('user@test.com');
    expect(mailOptions.to).toContain('patil232@purdue.edu');
  });
});

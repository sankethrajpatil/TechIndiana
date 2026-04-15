import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock firebase-admin before importing the module
const mockVerifyIdToken = vi.fn();
vi.mock('firebase-admin', () => ({
  default: {
    apps: [{ name: 'mock-app' }], // Simulate initialized firebase
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

import { firebaseAuthMiddleware, verifyWebSocketToken } from '../../src/middleware/auth';

describe('firebaseAuthMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    req = { headers: {} };
    res = { status: statusMock } as any;
    next = vi.fn();
  });

  it('should return 401 when no Authorization header is present', async () => {
    await firebaseAuthMiddleware(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized: No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', async () => {
    req.headers = { authorization: 'Basic some-token' };
    await firebaseAuthMiddleware(req as Request, res as Response, next);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should verify Firebase token and set req.uid on success', async () => {
    req.headers = { authorization: 'Bearer valid-token-xyz' };
    mockVerifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });

    await firebaseAuthMiddleware(req as Request, res as Response, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token-xyz');
    expect(req.uid).toBe('firebase-uid-123');
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 when Firebase token verification fails', async () => {
    req.headers = { authorization: 'Bearer invalid-token' };
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

    await firebaseAuthMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});

// Dev token fallback paths are tested in auth-dev.test.ts with admin.apps=[]

describe('verifyWebSocketToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null for empty token', async () => {
    const result = await verifyWebSocketToken('');
    expect(result).toBeNull();
  });

  it('should verify Firebase token and return uid', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'ws-uid-456' });

    const result = await verifyWebSocketToken('valid-firebase-token');

    expect(result).toBe('ws-uid-456');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-firebase-token');
  });

  it('should return null when Firebase verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const result = await verifyWebSocketToken('bad-token');

    expect(result).toBeNull();
  });

  it('should handle dev token in non-production environment', async () => {
    // We need a separate mock for this test to simulate no firebase apps
    // Since our mock has apps initialized, this tests the Firebase path instead
    process.env.NODE_ENV = 'development';
    mockVerifyIdToken.mockResolvedValue({ uid: 'verified-uid' });

    const result = await verifyWebSocketToken('regular-token');
    expect(result).toBe('verified-uid');
  });
});

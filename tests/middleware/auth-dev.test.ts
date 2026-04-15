import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock firebase-admin with NO initialized apps to test dev fallback paths
const mockVerifyIdTokenDev = vi.fn();
vi.mock('firebase-admin', () => ({
  default: {
    apps: [], // No Firebase apps → triggers dev fallback
    auth: () => ({
      verifyIdToken: mockVerifyIdTokenDev,
    }),
  },
}));

import { firebaseAuthMiddleware, verifyWebSocketToken } from '../../src/middleware/auth';

describe('firebaseAuthMiddleware - no Firebase initialized', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    req = { headers: {} };
    res = { status: statusMock } as any;
    next = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should accept dev:uid token in non-production when Firebase is not initialized', async () => {
    process.env.NODE_ENV = 'development';
    req.headers = { authorization: 'Bearer dev:test-uid-789' };

    await firebaseAuthMiddleware(req as Request, res as Response, next);

    expect(req.uid).toBe('test-uid-789');
    expect(next).toHaveBeenCalled();
  });

  it('should reject non-dev tokens when Firebase is not initialized', async () => {
    process.env.NODE_ENV = 'development';
    req.headers = { authorization: 'Bearer normal-token' };

    await firebaseAuthMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized: Firebase not configured on server' });
  });

  it('should reject dev tokens in production even when Firebase is not initialized', async () => {
    process.env.NODE_ENV = 'production';
    req.headers = { authorization: 'Bearer dev:hack-attempt' };

    await firebaseAuthMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('verifyWebSocketToken - no Firebase initialized', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return uid from dev token in non-production', async () => {
    process.env.NODE_ENV = 'development';
    const result = await verifyWebSocketToken('dev:ws-dev-uid');
    expect(result).toBe('ws-dev-uid');
  });

  it('should return null for dev tokens in production', async () => {
    process.env.NODE_ENV = 'production';
    const result = await verifyWebSocketToken('dev:hack-attempt');
    expect(result).toBeNull();
  });

  it('should return null for regular tokens when Firebase is unavailable', async () => {
    process.env.NODE_ENV = 'development';
    const result = await verifyWebSocketToken('random-token');
    expect(result).toBeNull();
  });
});

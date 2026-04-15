import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import UserProfile from '../models/UserProfile.js';

// Extend Express Request to include user UID and role
declare global {
  namespace Express {
    interface Request {
      uid?: string;
      userRole?: string;
    }
  }
}

export const firebaseAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    // If Firebase Admin is not initialized, allow a development fallback token
    // Format for dev token: "dev:<uid>" (only allowed outside production)
    if (!admin.apps || admin.apps.length === 0) {
      if (process.env.NODE_ENV !== 'production' && idToken.startsWith('dev:')) {
        req.uid = idToken.split('dev:')[1];
        return next();
      }
      console.warn('Firebase Admin not initialized; incoming request cannot be authenticated via Firebase.');
      return res.status(401).json({ error: 'Unauthorized: Firebase not configured on server' });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const profile = await UserProfile.findOne({ firebaseUid: req.uid });
      const userRole = (profile as any)?.role || 'student';
      req.userRole = userRole;
      if (!roles.includes(userRole)) {
        return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      }
      next();
    } catch (error) {
      console.error('Error checking user role:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Helper for WebSocket authentication
export const verifyWebSocketToken = async (idToken: string): Promise<string | null> => {
  try {
    if (!idToken) return null;

    // Development fallback: allow tokens like "dev:<uid>" when not in production
    if (process.env.NODE_ENV !== 'production' && idToken.startsWith('dev:')) {
      return idToken.split('dev:')[1];
    }

    if (!admin.apps || admin.apps.length === 0) {
      console.warn('Firebase Admin not initialized; cannot verify WebSocket token.');
      return null;
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying WebSocket token:', error);
    return null;
  }
};

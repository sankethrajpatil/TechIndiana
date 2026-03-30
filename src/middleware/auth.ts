import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

// Extend Express Request to include user UID
declare global {
  namespace Express {
    interface Request {
      uid?: string;
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
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Helper for WebSocket authentication
export const verifyWebSocketToken = async (idToken: string): Promise<string | null> => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying WebSocket token:', error);
    return null;
  }
};

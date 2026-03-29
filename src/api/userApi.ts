import express from 'express';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';

// Only initialize Firebase if not already initialized (for test environments)
function getDb() {
  if (!globalThis._firebaseApp) {
    globalThis._firebaseApp = initializeApp(firebaseConfig);
    globalThis._db = getFirestore(globalThis._firebaseApp);
  }
  return globalThis._db;
}

const router = express.Router();

// Create user
router.post('/', async (req, res) => {
  const { uid, name, grade, areaOfInterest } = req.body;
  if (!uid || !name || !grade || !areaOfInterest) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    await setDoc(doc(getDb(), 'users', uid), { name, grade, areaOfInterest });
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Read user
router.get('/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    const userDoc = await getDoc(doc(getDb(), 'users', uid));
    if (!userDoc.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(userDoc.data());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user
router.put('/:uid', async (req, res) => {
  const { uid } = req.params;
  const { name, grade, areaOfInterest } = req.body;
  try {
    await updateDoc(doc(getDb(), 'users', uid), { name, grade, areaOfInterest });
    res.json({ message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    await deleteDoc(doc(getDb(), 'users', uid));
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;

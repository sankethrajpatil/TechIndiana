
import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
const port = process.env.PORT || 5000;
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI not set in .env');
const client = new MongoClient(uri);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}
connectDB();

// API: Save user details
app.post('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, grade, areaOfInterest } = req.body;
  if (!name || !grade || !areaOfInterest) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    await db.collection('users').updateOne(
      { userId },
      { $set: { name, grade, areaOfInterest } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// API: Get user details
app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await db.collection('users').findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/', (req, res) => {
  res.send('MongoDB connection established!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

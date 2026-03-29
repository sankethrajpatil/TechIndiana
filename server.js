import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectToDatabase, getDB } from './db.js';
import * as techService from './services/techIndianaService.js';

dotenv.config();

const app = express();
app.use(cors());
const port = process.env.PORT || 5000;
app.use(express.json());

// We'll connect and start the server below to ensure DB is ready before accepting requests.

// API: Save user details
app.post('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, grade, areaOfInterest } = req.body;
  if (!name || !grade || !areaOfInterest) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const db = getDB();
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
    const db = getDB();
    const user = await db.collection('users').findOne({ userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// API: Update user details
app.put('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, grade, areaOfInterest } = req.body;
  try {
    const result = await db.collection('users').updateOne(
      { userId },
      { $set: { name, grade, areaOfInterest } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// API: Delete user
app.delete('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await db.collection('users').deleteOne({ userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/', (req, res) => {
  res.send('TechIndiana API server');
});

// TechIndiana API endpoints
app.get('/api/personas', async (req, res) => {
  try {
    const data = await techService.getPersonas();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch personas' });
  }
});

app.get('/api/programs', async (req, res) => {
  try {
    const data = await techService.getPrograms();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

app.get('/api/careers', async (req, res) => {
  try {
    const data = await techService.getCareerTracks();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch career tracks' });
  }
});

app.get('/api/employers', async (req, res) => {
  try {
    const data = await techService.getEmployerArchetypes();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employer archetypes' });
  }
});

app.get('/api/journeys/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const data = await techService.getJourneysByPersona(persona);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch journeys' });
  }
});

app.get('/api/questions/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const data = await techService.getQuestionsByPersona(persona);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.get('/api/rules/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const data = await techService.getDecisionRulesByPersona(persona);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch decision rules' });
  }
});

app.get('/api/conversations/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const data = await techService.getConversationsByPersona(persona);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/navigation/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const data = await techService.getNavigationByPersona(persona);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch navigation logic' });
  }
});

// Persona bundle endpoint
app.get('/api/persona-bundle/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const [journeys, questions, rules, conversations, navigation] = await Promise.all([
      techService.getJourneysByPersona(persona),
      techService.getQuestionsByPersona(persona),
      techService.getDecisionRulesByPersona(persona),
      techService.getConversationsByPersona(persona),
      techService.getNavigationByPersona(persona),
    ]);

    res.json({ persona, journeys, questions, rules, conversations, navigation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build persona bundle' });
  }
});

// DB health check
app.get('/api/db-health', async (req, res) => {
  try {
    const db = getDB();
    const admin = db.admin ? db.admin() : null;
    const collections = await db.listCollections().toArray();
    res.json({ ok: true, dbName: db.databaseName, collections: collections.map(c=>c.name) });
  } catch (err) {
    console.error('DB health error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Demo/test route: returns journeys and questions for a persona
app.get('/api/demo/:persona', async (req, res) => {
  try {
    const { persona } = req.params;
    const [journeys, questions] = await Promise.all([
      techService.getJourneysByPersona(persona),
      techService.getQuestionsByPersona(persona),
    ]);
    res.json({ persona, journeys, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Demo fetch failed' });
  }
});

(async () => {
  try {
    await connectToDatabase();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server due to DB connection error:', err);
    process.exit(1);
  }
})();

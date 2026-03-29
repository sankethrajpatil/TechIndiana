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

// --- Gemini Function Calling Endpoints ---

// Save user persona (Phase 1)
app.post('/api/voice/save_user_details', async (req, res) => {
  const { persona_type } = req.body;
  if (!persona_type || !['student','parent','adult','employer','counselor'].includes(persona_type)) {
    return res.status(400).json({ error: 'Invalid or missing persona_type' });
  }
  try {
    // Save persona_type to a session or user record as needed
    // For demo, just echo back
    res.json({ success: true, persona_type });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Generate student plan
app.post('/api/voice/generate_student_plan', async (req, res) => {
  const { grade_level, interests } = req.body;
  if (!grade_level || !interests) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Example: Generate a simple 3-step plan
  const plan = [
    `Step 1: Enroll in TechIndiana's IT apprenticeship for grade ${grade_level}.`,
    `Step 2: Focus on ${interests} through hands-on projects and mentorship.`,
    'Step 3: Graduate with industry credentials and job placement support.'
  ];
  res.json({ plan });
});

// Send parent guide
app.post('/api/voice/send_parent_guide', (req, res) => {
  // Trigger sending parent guide (email, UI, etc.)
  res.json({ success: true, message: 'Parent guide sent.' });
});

// Assess adult skills
app.post('/api/voice/assess_adult_skills', (req, res) => {
  const { current_role, past_experience } = req.body;
  if (!current_role || !past_experience) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Example: Return a suggested entry point
  res.json({
    entry_point: `Based on your experience as a ${current_role}, we recommend starting with our accelerated IT pathway.`
  });
});

// Schedule employer call
app.post('/api/voice/schedule_employer_call', (req, res) => {
  const { company_name, hiring_needs } = req.body;
  if (!company_name || !hiring_needs) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Example: Book a call (in real app, integrate with calendar/email)
  res.json({ success: true, message: `Call scheduled for ${company_name}.` });
});

// Send counselor toolkit
app.post('/api/voice/send_counselor_toolkit', (req, res) => {
  // Trigger sending toolkit (email, UI, etc.)
  res.json({ success: true, message: 'Counselor toolkit sent.' });
});

// Save or update a user's study plan
app.post('/api/voice/save_study_plan', async (req, res) => {
  const { userId, study_plan } = req.body;
  if (!userId || !study_plan) {
    return res.status(400).json({ error: 'Missing userId or study_plan' });
  }
  try {
    await db.collection('users').updateOne(
      { userId },
      { $set: { study_plan } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Save a conversation summary for a user
app.post('/api/voice/save_conversation_summary', async (req, res) => {
  const { userId, summary } = req.body;
  if (!userId || !summary) {
    return res.status(400).json({ error: 'Missing userId or summary' });
  }
  try {
    await db.collection('users').updateOne(
      { userId },
      { $set: { last_conversation_summary: summary } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

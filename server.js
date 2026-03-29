// --- Gemini WebSocket Session Handler (Study Plan Generator integration) ---
import WebSocket, { WebSocketServer } from 'ws';
import UserProfile from './backend/models/UserProfile.js';
import admin from 'firebase-admin';

import { createCalendarEvent } from './backend/services/calendarService.js';
import { sendResourceEmail } from './backend/services/emailService.js';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', async (ws, req) => {
  // Extract Firebase ID token from query param
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  let firebaseUid = null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    firebaseUid = decoded.uid;
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth token' }));
    ws.close();
    return;
  }

  // Fetch user profile and inject study plan context
  let userContext = '';
  let userProfile = await UserProfile.findOne({ firebaseUid });
  if (userProfile && userProfile.study_plan) {
    const plan = userProfile.study_plan;
    if (typeof plan === 'object' && plan.plan_title && plan.action_items) {
      userContext = `Existing Study Plan: ${plan.plan_title}\n${plan.action_items.join('\n')}`;
    } else if (typeof plan === 'string') {
      userContext = `Existing Study Plan: ${plan}`;
    }
  }

  // System instruction for Gemini
  const systemInstruction = `
You are TechIndiana's AI assistant. Once you understand the user's roadblocks and expectations, generate a detailed study plan. 
To show this plan to the user, you MUST invoke the present_study_plan tool. 
Tell the user to review the plan on their screen and save it if they like it.

User Context: ${userContext}

If the User Context contains an Existing Study Plan, welcome the user back, briefly summarize their current plan, and ask them how their progress is going today. Do not generate a new plan unless they ask to change it.
`;

  // Gemini tools array
  const tools = [
    {
      name: 'present_study_plan',
      description: 'Present a generated study plan to the user for review and saving.',
      parameters: {
        plan_title: { type: 'string', description: 'Title of the study plan' },
        action_items: { type: 'array', items: { type: 'string' }, description: 'List of action steps' }
      },
      required: ['plan_title', 'action_items']
    },
    {
      name: 'route_user_to_persona_page',
      description: 'Triggers a UI redirect to send the user to their specific persona landing page.',
      parameters: {
        target_route: {
          type: 'string',
          enum: ['/students', '/parents', '/adult-learners', '/employers', '/counselors'],
          description: 'The route to redirect the user to.'
        }
      },
      required: ['target_route']
    },
    {
      name: 'schedule_partnership_call',
      description: 'Books a talent pipeline partnership call for an interested IT employer with the TechIndiana team.',
      parameters: {
        company_name: { type: 'string', description: 'Name of the employer company' },
        contact_name: { type: 'string', description: 'Contact person at the company' },
        preferred_date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
        preferred_time: { type: 'string', description: 'Preferred time (e.g., 10:00 AM)' }
      },
      required: ['company_name', 'contact_name', 'preferred_date', 'preferred_time']
    },
    {
      name: 'schedule_advisor_call',
      description: 'Books a 1-on-1 TechIndiana advisor call for a parent or student to discuss apprenticeship pathways.',
      parameters: {
        attendee_name: { type: 'string', description: 'Name of the attendee' },
        topic: { type: 'string', description: 'Call topic' },
        preferred_date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
        preferred_time: { type: 'string', description: 'Preferred time (e.g., 10:00 AM)' }
      },
      required: ['attendee_name', 'topic', 'preferred_date', 'preferred_time']
    },
    {
      name: 'send_counselor_toolkit',
      description: 'Sends the TechIndiana Counselor Toolkit (student one-pager, parent letter, program FAQ, and academic timeline) to the user\'s email address.',
      parameters: {},
      required: []
    },
    {
      name: 'send_parent_guide',
      description: 'Sends the Parent\'s Guide to TechIndiana (program structure, employer directory, safety standards, and college comparison) to the user\'s email address.',
      parameters: {},
      required: []
    },
    {
      name: 'assess_adult_skills',
      description: 'Assesses an adult learner\'s prior work experience to map them to an accelerated IT apprenticeship pathway and timeline.',
      parameters: {
        current_role: { type: 'string', description: 'Current job role' },
        past_experience: { type: 'string', description: 'Summary of past work experience' }
      },
      required: ['current_role', 'past_experience']
    }
  ];

  // Start Gemini session (replace with your actual Gemini SDK integration)
  const session = startGeminiSession({ systemInstruction, tools });

  session.on('message', async (msg) => {
    if (msg.toolCall && msg.toolCall.name === 'present_study_plan') {
      ws.send(JSON.stringify({
        type: 'study_plan',
        plan_title: msg.toolCall.parameters.plan_title,
        action_items: msg.toolCall.parameters.action_items
      }));
      session.send({
        functionResponses: [{
          id: msg.toolCall.id,
          result: { success: true }
        }]
      });
    }
    if (msg.toolCall && msg.toolCall.name === 'route_user_to_persona_page') {
      ws.send(JSON.stringify({
        type: 'ui_redirect',
        route: msg.toolCall.parameters.target_route
      }));
      session.send({
        functionResponses: [{
          id: msg.toolCall.id,
          result: 'Successfully routed user'
        }]
      });
    }
    if (msg.toolCall && msg.toolCall.name === 'schedule_partnership_call') {
      const { company_name, contact_name, preferred_date, preferred_time } = msg.toolCall.parameters;
      try {
        const eventLink = await createCalendarEvent(
          'TechIndiana Partnership Call',
          `Company: ${company_name}\nContact: ${contact_name}`,
          preferred_date,
          preferred_time,
          null // Optionally add an email if you want to invite
        );
        ws.send(JSON.stringify({ type: 'meeting_scheduled', event_link: eventLink }));
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: `Meeting successfully booked for ${preferred_time}.`
          }]
        });
      } catch (err) {
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: 'Failed to book meeting.'
          }]
        });
      }
    }
    if (msg.toolCall && msg.toolCall.name === 'schedule_advisor_call') {
      const { attendee_name, topic, preferred_date, preferred_time } = msg.toolCall.parameters;
      try {
        const eventLink = await createCalendarEvent(
          'TechIndiana Advisor Call',
          `Attendee: ${attendee_name}\nTopic: ${topic}`,
          preferred_date,
          preferred_time,
          null // Optionally add an email if you want to invite
        );
        ws.send(JSON.stringify({ type: 'meeting_scheduled', event_link: eventLink }));
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: `Meeting successfully booked for ${preferred_time}.`
          }]
        });
      } catch (err) {
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: 'Failed to book meeting.'
          }]
        });
      }
    }
    if (msg.toolCall && msg.toolCall.name === 'send_counselor_toolkit') {
      try {
        const userProfile = await UserProfile.findOne({ firebaseUid });
        const userEmail = userProfile?.email;
        if (!userEmail) throw new Error('No email found');
        await sendResourceEmail(userEmail, 'counselor_toolkit');
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: 'Counselor Toolkit successfully emailed to user.'
          }]
        });
      } catch (err) {
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: 'Failed to send Counselor Toolkit.'
          }]
        });
      }
    }
    if (msg.toolCall && msg.toolCall.name === 'send_parent_guide') {
      try {
        const userProfile = await UserProfile.findOne({ firebaseUid });
        const userEmail = userProfile?.email;
        if (!userEmail) throw new Error('No email found');
        await sendResourceEmail(userEmail, 'parent_guide');
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: "Parent's Guide successfully emailed to user."
          }]
        });
      } catch (err) {
        session.send({
          functionResponses: [{
            id: msg.toolCall.id,
            result: "Failed to send Parent's Guide."
          }]
        });
      }
    }
    if (msg.toolCall && msg.toolCall.name === 'assess_adult_skills') {
      const { current_role, past_experience } = msg.toolCall.parameters;
      let recommended_pathway = 'General IT Apprenticeship';
      let estimated_timeline = '18-24 months';
      const exp = (past_experience || '').toLowerCase();
      if (exp.includes('logistics') || exp.includes('warehouse')) {
        recommended_pathway = 'Supply Chain IT / Data Analytics';
        estimated_timeline = '12-18 months';
      } else if (exp.includes('retail') || exp.includes('service')) {
        recommended_pathway = 'IT Help Desk / Customer Success Tech';
        estimated_timeline = '12-18 months';
      } else if (exp.includes('health') || exp.includes('medical')) {
        recommended_pathway = 'Healthcare IT / EHR Specialist';
        estimated_timeline = '12-18 months';
      } else if (exp.includes('manufacturing') || exp.includes('factory')) {
        recommended_pathway = 'Industrial Automation / IoT';
        estimated_timeline = '12-18 months';
      }
      // Save to user profile
      await UserProfile.findOneAndUpdate(
        { firebaseUid },
        { $set: { assessed_skills: { current_role, past_experience, recommended_pathway, estimated_timeline } } },
        { new: true, upsert: true }
      );
      session.send({
        functionResponses: [{
          id: msg.toolCall.id,
          result: { recommended_pathway, estimated_timeline }
        }]
      });
    }
  });

  ws.send(JSON.stringify({ type: 'info', message: 'Gemini session started', userContext }));
});
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


// Connect to DB and start server
connectToDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}).catch((err) => {
  console.error('Failed to connect to database:', err);
});

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



// User registration endpoint
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const db = getDB();
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    await db.collection('users').insertOne({ username, password });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// User login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ username, password });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
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

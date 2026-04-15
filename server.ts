import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from '@google/genai';
import path from 'path';
import fs from 'fs';

console.log('DEBUG: Node.js version:', process.version);
console.log('DEBUG: Initializing GoogleGenAI...');
import { createServer as createViteServer } from 'vite';
import UserProfile from './src/models/UserProfile';
import { firebaseAuthMiddleware, verifyWebSocketToken } from './src/middleware/auth';
import sessionRouter from './server/routes/session';
import { createCalendarEvent } from './server/services/calendarService';
import { sendResourceEmail } from './server/services/emailService';
import { fetchVideosForSkills } from './server/services/youtubeService';
import dotenv from 'dotenv';

dotenv.config();
// Also load src/.env (common when env files live next to frontend); does not override existing vars.
dotenv.config({ path: path.join(process.cwd(), 'src', '.env') });

// Global error handling to prevent 1005 WebSocket closures from silent crashes
process.on("uncaughtException", (err) => {
  console.error("FATAL: Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("FATAL: Unhandled Rejection at:", promise, "reason:", reason);
});

// If a Firebase service account JSON file exists in the repo (common local pattern
// like `*-firebase-adminsdk-*.json`), load it into the environment so the
// existing initialization code can parse it. This avoids requiring the user to
// paste the JSON into `.env` while keeping the file out of source control.
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const files = fs.readdirSync(process.cwd());
    const candidate = files.find(f => f.toLowerCase().includes('firebase-adminsdk') && f.toLowerCase().endsWith('.json'));
    if (candidate) {
      const content = fs.readFileSync(path.join(process.cwd(), candidate), 'utf8');
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = content;
      console.log(`Loaded Firebase service account from file: ${candidate}`);
    }
  } catch (e) {
    // Ignore - we'll fall back to the .env variable if provided
  }
}

// --- Firebase Admin Initialization ---
// Prefer base64-encoded service account if provided, then raw JSON string, then explicit JSON env var.
let firebaseServiceAccount = undefined as string | undefined;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  try {
    firebaseServiceAccount = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    console.log('Using FIREBASE_SERVICE_ACCOUNT_BASE64 for Firebase Admin initialization.');
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:', e);
  }
}
if (!firebaseServiceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
  firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
}
if (!firebaseServiceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
}

if (firebaseServiceAccount) {
  try {
    let rawValue = firebaseServiceAccount.trim();
    
    // Handle cases where the string might be wrapped in single quotes (common in .env files)
    if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
      rawValue = rawValue.substring(1, rawValue.length - 1).trim();
    }
    
    // Handle cases where the string might be wrapped in double quotes
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      // Only strip if it's not a valid JSON object starting with { and ending with }
      if (!(rawValue.startsWith('"{') && rawValue.endsWith('}"'))) {
        rawValue = rawValue.substring(1, rawValue.length - 1).trim();
      }
    }
    
    let serviceAccount: any;
    
    // Helper to parse with fallback for double-encoding or string-wrapping
    const robustParse = (str: string): any => {
      try {
        const parsed = JSON.parse(str);
        // If it parsed into a string, it might be double-encoded
        if (typeof (parsed) === 'string') {
          return robustParse(parsed);
        }
        return parsed;
      } catch (e) {
        // Try to extract JSON object if it's embedded in other text
        const start = str.indexOf('{');
        const end = str.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          const extracted = str.substring(start, end + 1);
          try {
            const parsedExtracted = JSON.parse(extracted);
            if (typeof (parsedExtracted) === 'string') {
              return robustParse(parsedExtracted);
            }
            return parsedExtracted;
          } catch (e2) {
            // If extraction also fails, throw the original error
            throw e;
          }
        }
        throw e;
      }
    };

    serviceAccount = robustParse(rawValue);

    if (serviceAccount && typeof serviceAccount === 'object' && serviceAccount.project_id) {
      // Avoid initializing Firebase Admin multiple times in environments where the module
      // might be reloaded. Check existing apps first.
      if (!admin.apps || admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('Firebase Admin initialized successfully.');
      } else {
        console.log('Firebase Admin already initialized; skipping initializeApp.');
      }
    } else {
      throw new Error('Parsed service account is not a valid object or missing project_id.');
    }
  } catch (error) {
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT (JSON):', error);
    if (firebaseServiceAccount) {
      console.error('Raw value length:', firebaseServiceAccount.length);
      console.error('Value starts with:', firebaseServiceAccount.substring(0, 50));
    }
  }
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_JSON not found. Auth middleware will fail.');
}

// --- MongoDB Connection ---
let MONGODB_URI = process.env.MONGODB_URI;

// If MONGODB_URI doesn't include the database name but MONGODB_DB is provided, append it.
if (MONGODB_URI && process.env.MONGODB_DB) {
  // Simple check to append DB name if not already present in basic URI
  if (MONGODB_URI.endsWith('/')) {
    MONGODB_URI += process.env.MONGODB_DB;
  } else if (!MONGODB_URI.includes('/', MONGODB_URI.indexOf('//') + 2)) {
    MONGODB_URI += '/' + process.env.MONGODB_DB;
  }
}

let isMongoConnected = false;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB.');
      isMongoConnected = true;
    })
    .catch(err => {
      console.error('MongoDB connection error:', err);
      isMongoConnected = false;
    });
} else {
  console.warn('MONGODB_URI not found. Database features (UserProfile) will be disabled. Please set MONGODB_URI in your environment variables (e.g., from MongoDB Atlas).');
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const PORT = parseInt(process.env.PORT || '8080', 10);

  // Set COOP header for all responses to allow window.close/closed for Google Auth/Firebase
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  app.use(express.json());

  // --- REST API: Session Endpoints ---
  app.use('/api/session', sessionRouter);

  // --- REST API: Profile Endpoints ---
  app.post('/api/profile', firebaseAuthMiddleware, async (req, res) => {
    if (!isMongoConnected) {
      return res.status(503).json({ error: 'Database service unavailable. Please configure MONGODB_URI.' });
    }

    const { name, background, expectations } = req.body;
    const firebaseUid = req.uid;

    if (!firebaseUid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const profile = await UserProfile.findOneAndUpdate(
        { firebaseUid },
        { name, background, expectations },
        { new: true, upsert: true }
      );
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error saving profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/profile/plan', firebaseAuthMiddleware, async (req, res) => {
    if (!isMongoConnected) {
      return res.status(503).json({ error: 'Database service unavailable.' });
    }

    const { study_plan } = req.body;
    const firebaseUid = req.uid;

    try {
      const profile = await UserProfile.findOneAndUpdate(
        { firebaseUid },
        { study_plan: typeof study_plan === 'string' ? study_plan : JSON.stringify(study_plan) },
        { new: true, upsert: true }
      );
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error saving study plan:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/profile', firebaseAuthMiddleware, async (req, res) => {
    if (!isMongoConnected) {
      return res.status(503).json({ error: 'Database service unavailable.' });
    }

    const firebaseUid = req.uid;

    try {
      const profile = await UserProfile.findOne({ firebaseUid });
      if (!profile) {
        return res.json({ success: true, profile: null });
      }
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- WebSocket: Voice Agent ---
  const saveUserProfileTool: FunctionDeclaration = {
    name: "save_user_profile",
    description: "Saves the student's name, background, and expectations to their profile.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "The student's full name." },
        background: { type: Type.STRING, description: "The student's technical background or current level." },
        expectations: { type: Type.STRING, description: "What the student expects from the TechIndiana program." }
      },
      required: ["name", "background", "expectations"]
    }
  };

  const generateYoutubeStudyPlanTool: FunctionDeclaration = {
    name: "generate_youtube_study_plan",
    description: "Generates a dated study plan timeline and fetches relevant YouTube tutorial videos for missing skills.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        plan_title: { type: Type.STRING, description: "The overarching title of the study plan." },
        missing_skills: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "A list of 2-3 specific technical skills the user currently lacks for their goal." 
        },
        milestones: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING, description: "The milestone date starting from today April 10, 2026 (Format: Month Day, Year)." },
              topic: { type: Type.STRING, description: "Short heading for this milestone." },
              action_items: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific steps to take." }
            },
            required: ["date", "topic", "action_items"]
          }
        }
      },
      required: ["plan_title", "missing_skills", "milestones"]
    }
  };

  const saveConversationSummaryTool: FunctionDeclaration = {
    name: "save_conversation_summary",
    description: "Saves a concise summary of the current conversation to the database.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: "A 2-3 sentence summary of the student's progress and roadblocks." }
      },
      required: ["summary"]
    }
  };

  const routeUserToPersonaPageTool: FunctionDeclaration = {
    name: "route_user_to_persona_page",
    description: "Triggers a UI redirect to send the user to their specific persona landing page.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        target_route: { 
          type: Type.STRING, 
          description: "The exact path to redirect the user to.",
          enum: ["/students", "/parents", "/adult-learners", "/employers", "/counselors"]
        }
      },
      required: ["target_route"]
    }
  };

  const schedulePartnershipCallTool: FunctionDeclaration = {
    name: "schedule_partnership_call",
    description: "Books a talent pipeline partnership call for an interested IT employer with the TechIndiana team.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        company_name: { type: Type.STRING, description: "The name of the company." },
        contact_name: { type: Type.STRING, description: "The name of the contact person." },
        preferred_date: { type: Type.STRING, description: "The date of the call (format YYYY-MM-DD)." },
        preferred_time: { type: Type.STRING, description: "The time of the call (e.g., '10:00 AM')." }
      },
      required: ["company_name", "contact_name", "preferred_date", "preferred_time"]
    }
  };

  const scheduleAdvisorCallTool: FunctionDeclaration = {
    name: "schedule_advisor_call",
    description: "Books a 1-on-1 TechIndiana advisor call for a parent or student to discuss apprenticeship pathways.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        attendee_name: { type: Type.STRING, description: "The name of the parent or student." },
        topic: { type: Type.STRING, description: "The topic to discuss during the call." },
        preferred_date: { type: Type.STRING, description: "The date of the advisor call (format YYYY-MM-DD)." },
        preferred_time: { type: Type.STRING, description: "The time of the advisor call (e.g., '2:30 PM')." }
      },
      required: ["attendee_name", "topic", "preferred_date", "preferred_time"]
    }
  };

  const sendCounselorToolkitTool: FunctionDeclaration = {
    name: "send_counselor_toolkit",
    description: "Sends the TechIndiana Counselor Toolkit (student one-pager, parent letter, program FAQ, and academic timeline) to the user's email address.",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  };

  const sendParentGuideTool: FunctionDeclaration = {
    name: "send_parent_guide",
    description: "Sends the Parent's Guide to TechIndiana (program structure, employer directory, safety standards, and college comparison) to the user's email address.",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  };

  const assessAdultSkillsTool: FunctionDeclaration = {
    name: "assess_adult_skills",
    description: "Assesses an adult learner's prior work experience to map them to an accelerated IT apprenticeship pathway and timeline.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        current_role: { type: Type.STRING, description: "The user's current job role." },
        past_experience: { type: Type.STRING, description: "Detailed description of the user's past work experience." }
      },
      required: ["current_role", "past_experience"]
    }
  };

  const extractAndSaveMemoryTool: FunctionDeclaration = {
    name: "extract_and_save_memory",
    description: "Use this tool whenever the user shares a new, important personal fact, preference, roadblock, or career aspiration. This saves the fact to their permanent profile.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        memory_fact: { type: Type.STRING, description: "A concise, 1-sentence summary of the important fact to remember." }
      },
      required: ["memory_fact"]
    }
  };

  const showPathwayComparisonTool: FunctionDeclaration = {
    name: "show_pathway_comparison",
    description: "Pushes a visual, side-by-side comparison of the TechIndiana Apprenticeship vs. Traditional 4-Year College to the user's screen. Use this when a parent asks how the program compares to college, or asks about costs, timelines, and outcomes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        comparison_points: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              metric: { type: Type.STRING, description: "The metric being compared (e.g., 'Cost', 'Experience')." },
              apprenticeship_value: { type: Type.STRING, description: "The value/benefit for the apprenticeship pathway." },
              college_value: { type: Type.STRING, description: "The value/cost for the traditional college pathway." }
            },
            required: ["metric", "apprenticeship_value", "college_value"]
          }
        }
      },
      required: ["comparison_points"]
    }
  };

  wss.on('connection', async (ws: WebSocket, request: http.IncomingMessage, uid: string) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Phase3 CONNECT] ✅ Client WebSocket connected. UID: ${uid}`);
    console.log(`[Phase3 CONNECT] Headers: origin=${request.headers.origin}, host=${request.headers.host}`);
    console.log(`${'='.repeat(60)}\n`);

    let clientAudioChunks = 0;
    let geminiAudioChunks = 0;
    
    ws.on('error', (err) => {
      console.error(`[Phase3 ERROR] ❌ WebSocket Server Error for ${uid}:`, err);
    });

    ws.on('close', (code, reason) => {
      console.log(`[Phase3 DISCONNECT] ⚠️  Client disconnected. UID: ${uid} | Code: ${code} | Reason: ${reason?.toString() || 'none'}`);
    });

    let geminiSession: any = null;
    let geminiReady = false;
    let aiTurnActive = false;  // true while Gemini is streaming audio in the current turn
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!geminiApiKey) {
      console.error('[Phase3 Init] Missing GEMINI_API_KEY or GOOGLE_API_KEY (check project root .env or src/.env).');
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message:
              'Advisor service is not configured: add GEMINI_API_KEY or GOOGLE_API_KEY to .env in the project root or src/.env, then restart the server.',
          })
        );
      }
      ws.close();
      return;
    }
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    console.log(`[Phase3 Init] Gemini API key present: true | Length: ${geminiApiKey.length}`);
    console.log(`[Phase3 Init] FIREBASE_ADMIN initialized: ${admin.apps.length > 0}`);
    console.log(`[Phase3 Init] MongoDB connected: ${isMongoConnected}`);

    try {
      // 1. Query MongoDB for user profile (if connected)
      let profile = null;
      if (isMongoConnected) {
        profile = await UserProfile.findOne({ firebaseUid: uid });
        
        // If profile doesn't exist, try to create a basic one from Firebase Auth
        if (!profile) {
          try {
            const userRecord = await admin.auth().getUser(uid);
            profile = await UserProfile.findOneAndUpdate(
              { firebaseUid: uid },
              { 
                name: userRecord.displayName || "Student",
                email: userRecord.email
              },
              { new: true, upsert: true }
            );
            console.log(`[Phase3 Init] 🆕 Created new profile for UID: ${uid} (Name: ${profile.name})`);
          } catch (e) {
            console.warn(`[Phase3 Init] Could not fetch user from Firebase Admin:`, e);
          }
        }
      }
      
      // 2. Connect to Gemini Live API
      let memoryInjection = "";
      const userName = profile?.name || "Student";

      if (profile && profile.saved_memories && profile.saved_memories.length > 0) {
        memoryInjection = `\n\n### User's Past Memories:\n- ${profile.saved_memories.join('\n- ')}\n\nReview the past memories above. Welcome ${userName} back naturally and use these facts to personalize your advice. Do not ask for their name or any information already mentioned in these memories.`;
        console.log(`[Phase3 Gemini] 🧠 Injecting ${profile.saved_memories.length} past memories for ${uid}.`);
      }

      const systemInstruction = `You are the official voice-based academic advisor for TechIndiana. Your tone is upbeat, technical, encouraging, and welcoming. You are currently speaking with ${userName}. Address them by name. 

When a user shares their background, strictly analyze their current skills vs. their career goal and verbally identify the exact gap. When they ask for a course of action, invoke the 'generate_youtube_study_plan' tool. Include specific dates for each milestone, starting from today: April 10, 2026. Do not ask for their name as you already have it.${memoryInjection}`;
      
      try {
        console.log(`[Gemini Handshake] Connecting with model: gemini-2.5-flash-native-audio-preview-12-2025 for UID: ${uid}`);

        console.log(`[Phase3 Gemini] ⏳ Calling ai.live.connect() for UID: ${uid}...`);
        geminiSession = await ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Puck"
                }
              }
            },
            tools: [
              {
                functionDeclarations: [
                  saveUserProfileTool,
                  generateYoutubeStudyPlanTool,
                  saveConversationSummaryTool,
                  routeUserToPersonaPageTool,
                  schedulePartnershipCallTool,
                  scheduleAdvisorCallTool,
                  sendCounselorToolkitTool,
                  sendParentGuideTool,
                  assessAdultSkillsTool,
                  showPathwayComparisonTool,
                  extractAndSaveMemoryTool
                ]
              }
            ]
          },
          callbacks: {
            onopen: () => {
              console.log(`[Phase3 Gemini] ✅ Gemini session OPEN for ${uid}. Waiting for setupComplete...`);
            },
            onclose: () => {
              console.log(`[Phase3 Gemini] ⚠️  Gemini session CLOSED for ${uid}. Closing client WS.`);
              if (ws.readyState === ws.OPEN) ws.close();
            },
            onerror: (err: any) => {
              console.error(`[Phase3 Gemini] ❌ Gemini session ERROR for ${uid}:`, err);
              ws.send(JSON.stringify({ type: 'error', message: 'Gemini connection error.' }));
            },
            onmessage: async (msg: any) => {
          if (msg.setupComplete) {
            console.log(`[Phase3 Gemini] ✅ BidiGenerateContentSetup ACK received — Gemini is READY for ${uid}.`);
            geminiReady = true;
            console.log(`[Phase3 Gemini] Sending initial greeting prompt...`);
            
            const userName = profile?.name || "Student";
            geminiSession.sendRealtimeInput({
              text: `Hello, I am ${userName}, a TechIndiana user. Please greet me by name and ask if I'm ready to continue our career exploration.`
            });
            console.log(`[Phase3 Gemini] Initial greeting text sent for user: ${userName}`);
          }
          
          // Handle Transcriptions and save to history
          if (msg.serverContent?.modelTurn?.parts) {
            const textPart = msg.serverContent.modelTurn.parts.find((p: any) => p.text);
            if (textPart && textPart.text) {
              console.log(`[Phase3 Gemini] Model text → "${textPart.text.substring(0, 80)}"`);
              if (isMongoConnected) {
                await UserProfile.findOneAndUpdate(
                  { firebaseUid: uid },
                  { $push: { conversation_history: { role: 'model', content: textPart.text, timestamp: new Date() } } }
                );
              }
              ws.send(JSON.stringify({ type: 'transcript', role: 'Advisor', text: textPart.text }));
            }

            // Forward audio from Gemini to Client
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData) {
                // First audio chunk of a new turn → tell client to mute mic
                if (!aiTurnActive) {
                  aiTurnActive = true;
                  console.log(`[Turn] 🔇 AI started speaking — sending speech_start`);
                  ws.send(JSON.stringify({ type: 'speech_start' }));
                }
                geminiAudioChunks++;
                if (geminiAudioChunks % 50 === 1) {
                  console.log(`[Phase3 Audio] 🔊 Gemini audio chunk #${geminiAudioChunks} → forwarding to client. Data length: ${part.inlineData.data?.length ?? 0}`);
                }
                ws.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            }
          }

          // AI finished its turn → tell client to re-enable mic
          if (msg.serverContent?.turnComplete && aiTurnActive) {
            aiTurnActive = false;
            console.log(`[Turn] 🎤 AI turn complete — sending speech_end`);
            ws.send(JSON.stringify({ type: 'speech_end' }));
          }

          // User interrupted AI → also end the turn signal
          if (msg.serverContent?.interrupted && aiTurnActive) {
            aiTurnActive = false;
            console.log(`[Turn] ⚡ AI interrupted — sending speech_end`);
            ws.send(JSON.stringify({ type: 'speech_end' }));
          }

          // Handle user transcriptions if enabled
          const userText = msg.inputAudioTranscription?.text;
          if (userText) {
            console.log(`[Gemini Content] User said: ${userText}`);
            if (isMongoConnected) {
              await UserProfile.findOneAndUpdate(
                { firebaseUid: uid },
                { $push: { conversation_history: { role: 'user', content: userText, timestamp: new Date() } } }
              );
            }
            ws.send(JSON.stringify({ type: 'transcript', role: 'User', text: userText }));
          }

          // Handle Tool Calls
          if (msg.toolCall) {
            console.warn(`\n${'🚨'.repeat(10)}`);
            console.warn(`[Phase4 TOOL CALL] 🚨 AI PAUSED: WAITING FOR TOOL RESPONSE`);
            console.warn(`[Phase4 TOOL CALL] Function(s) requested: ${msg.toolCall.functionCalls.map((c: any) => c.name).join(', ')}`);
            console.warn(`[Phase4 TOOL CALL] The AI will produce NO audio until sendToolResponse() is called with matching IDs.`);
            console.warn(`${'🚨'.repeat(10)}\n`);
            for (const call of msg.toolCall.functionCalls) {
              console.log(`[Phase4 TOOL CALL] Processing call: name="${call.name}" id="${call.id}"`);
              if (call.name === "save_user_profile") {
                console.log(`Tool call: save_user_profile for ${uid}`, call.args);
                
                if (!isMongoConnected) {
                  console.error('Cannot save profile: MongoDB not connected.');
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "save_user_profile",
                      response: { success: false, error: 'Database not configured on server.' },
                      id: call.id
                    }]
                  });
                  ws.send(JSON.stringify({ type: 'error', message: 'Database not configured. Profile not saved.' }));
                  continue;
                }

                try {
                  await UserProfile.findOneAndUpdate(
                    { firebaseUid: uid },
                    call.args,
                    { new: true, upsert: true }
                  );
                  
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "save_user_profile",
                      response: { success: true },
                      id: call.id
                    }]
                  });
                  console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "save_user_profile" id="${call.id}". AI should now RESUME.`);
                  
                  ws.send(JSON.stringify({ type: 'status', message: 'Profile saved successfully.' }));
                } catch (err) {
                  console.error('Error in tool call:', err);
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "save_user_profile",
                      response: { success: false, error: 'Database error' },
                      id: call.id
                    }]
                  });
                }
              } else if (call.name === "present_study_plan") {
                console.log(`[Phase4 TOOL CALL] present_study_plan for ${uid}`, call.args);
                ws.send(JSON.stringify({ type: 'study_plan_preview', plan: call.args }));
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: "present_study_plan",
                    response: { success: true },
                    id: call.id
                  }]
                });
                console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "present_study_plan" id="${call.id}". AI should now RESUME.`);
              } else if (call.name === "save_conversation_summary") {
                console.log(`[Phase4 TOOL CALL] save_conversation_summary for ${uid}`, call.args);
                if (!isMongoConnected) {
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "save_conversation_summary",
                      response: { success: false, error: 'Database not configured.' },
                      id: call.id
                    }]
                  });
                  console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse (no-db) sent for "save_conversation_summary" id="${call.id}". AI should now RESUME.`);
                  continue;
                }
                try {
                  await UserProfile.findOneAndUpdate(
                    { firebaseUid: uid },
                    { conversation_summary: call.args.summary },
                    { new: true, upsert: true }
                  );
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "save_conversation_summary",
                      response: { success: true },
                      id: call.id
                    }]
                  });
                  console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "save_conversation_summary" id="${call.id}". AI should now RESUME.`);
                } catch (err) {
                  console.error('[Phase4 TOOL CALL] ❌ Error in save_conversation_summary:', err);
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "save_conversation_summary",
                      response: { success: false, error: 'Database error' },
                      id: call.id
                    }]
                  });
                  console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse (error fallback) sent for "save_conversation_summary" id="${call.id}". AI should now RESUME.`);
                }
              } else if (call.name === "route_user_to_persona_page") {
                console.log(`[Phase4 TOOL CALL] route_user_to_persona_page for ${uid}`, call.args);
                ws.send(JSON.stringify({ type: 'ui_redirect', route: call.args.target_route }));
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: "route_user_to_persona_page",
                    response: { result: "Successfully routed user" },
                    id: call.id
                  }]
                });
                console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "route_user_to_persona_page" id="${call.id}". AI should now RESUME.`);
              } else if (call.name === "schedule_partnership_call") {
                console.log(`[Phase4 TOOL CALL] schedule_partnership_call for ${uid}`, call.args);
                const eventLink = await createCalendarEvent(`Partnership Call: ${call.args.company_name} x TechIndiana`, `Partnership discussion.`, call.args.preferred_date, call.args.preferred_time);
                ws.send(JSON.stringify({ type: 'meeting_scheduled', event_link: eventLink }));
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: "schedule_partnership_call",
                    response: { result: `Meeting successfully booked for ${call.args.preferred_time}.` },
                    id: call.id
                  }]
                });
                console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "schedule_partnership_call" id="${call.id}". AI should now RESUME.`);
              } else if (call.name === "schedule_advisor_call") {
                console.log(`[Phase4 TOOL CALL] schedule_advisor_call for ${uid}`, call.args);
                const eventLink = await createCalendarEvent(`Advisor Call: ${call.args.attendee_name}`, `Topic: ${call.args.topic}`, call.args.preferred_date, call.args.preferred_time);
                ws.send(JSON.stringify({ type: 'meeting_scheduled', event_link: eventLink }));
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: "schedule_advisor_call",
                    response: { result: `Meeting successfully booked for ${call.args.preferred_time}.` },
                    id: call.id
                  }]
                });
                console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "schedule_advisor_call" id="${call.id}". AI should now RESUME.`);
              } else if (call.name === "send_counselor_toolkit" || call.name === "send_parent_guide") {
                console.log(`[Phase4 TOOL CALL] ${call.name} for ${uid}`);
                const resourceType = call.name === "send_counselor_toolkit" ? "COUNSELOR_TOOLKIT" : "PARENT_GUIDE";
                let userEmail = "";
                if (isMongoConnected) {
                  const userDoc = await UserProfile.findOne({ firebaseUid: uid });
                  if (userDoc) userEmail = (userDoc as any).email;
                }
                if (userEmail) {
                  await sendResourceEmail(userEmail, resourceType);
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      response: { result: "Success" },
                      id: call.id
                    }]
                  });
                  console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "${call.name}" id="${call.id}". AI should now RESUME.`);
                } else {
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: call.name,
                      response: { result: "Failed: User email not found." },
                      id: call.id
                    }]
                  });
                  console.warn(`[Phase4 TOOL CALL] ⚠️ sendToolResponse (no email) sent for "${call.name}" id="${call.id}". AI should now RESUME.`);
                }
              } else if (call.name === "assess_adult_skills") {
                console.log(`[Phase4 TOOL CALL] assess_adult_skills for ${uid}`, call.args);
                const recommended_pathway = "IT Success Pathway";
                const estimated_timeline = "12-18 months";
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: "assess_adult_skills",
                    response: { recommended_pathway, estimated_timeline, result: "Assessed" },
                    id: call.id
                  }]
                });
                console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "assess_adult_skills" id="${call.id}". AI should now RESUME.`);
              } else if (call.name === "show_pathway_comparison") {
                console.log(`[Phase4 TOOL CALL] show_pathway_comparison for ${uid}`, call.args);
                ws.send(JSON.stringify({ type: 'render_comparison', data: call.args.comparison_points }));
                geminiSession.sendToolResponse({
                  functionResponses: [{
                    name: "show_pathway_comparison",
                    response: { result: "Success" },
                    id: call.id
                  }]
                });
                console.log(`[Phase4 TOOL CALL] ✅ sendToolResponse sent for "show_pathway_comparison" id="${call.id}". AI should now RESUME.`);
              } else if (call.name === "generate_youtube_study_plan") {
                console.log(`[Phase4 TOOL CALL] generate_youtube_study_plan for ${uid}`, call.args);
                const { plan_title, missing_skills, milestones } = call.args;
                
                try {
                  const videoData = await fetchVideosForSkills(missing_skills);
                  console.log(`[Phase4 TOOL CALL] 🎥 Fetched ${videoData.length} YouTube videos for missing skills.`);
                  
                  const planPayload = { plan_title, missing_skills, milestones, videos: videoData };

                  // Auto-save study plan to MongoDB
                  if (isMongoConnected) {
                    try {
                      await UserProfile.findOneAndUpdate(
                        { firebaseUid: uid },
                        { study_plan: JSON.stringify(planPayload) },
                        { new: true, upsert: true }
                      );
                      console.log(`[Phase4 TOOL CALL] 💾 Study plan auto-saved to MongoDB for ${uid}.`);
                    } catch (dbErr) {
                      console.error(`[Phase4 TOOL CALL] Failed to auto-save study plan:`, dbErr);
                    }
                  }

                  ws.send(JSON.stringify({ 
                    type: 'study_plan_ready', 
                    plan: planPayload
                  }));

                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "generate_youtube_study_plan",
                      response: { success: true, message: `A study plan with ${videoData.length} YouTube tutorials has been generated and displayed.` },
                      id: call.id
                    }]
                  });
                } catch (err) {
                  console.error('Error fetching YouTube videos:', err);
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "generate_youtube_study_plan",
                      response: { success: false, error: "Failed to fetch supporting YouTube videos." },
                      id: call.id
                    }]
                  });
                }
              } else if (call.name === "extract_and_save_memory") {
                console.log(`[Phase4 TOOL CALL] extract_and_save_memory for ${uid}`, call.args);
                const memoryFact = call.args.memory_fact;

                if (isMongoConnected) {
                  try {
                    await UserProfile.findOneAndUpdate(
                      { firebaseUid: uid },
                      { $push: { saved_memories: memoryFact } }
                    );
                    console.log(`[Phase4 TOOL CALL] ✅ Memory saved to MongoDB: "${memoryFact}"`);
                    
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "extract_and_save_memory",
                        response: { success: true, message: "Memory saved to long-term storage." },
                        id: call.id
                      }]
                    });
                  } catch (err) {
                    console.error('Error saving memory to MongoDB:', err);
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "extract_and_save_memory",
                        response: { success: false, error: "Database error" },
                        id: call.id
                      }]
                    });
                  }
                } else {
                  console.warn('Cannot save memory: MongoDB not connected.');
                  geminiSession.sendToolResponse({
                    functionResponses: [{
                      name: "extract_and_save_memory",
                      response: { success: false, error: "Database not connected" },
                      id: call.id
                    }]
                  });
                }
              } else {
                console.warn(`[Phase4 TOOL CALL] ⚠️  UNHANDLED tool call: "${call.name}" id="${call.id}". AI will be permanently paused! Add a handler.`);
              }
            }
          }
        },  // end onmessage
      },   // end callbacks
    });    // end live.connect()
        console.log(`[Phase3 Gemini] ✅ ai.live.connect() returned for ${uid}. Type: ${typeof geminiSession}`);

      } catch (err: any) {
        console.error('CRITICAL: Gemini connection failed during connect():', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Gemini service failed to start.' }));
        ws.close();
        return;
      }

      // Handle messages from Client
      ws.on('message', (data: any) => {
        try {
          console.log(`[WS Receive] Raw message length: ${data.length}`);
          const message = JSON.parse(data.toString());
          if (message.type === 'audio' && geminiSession && geminiReady) {
            console.log(`[WS Audio] Forwarding ${message.data.length} bytes to Gemini`);
            const base64Audio = message.data.includes(',') ? message.data.split(',')[1] : message.data;
            geminiSession.sendRealtimeInput({
              audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        } catch (err) {
          // Assume raw audio if not JSON
          if (geminiSession && geminiReady) {
            console.log(`[WS Audio] Forwarding raw data ${data.length} bytes to Gemini`);
            const base64Audio = data.toString('base64');
            geminiSession.sendRealtimeInput({
              audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected: ${uid}`);
        geminiSession?.close();
      });

    } catch (error) {
      console.error('Error in WebSocket connection:', error);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to initialize voice agent.' }));
      }
      ws.close();
    }
  });

  // --- Vite / static before voice upgrade so HMR can attach to the same http.Server ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Upgrade HTTP to WebSocket — only handle voice agent; leave other paths (e.g. Vite HMR) alone.
  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    if (url.pathname !== '/api/voice-agent') {
      return;
    }

    const token = url.searchParams.get('token');
    console.log('WebSocket upgrade request token:', token ? `${token.substring(0, 60)}${token.length > 60 ? '...' : ''}` : '<<none>>');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let uid: string | null = null;
    try {
      if (process.env.NODE_ENV !== 'production' && token.startsWith('dev:')) {
        uid = token.split('dev:')[1] || null;
        console.log('Using dev token for WebSocket upgrade. UID:', uid ? uid.substring(0, 12) : 'null');
      } else {
        uid = await verifyWebSocketToken(token);
      }
    } catch (err) {
      console.error('Error while verifying WebSocket token during upgrade:', err);
      uid = null;
    }

    if (!uid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, uid);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running and listening on 0.0.0.0:${PORT}`);
  });
}

startServer();

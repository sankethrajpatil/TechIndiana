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
import dotenv from 'dotenv';

dotenv.config();

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
const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

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
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin initialized successfully.');
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
  const PORT = 3000;

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

  const presentStudyPlanTool: FunctionDeclaration = {
    name: "present_study_plan",
    description: "Presents a generated study plan to the user on their screen.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        plan_title: { type: Type.STRING, description: "The title of the study plan." },
        action_items: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "A list of specific steps or topics to study." 
        }
      },
      required: ["plan_title", "action_items"]
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
    console.log(`Client connected: ${uid}`);
    
    let geminiSession: any = null;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    try {
      // 1. Query MongoDB for user profile (if connected)
      let profile = null;
      if (isMongoConnected) {
        profile = await UserProfile.findOne({ firebaseUid: uid });
      }
      
      // 2. Connect to Gemini Live API
      let systemInstruction = `You are the official voice-based academic advisor for TechIndiana. Your tone is upbeat, technical, encouraging, and welcoming.
      
      Once you understand the user's roadblocks and expectations, generate a detailed study plan. To show this plan to the user, you MUST invoke the 'present_study_plan' tool. Tell the user to review the plan on their screen and save it if they like it.
      
      If you identify the user's persona (Student, Parent, Adult Learner, Employer, or Counselor), you MUST trigger a UI redirect using the 'route_user_to_persona_page' tool with the corresponding route:
      - Student -> /students
      - Parent -> /parents
      - Adult Learner -> /adult-learners
      - Employer -> /employers
      - Counselor -> /counselors

      As the official TechIndiana advisor, you can also schedule meetings:
      - For Employers: Use 'schedule_partnership_call' to book a talent pipeline call.
      - For Parents/Students: Use 'schedule_advisor_call' to discuss apprenticeship pathways.
      Inform the user once the booking is successful and show them the confirmation on their screen.

      You can also deliver resources:
      - Use 'send_counselor_toolkit' for counselors.
      - Use 'send_parent_guide' for parents.

      If a Parent asks how this program compares to college or expresses concern about their child falling behind, you MUST invoke the 'show_pathway_comparison' tool. Generate 3 to 4 comparison points (Cost, Duration, Experience, Outcomes). Tell the parent to look at their screen for the side-by-side breakdown.
      
      For Adult Learners, you can assess their skills:
      - Use 'assess_adult_skills' to map their experience to an IT pathway.

      As the conversation progresses, periodically summarize the student's progress using the 'save_conversation_summary' tool. This is crucial for their end-of-session report.
      
      Keep your responses concise and conversational.`;

      if (profile) {
        if (profile.conversation_history && profile.conversation_history.length > 0) {
          const historyText = profile.conversation_history
            .slice(-10)
            .map(m => `${m.role === 'user' ? 'Student' : 'Advisor'}: ${m.content}`)
            .join('\n');
          systemInstruction += `\n\nPast Conversation Context (Last 10 messages):\n${historyText}`;
        }

        if (profile.study_plan) {
          systemInstruction += `\n\nUser Context: Existing Study Plan: ${profile.study_plan}. 
          Welcome the user back, briefly summarize their current plan, and ask them how their progress is going today. Do not generate a new plan unless they ask to change it.`;
        } else if (!profile.background || !profile.expectations) {
          systemInstruction += `\n\nWarmly greet the user, verbally ask for their name, background, and expectations. Once they provide these details, call the 'save_user_profile' tool.`;
        } else {
          systemInstruction += `\n\nWelcome back, ${profile.name || 'Student'}! Reference their background in ${profile.background} and ask how you can help them study today. DO NOT ask for their basic details again.`;
        }
      }

      console.log(`Initializing Gemini with API Key start: ${process.env.GEMINI_API_KEY?.substring(0, 8)}...`);
      
      try {
        geminiSession = await ai.live.connect({
          model: 'models/gemini-2.0-flash-exp',
          config: {
            responseModalities: ['audio'],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: [{ 
              functionDeclarations: [
                saveUserProfileTool, 
                presentStudyPlanTool, 
                saveConversationSummaryTool, 
                routeUserToPersonaPageTool,
                schedulePartnershipCallTool,
                scheduleAdvisorCallTool,
                sendCounselorToolkitTool,
                sendParentGuideTool,
                assessAdultSkillsTool,
                showPathwayComparisonTool
              ] 
            }],
          }
        });

        // Handle messages from the Gemini SDK
        (geminiSession as any).callbacks = {
          onopen: () => {
            console.log('Gemini session opened successfully.');
          },
          onmessage: async (msg: any) => {
              // Handle Transcriptions and save to history
              if (msg.serverContent?.modelTurn?.parts) {
                const textPart = msg.serverContent.modelTurn.parts.find((p: any) => p.text);
                if (textPart && textPart.text && isMongoConnected) {
                  await UserProfile.findOneAndUpdate(
                    { firebaseUid: uid },
                    { $push: { conversation_history: { role: 'model', content: textPart.text, timestamp: new Date() } } }
                  );
                }
              }

              // Use the correct property for user transcription if available
              const userText = msg.inputAudioTranscription?.text;
              if (userText && isMongoConnected) {
                await UserProfile.findOneAndUpdate(
                  { firebaseUid: uid },
                  { $push: { conversation_history: { role: 'user', content: userText, timestamp: new Date() } } }
                );
              }

              // Forward audio from Gemini to Client
              if (msg.serverContent?.modelTurn?.parts) {
                for (const part of msg.serverContent.modelTurn.parts) {
                  if (part.inlineData) {
                    ws.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
                  }
                }
              }

              // Handle Tool Calls
              if (msg.toolCall) {
                for (const call of msg.toolCall.functionCalls) {
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
                      
                      // Send response back to Gemini
                      geminiSession.sendToolResponse({
                        functionResponses: [{
                          name: "save_user_profile",
                          response: { success: true },
                          id: call.id
                        }]
                      });
                      
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
                    console.log(`Tool call: present_study_plan for ${uid}`, call.args);
                    
                    // Forward to React client
                    ws.send(JSON.stringify({ 
                      type: 'study_plan_preview', 
                      plan: call.args 
                    }));

                    // Respond to Gemini
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "present_study_plan",
                        response: { success: true },
                        id: call.id
                      }]
                    });
                  } else if (call.name === "save_conversation_summary") {
                    console.log(`Tool call: save_conversation_summary for ${uid}`, call.args);
                    
                    if (!isMongoConnected) {
                      geminiSession.sendToolResponse({
                        functionResponses: [{
                          name: "save_conversation_summary",
                          response: { success: false, error: 'Database not configured.' },
                          id: call.id
                        }]
                      });
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
                    } catch (err) {
                      console.error('Error in save_conversation_summary:', err);
                      geminiSession.sendToolResponse({
                        functionResponses: [{
                          name: "save_conversation_summary",
                          response: { success: false, error: 'Database error' },
                          id: call.id
                        }]
                      });
                    }
                  } else if (call.name === "route_user_to_persona_page") {
                    console.log(`Tool call: route_user_to_persona_page for ${uid}`, call.args);
                    
                    // Forward to React client
                    ws.send(JSON.stringify({ 
                      type: 'ui_redirect', 
                      route: call.args.target_route 
                    }));
                    
                    // Respond to Gemini
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "route_user_to_persona_page",
                        response: { result: "Successfully routed user" },
                        id: call.id
                      }]
                    });
                  } else if (call.name === "schedule_partnership_call") {
                    console.log(`Tool call: schedule_partnership_call for ${uid}`, call.args);
                    
                    const eventLink = await createCalendarEvent(
                      `Partnership Call: ${call.args.company_name} x TechIndiana`,
                      `Partnership discussion with ${call.args.contact_name} from ${call.args.company_name}.`,
                      call.args.preferred_date,
                      call.args.preferred_time
                    );

                    // Forward to React client
                    ws.send(JSON.stringify({ 
                      type: 'meeting_scheduled', 
                      event_link: eventLink 
                    }));

                    // Respond to Gemini
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "schedule_partnership_call",
                        response: { result: `Meeting successfully booked for ${call.args.preferred_time}.` },
                        id: call.id
                      }]
                    });
                  } else if (call.name === "schedule_advisor_call") {
                    console.log(`Tool call: schedule_advisor_call for ${uid}`, call.args);
                    
                    const eventLink = await createCalendarEvent(
                      `Advisor Call: ${call.args.attendee_name}`,
                      `Topic: ${call.args.topic}`,
                      call.args.preferred_date,
                      call.args.preferred_time
                    );

                    // Forward to React client
                    ws.send(JSON.stringify({ 
                      type: 'meeting_scheduled', 
                      event_link: eventLink 
                    }));

                    // Respond to Gemini
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "schedule_advisor_call",
                        response: { result: `Meeting successfully booked for ${call.args.preferred_time}.` },
                        id: call.id
                      }]
                    });
                  } else if (call.name === "send_counselor_toolkit" || call.name === "send_parent_guide") {
                    console.log(`Tool call: ${call.name} for ${uid}`);
                    
                    const resourceType = call.name === "send_counselor_toolkit" ? "COUNSELOR_TOOLKIT" : "PARENT_GUIDE";
                    let userEmail = "";

                    if (isMongoConnected) {
                      const userDoc = await UserProfile.findOne({ firebaseUid: uid });
                      if (userDoc && (userDoc as any).email) {
                        userEmail = (userDoc as any).email;
                      }
                    }

                    // If email not in DB, we'd ideally ask, but for now we attempt with known email or log
                    if (userEmail) {
                      await sendResourceEmail(userEmail, resourceType);
                      
                      geminiSession.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          response: { result: `${call.name === "send_counselor_toolkit" ? "Counselor Toolkit" : "Parent Guide"} successfully emailed to ${userEmail}.` },
                          id: call.id
                        }]
                      });
                    } else {
                      geminiSession.sendToolResponse({
                        functionResponses: [{
                          name: call.name,
                          response: { result: "Failed to send email: User email not found in profile." },
                          id: call.id
                        }]
                      });
                    }
                  } else if (call.name === "assess_adult_skills") {
                    console.log(`Tool call: assess_adult_skills for ${uid}`, call.args);
                    
                    const { current_role, past_experience } = call.args;
                    let recommended_pathway = "General IT Support / Cloud Operations";
                    let estimated_timeline = "18-24 months";

                    const exp = (current_role + " " + past_experience).toLowerCase();

                    if (exp.includes("logistics") || exp.includes("warehouse") || exp.includes("supply chain")) {
                      recommended_pathway = "Supply Chain IT / Data Analytics";
                      estimated_timeline = "12-18 months";
                    } else if (exp.includes("retail") || exp.includes("service") || exp.includes("customer")) {
                      recommended_pathway = "IT Help Desk / Customer Success Tech";
                      estimated_timeline = "12 months";
                    } else if (exp.includes("construction") || exp.includes("manufacturing") || exp.includes("factory")) {
                      recommended_pathway = "Industrial IoT / Smart Manufacturing Tech";
                      estimated_timeline = "15-18 months";
                    }

                    if (isMongoConnected) {
                      await UserProfile.findOneAndUpdate(
                        { firebaseUid: uid },
                        { 
                          assessed_pathway: recommended_pathway,
                          assessed_timeline: estimated_timeline,
                          skills_assessment_raw: { current_role, past_experience }
                        },
                        { upsert: true }
                      );
                    }

                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "assess_adult_skills",
                        response: { 
                          recommended_pathway, 
                          estimated_timeline,
                          result: `Successfully mapped to ${recommended_pathway} with an estimated ${estimated_timeline} timeline.` 
                        },
                        id: call.id
                      }]
                    });
                  } else if (call.name === "show_pathway_comparison") {
                    console.log(`Tool call: show_pathway_comparison for ${uid}`, call.args);
                    
                    // Forward to React client
                    ws.send(JSON.stringify({ 
                      type: 'render_comparison', 
                      data: call.args.comparison_points 
                    }));

                    // Respond to Gemini
                    geminiSession.sendToolResponse({
                      functionResponses: [{
                        name: "show_pathway_comparison",
                        response: { result: "Comparison table successfully rendered on user screen." },
                        id: call.id
                      }]
                    });
                  }
                }
              }
          },
          onclose: () => {
            console.log('Gemini session closed.');
            ws.close();
          },
          onerror: (err: any) => {
            console.error('Gemini error:', err);
            ws.send(JSON.stringify({ type: 'error', message: 'Gemini connection error.' }));
          }
        };
      } catch (err: any) {
        console.error('CRITICAL: Gemini connection failed during connect():', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Gemini service failed to start.' }));
        ws.close();
        return;
      }

      // Handle messages from Client
      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'audio' && geminiSession) {
            const base64Audio = message.data.includes(',') ? message.data.split(',')[1] : message.data;
            geminiSession.sendRealtimeInput({
              audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' }
            });
          }
        } catch (err) {
          // Assume raw audio if not JSON
          if (geminiSession) {
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

  // Upgrade HTTP to WebSocket
  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    if (url.pathname === '/api/voice-agent') {
      const token = url.searchParams.get('token');
      console.log('WebSocket upgrade request token:', token ? `${token.substring(0, 60)}${token.length > 60 ? '...' : ''}` : '<<none>>');

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Development shortcut: accept dev:<uid> tokens locally without calling Firebase
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
    } else {
      socket.destroy();
    }
  });

  // --- Vite Middleware for Frontend ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import UserProfile from './src/models/UserProfile';
import { firebaseAuthMiddleware, verifyWebSocketToken } from './src/middleware/auth';
import sessionRouter from './server/routes/session';
import dotenv from 'dotenv';

dotenv.config();

// --- Firebase Admin Initialization ---
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    let rawValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
    
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
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', error);
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.error('Raw value length:', process.env.FIREBASE_SERVICE_ACCOUNT_JSON.length);
      console.error('Value starts with:', process.env.FIREBASE_SERVICE_ACCOUNT_JSON.substring(0, 50));
    }
  }
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT_JSON not found. Auth middleware will fail.');
}

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI;
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

      geminiSession = await ai.live.connect({
        model: 'gemini-live-2.5-flash-native-audio',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations: [saveUserProfileTool, presentStudyPlanTool, saveConversationSummaryTool, routeUserToPersonaPageTool] }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
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
                }
              }
            }
          },
          onclose: () => {
            console.log('Gemini session closed.');
            ws.close();
          },
          onerror: (err) => {
            console.error('Gemini error:', err);
            ws.send(JSON.stringify({ type: 'error', message: 'Gemini connection error.' }));
          }
        }
      });

      // Handle messages from Client
      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'audio' && geminiSession) {
            geminiSession.sendRealtimeInput({
              audio: { data: message.data, mimeType: 'audio/pcm;rate=16000' }
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
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to initialize voice agent.' }));
      ws.close();
    }
  });

  // Upgrade HTTP to WebSocket
  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    if (url.pathname === '/api/voice-agent') {
      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const uid = await verifyWebSocketToken(token);
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

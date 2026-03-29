const jwt = require('jsonwebtoken');
const User = require('./models/User');
const UserProfile = require('./models/UserProfile');
const { GoogleGenerativeAI } = require('@google/genai');
const WebSocket = require('ws');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function setupVoiceAgentServer(server) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/api/voice-agent') {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    }
  });

  wss.on('connection', async (ws, req) => {
    try {
      // 1. Authenticate user via JWT
      const token = req.headers['sec-websocket-protocol'];
      if (!token) return ws.close();
      let payload;
      try {
        payload = jwt.verify(token, JWT_SECRET);
      } catch {
        ws.close();
        return;
      }
      const userId = payload.userId;

      // 2. Query UserProfile
      let profile = await UserProfile.findOne({ user: userId });
      let systemInstruction;
      if (!profile) {
        systemInstruction = `User Context: None. Greet the user, ask for their name, background, and expectations from TechIndiana, then trigger the save_user_profile tool.`;
      } else {
        systemInstruction = `User Context: ${JSON.stringify(profile)}. Welcome them back by name, reference their background/study plan, and ask what they want to focus on today. Do not ask for their basic details again.`;
      }

      // 3. Connect to Gemini 3.1 Flash Live API
      const genai = new GoogleGenerativeAI(GEMINI_API_KEY);
      const geminiSocket = await genai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          systemInstruction,
          tools: [{
            functionDeclarations: [{
              name: 'save_user_profile',
              description: 'Saves the user profile to MongoDB.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  background: { type: 'STRING' },
                  expectations: { type: 'STRING' }
                },
                required: ['name', 'background', 'expectations']
              }
            }]
          }]
        },
        callbacks: {
          onopen: () => ws.send(JSON.stringify({ type: 'ready' })),
          onmessage: async msg => {
            ws.send(JSON.stringify({ type: 'ai', data: msg }));
            if (msg.toolCall) {
              for (const call of msg.toolCall.functionCalls) {
                if (call.name === 'save_user_profile') {
                  await UserProfile.findOneAndUpdate(
                    { user: userId },
                    {
                      user: userId,
                      name: call.args.name,
                      background: call.args.background,
                      expectations: call.args.expectations
                    },
                    { upsert: true }
                  );
                  geminiSocket.sendToolResponse({
                    functionResponses: [{
                      name: 'save_user_profile',
                      response: { success: true },
                      id: call.id
                    }]
                  });
                }
              }
            }
          },
          onclose: () => ws.close(),
          onerror: () => ws.close()
        }
      });

      ws.on('message', data => {
        geminiSocket.sendRealtimeInput(JSON.parse(data));
      });

      ws.on('close', () => geminiSocket.close());
    } catch (err) {
      ws.close();
    }
  });
}

module.exports = setupVoiceAgentServer;

const { WebSocketServer } = require('ws');
const admin = require('./firebaseAdmin');
const UserProfile = require('./models/UserProfile');
const { GoogleGenAI, Modality, Type } = require('@google/genai');

const wss = new WebSocketServer({ noServer: true });

const saveUserProfileTool = {
  name: 'save_user_profile',
  description: 'Save user profile to database',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      background: { type: Type.STRING },
      expectations: { type: Type.STRING }
    },
    required: ['name', 'background', 'expectations']
  }
};

function setupVoiceAgent(server) {
  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/api/voice-agent')) {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    }
  });

  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const idToken = url.searchParams.get('token');
      if (!idToken) return ws.close();

      const decoded = await admin.auth().verifyIdToken(idToken);
      const firebaseUid = decoded.uid;

      let profile = await UserProfile.findOne({ firebaseUid });
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const systemInstruction = profile
        ? `Welcome back, ${profile.name}! Your background: ${profile.background}. What do you want to study today?`
        : `Welcome to TechIndiana! Please tell me your name, background, and expectations.`;

      const session = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations: [saveUserProfileTool] }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => ws.send(JSON.stringify({ type: 'ai', text: 'Connected to Gemini.' })),
          onmessage: async (msg) => {
            if (msg.serverContent?.interrupted) {
              ws.send(JSON.stringify({ type: 'barge-in' }));
            }
            if (msg.toolCall) {
              for (const call of msg.toolCall.functionCalls) {
                if (call.name === 'save_user_profile') {
                  const { name, background, expectations } = call.args;
                  await UserProfile.findOneAndUpdate(
                    { firebaseUid },
                    { name, background, expectations },
                    { upsert: true }
                  );
                  session.sendToolResponse({
                    functionResponses: [{
                      name: 'save_user_profile',
                      response: { success: true },
                      id: call.id
                    }]
                  });
                }
              }
            }
            // Handle AI text/audio responses as needed
          }
        }
      });

      ws.on('message', (data) => {
        const { audio } = JSON.parse(data);
        if (audio) {
          session.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: audio }]);
        }
      });

      ws.on('close', () => session.close());
    } catch (err) {
      ws.close();
    }
  });
}

module.exports = { setupVoiceAgent };


import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { Mic, MicOff, LogIn, LogOut, BookOpen, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ProgramsPage from './components/ProgramsPage';
import PersonaPage from './components/PersonaPage';

// --- Audio Helpers ---
const SAMPLE_RATE = 16000;

function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Function Declarations ---
const saveUserDetailsDeclaration: FunctionDeclaration = {
  name: "save_user_details",
  description: "Saves the student's basic details to the TechIndiana database.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The student's full name." },
      grade: { type: Type.STRING, description: "The student's grade or level." },
      areaOfInterest: { type: Type.STRING, description: "The student's primary area of technical interest." }
    },
    required: ["name", "grade", "areaOfInterest"]
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // --- Data integration states (connect frontend to new API endpoints)
  const [personas, setPersonas] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [personaBundle, setPersonaBundle] = useState<any | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(false);
  

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);


  // --- Username/Password Auth ---
  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (data.success) {
        setUser({ username: loginForm.username });
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Login failed');
    }
    setLoginLoading(false);
  };

  const handleRegister = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      });
      const data = await res.json();
      if (data.success) {
        setUser({ username: registerForm.username });
      } else {
        setLoginError(data.error || 'Registration failed');
      }
    } catch (err) {
      setLoginError('Registration failed');
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    setUser(null);
    await stopConversation();
  };

  // --- Audio Playback ---
  const playNextInQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || !audioContextRef.current) return;

    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  }, []);

  const queueAudio = useCallback(async (base64Data: string) => {
    if (!audioContextRef.current) return;
    const arrayBuffer = base64ToArrayBuffer(base64Data);
    // Live API returns raw PCM 16-bit 24kHz (usually)
    // But we'll assume 24kHz for output as per standard Live API behavior
    const float32Data = new Float32Array(arrayBuffer.byteLength / 2);
    const view = new DataView(arrayBuffer);
    for (let i = 0; i < float32Data.length; i++) {
      float32Data[i] = view.getInt16(i * 2, true) / 0x8000;
    }

    const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);
    audioQueueRef.current.push(audioBuffer);
    playNextInQueue();
  }, [playNextInQueue]);

  // --- Live API Connection ---
  const startConversation = async () => {
    if (!user) return;
    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          systemInstruction: `You are the official voice-based academic advisor for TechIndiana. Your tone is upbeat, technical, encouraging, and welcoming.
          
          Follow these phases in order:
          Phase 1: Onboarding. Warmly greet the user to TechIndiana and ask for their Name, Grade or Level, and Area of Interest. Wait for them to answer. Once they provide this, call the 'save_user_details' function.
          Phase 2: Discovery. After saving details, ask about their specific concerns, technical roadblocks, and expectations from the TechIndiana study program. Listen and ask short follow-up questions.
          Phase 3: Action & Study Plan. Synthesize their roadblocks and expectations into a personalized study plan. Present it step-by-step. Ask if it sounds good or needs adjustments.
          
          Guardrails:
          - Steer non-tech/non-academic topics back to TechIndiana goals.
          - Speak naturally and conversationally. Keep responses concise.
          - If the user interrupts, stop speaking and listen.`,
          tools: [{ functionDeclarations: [saveUserDetailsDeclaration] }],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            startMic();
          },
          onmessage: async (msg) => {
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData) {
                  queueAudio(part.inlineData.data);
                }
                if (part.text) {
                  setTranscript(prev => [...prev, `Advisor: ${part.text}`]);
                  // Check if this looks like a study plan
                  if (part.text.toLowerCase().includes("study plan") || part.text.toLowerCase().includes("step 1")) {
                    setStudyPlan(part.text);
                  }
                }
              }
            }

            if (msg.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }

            if (msg.toolCall) {
              for (const call of msg.toolCall.functionCalls) {
                if (call.name === "save_user_details") {
                  try {
                    const response = await fetch(`/api/users/${user.uid}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(call.args)
                    });
                    const result = await response.json();
                    if (result.success) {
                      sessionRef.current?.sendToolResponse({
                        functionResponses: [{
                          name: "save_user_details",
                          response: { success: true },
                          id: call.id
                        }]
                      });
                      setTranscript(prev => [...prev, "System: Details saved successfully!"]);
                    } else {
                      throw new Error(result.error || 'Unknown error');
                    }
                  } catch (err) {
                    console.error("Error saving details:", err);
                    sessionRef.current?.sendToolResponse({
                      functionResponses: [{
                        name: "save_user_details",
                        response: { success: false, error: "Database error" },
                        id: call.id
                      }]
                    });
                  }
                }
              }
            }
          },
          onclose: async () => {
            setIsConnected(false);
            await stopMic();
          },
          onerror: async (err) => {
            console.error("Live API Error:", err);
            setError("Connection error. Please try again.");
            await stopConversation();
          }
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error(err);
      setIsConnecting(false);
      setError("Failed to connect to the advisor.");
    }
  };

  const stopConversation = async () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setIsConnected(false);
    await stopMic();
  };

  const startMic = async () => {
    try {
      if (audioContextRef.current) {
        await stopMic();
      }
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBuffer = floatTo16BitPCM(inputData);
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmBuffer)));
        
        sessionRef.current?.sendRealtimeInput({
          audio: { data: base64Data, mimeType: `audio/pcm;rate=${SAMPLE_RATE}` }
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error:", err);
      setError("Could not access microphone.");
    }
  };

  const stopMic = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch (err) {
        console.error("Error closing AudioContext:", err);
      }
    }
    audioContextRef.current = null;
    setIsRecording(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-600/20">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">TechIndiana</h1>
            <p className="text-[10px] uppercase tracking-widest text-orange-500 font-semibold">Academic Advisor</p>
          </div>
        </div>
        
        {user ? (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium">{user.username}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-full transition-colors group"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-white/60 group-hover:text-white" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-64">
            {isRegistering ? (
              <>
                <input
                  className="px-3 py-2 rounded bg-white/10 text-white"
                  placeholder="Username"
                  value={registerForm.username}
                  onChange={e => setRegisterForm(f => ({ ...f, username: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded bg-white/10 text-white"
                  placeholder="Password"
                  type="password"
                  value={registerForm.password}
                  onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
                />
                <button
                  onClick={handleRegister}
                  className="bg-white text-black px-4 py-2 rounded-full font-semibold hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                  disabled={loginLoading}
                >
                  {loginLoading ? 'Registering...' : 'Register'}
                </button>
                <button
                  onClick={() => setIsRegistering(false)}
                  className="text-xs text-orange-400 hover:underline"
                >
                  Already have an account? Login
                </button>
              </>
            ) : (
              <>
                <input
                  className="px-3 py-2 rounded bg-white/10 text-white"
                  placeholder="Username"
                  value={loginForm.username}
                  onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded bg-white/10 text-white"
                  placeholder="Password"
                  type="password"
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                />
                <button
                  onClick={handleLogin}
                  className="bg-white text-black px-4 py-2 rounded-full font-semibold hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                  disabled={loginLoading}
                >
                  {loginLoading ? 'Logging in...' : 'Login'}
                </button>
                <button
                  onClick={() => setIsRegistering(true)}
                  className="text-xs text-orange-400 hover:underline"
                >
                  New user? Register
                </button>
              </>
            )}
            {loginError && <div className="text-red-400 text-xs mt-1">{loginError}</div>}
          </div>
        )}
      </header>

      {/* Data panel removed — kept background fetching for personas/programs to surface after AI suggests a study plan */}

      <main className="max-w-4xl mx-auto px-6 py-12">
        {!user ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <h2 className="text-2xl font-bold mb-4">Welcome to TechIndiana</h2>
            <p className="text-white/60 mb-2">Login or register to start your session with the AI advisor.</p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Advisor Interaction Area */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden min-h-[400px] flex flex-col justify-center items-center text-center">
                <AnimatePresence mode="wait">
                  {!isConnected ? (
                    <motion.div 
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mx-auto">
                        <Mic className="w-10 h-10 text-white/40" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold">Ready to talk?</h3>
                        <p className="text-white/40">Start a voice session with your advisor.</p>
                      </div>
                      <button
                        onClick={startConversation}
                        disabled={isConnecting}
                        className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-orange-500 hover:text-white transition-all flex items-center gap-2 mx-auto disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Mic className="w-5 h-5" />
                            Start Session
                          </>
                        )}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-8 w-full"
                    >
                      {/* Voice Visualizer Placeholder */}
                      <div className="flex items-center justify-center gap-1 h-20">
                        {[...Array(12)].map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ 
                              height: isRecording ? [20, 60, 20] : 20,
                              opacity: isRecording ? [0.3, 1, 0.3] : 0.3
                            }}
                            transition={{ 
                              repeat: Infinity, 
                              duration: 0.8, 
                              delay: i * 0.05 
                            }}
                            className="w-2 bg-orange-500 rounded-full"
                          />
                        ))}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 text-orange-500">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                          </span>
                          <span className="text-xs font-bold uppercase tracking-widest">Live Session Active</span>
                        </div>
                        <p className="text-xl font-medium px-4">Your advisor is listening...</p>
                      </div>

                      <button
                        onClick={stopConversation}
                        className="bg-red-500/10 text-red-500 border border-red-500/20 px-6 py-2 rounded-full font-bold hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 mx-auto"
                      >
                        <MicOff className="w-4 h-4" />
                        End Session
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <div className="absolute bottom-4 left-4 right-4 bg-red-500/20 border border-red-500/40 p-3 rounded-xl text-red-200 text-sm">
                    {error}
                  </div>
                )}
              </div>

              {/* Transcript Preview */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">Conversation Log</h4>
                <div className="max-h-[200px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {transcript.length === 0 ? (
                    <p className="text-white/20 italic text-sm">No messages yet...</p>
                  ) : (
                    transcript.map((line, i) => (
                      <div key={i} className={`text-sm ${line.startsWith('Advisor') ? 'text-orange-200' : 'text-white/60'}`}>
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Study Plan / Info Area */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-orange-600 rounded-3xl p-8 space-y-6 shadow-2xl shadow-orange-600/20">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold">Study Plan</h3>
                </div>

                {studyPlan ? (
                  <div className="space-y-4">
                    <div className="bg-black/20 rounded-2xl p-6 text-sm leading-relaxed whitespace-pre-wrap">
                      {studyPlan}
                    </div>
                    <div className="flex items-center gap-2 text-white/80 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Generated by TechIndiana Advisor
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-10 text-center">
                    <p className="text-white/70 text-sm">
                      Complete the onboarding and discovery phases with your advisor to generate your personalized study plan.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
                <h4 className="font-bold">Advisor Tips</h4>
                <ul className="space-y-3 text-sm text-white/60">
                  <li className="flex gap-3">
                    <span className="text-orange-500 font-bold">01</span>
                    Be specific about the technical topics you're struggling with.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-orange-500 font-bold">02</span>
                    Mention your preferred learning style (videos, docs, hands-on).
                  </li>
                  <li className="flex gap-3">
                    <span className="text-orange-500 font-bold">03</span>
                    Don't hesitate to interrupt if you have a quick question!
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Once the AI generates a studyPlan, surface program suggestions and persona bundle below the study plan */}
          {studyPlan && (
            <div className="mt-8">
              <ProgramsPage programs={programs} />
              <div className="mt-6">
                <PersonaPage personaBundle={personaBundle} />
              </div>
            </div>
          )}
          </>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

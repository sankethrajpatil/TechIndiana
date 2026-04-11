import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Mic, MicOff, LogIn, LogOut, BookOpen, Sparkles, Loader2, CheckCircle2, Users, GraduationCap, Briefcase, UserCircle, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BrowserRouter, Routes, Route, useNavigate, Link } from 'react-router-dom';
import UserProfilePage from './UserProfilePage';

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

// --- Persona Landing Pages ---
const StudentPage = () => (
  <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-12 flex flex-col items-center justify-center text-center space-y-6">
    <GraduationCap className="w-20 h-20 text-blue-600" />
    <h2 className="text-5xl font-black tracking-tighter uppercase drop-shadow-sm">Student Portal</h2>
    <p className="text-[var(--text-secondary)] max-w-xl text-lg">Your personalized path into Indiana's tech ecosystem.</p>
    <Link to="/" className="text-blue-600 hover:text-blue-700 font-bold underline-offset-4 hover:underline transition-all">Back to Advisor</Link>
  </div>
);

const ParentPage = () => (
  <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-12 flex flex-col items-center justify-center text-center space-y-6">
    <Users className="w-20 h-20 text-blue-600" />
    <h2 className="text-5xl font-black tracking-tighter uppercase drop-shadow-sm">Parent Resources</h2>
    <p className="text-[var(--text-secondary)] max-w-xl text-lg">Everything you need to support your child's career.</p>
    <Link to="/" className="text-blue-600 hover:text-blue-700 font-bold underline-offset-4 hover:underline transition-all">Back to Advisor</Link>
  </div>
);

const AdultLearnerPage = () => (
  <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-12 flex flex-col items-center justify-center text-center space-y-6">
    <UserCircle className="w-20 h-20 text-blue-600" />
    <h2 className="text-5xl font-black tracking-tighter uppercase drop-shadow-sm">Adult Learner Hub</h2>
    <p className="text-[var(--text-secondary)] max-w-xl text-lg">Reskill for the future of work.</p>
    <Link to="/" className="text-blue-600 hover:text-blue-700 font-bold underline-offset-4 hover:underline transition-all">Back to Advisor</Link>
  </div>
);

const EmployerPage = () => (
  <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-12 flex flex-col items-center justify-center text-center space-y-6">
    <Briefcase className="w-20 h-20 text-blue-600" />
    <h2 className="text-5xl font-black tracking-tighter uppercase drop-shadow-sm">Employer Partners</h2>
    <p className="text-[var(--text-secondary)] max-w-xl text-lg">Talent pipelines built for Indiana industry.</p>
    <Link to="/" className="text-blue-600 hover:text-blue-700 font-bold underline-offset-4 hover:underline transition-all">Back to Advisor</Link>
  </div>
);

const CounselorPage = () => (
  <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-12 flex flex-col items-center justify-center text-center space-y-6">
    <BookOpen className="w-20 h-20 text-blue-600" />
    <h2 className="text-5xl font-black tracking-tighter uppercase drop-shadow-sm">Counselor Toolkit</h2>
    <p className="text-[var(--text-secondary)] max-w-xl text-lg">Guide students toward high-demand tech careers.</p>
    <Link to="/" className="text-blue-600 hover:text-blue-700 font-bold underline-offset-4 hover:underline transition-all">Back to Advisor</Link>
  </div>
);

function VoiceAgent() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduledMeetingLink, setScheduledMeetingLink] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<{ metric: string, apprenticeship_value: string, college_value: string }[] | null>(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  // --- Theme Update ---
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  // Turn-taking: true while the AI is streaming audio — mic is muted during this window
  const isAISpeakingRef = useRef(false);

  const [studyPlanPreview, setStudyPlanPreview] = useState<{ plan_title: string, action_items: string[] } | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch existing profile to see if there's a study plan
        try {
          const docRef = doc(db, "users", u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.study_plan) {
              setStudyPlan(data.study_plan);
            }
          }
        } catch (err) {
          console.error("Error fetching profile:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSavePlan = async () => {
    if (!user || !studyPlanPreview) return;
    setIsSavingPlan(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/profile/plan', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ study_plan: studyPlanPreview })
      });
      if (response.ok) {
        setStudyPlan(JSON.stringify(studyPlanPreview));
        setStudyPlanPreview(null);
        alert("Study plan saved successfully!");
      } else {
        setError("Failed to save study plan.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save study plan.");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError("Login failed. Please try again.");
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    await stopConversation();
  };

  const handleEndSession = async () => {
    if (!user) return;
    setIsEndingSession(true);
    setError(null);

    try {
      // 1. Stop the conversation (closes WebSocket and Mic)
      await stopConversation();

      // 2. Call the backend to send the email
      const token = await user.getIdToken();
      const response = await fetch('/api/session/end', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert("Session ended. Your study plan and conversation summary have been emailed to you!");
        // Optionally redirect or refresh the dashboard
        window.location.reload(); 
      } else {
        const data = await response.json();
        setError(data.error || "Failed to send session summary email.");
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred while ending the session.");
    } finally {
      setIsEndingSession(false);
    }
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

  // --- Live API Connection (Updated for Backend WebSocket) ---
  const startConversation = async () => {
    if (!user) return;
    setIsConnecting(true);
    setError(null);

    try {
      // Use a development fallback token when running in Vite dev mode and Firebase Admin
      // is not configured on the server. The server accepts tokens of the form "dev:<uid>"
      // only when NODE_ENV !== 'production'. This avoids requiring Firebase credentials
      // for local testing.
      let token: string;
      // Vite exposes import.meta.env.DEV
      const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV;
      if (isDev) {
        token = `dev:${user.uid}`;
      } else {
        token = await user.getIdToken();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In production, we must use the service domain name exactly, not window.location.host
      // which might include non-standard ports or subdomains during proxying.
      const host = window.location.hostname;
      const wsUrl = `${protocol}//${host}/api/voice-agent?token=${token}`;
      
      console.log(`[Flow Check] Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log("[Flow Check] WebSocket connected successfully.");
        setIsConnected(true);
        setIsConnecting(false);
        startMic();
      };

      ws.onclose = (event) => {
        console.warn(`[Flow Check] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        setIsConnected(false);
        setIsRecording(false);
        isAISpeakingRef.current = false;  // always unmute on disconnect
        // Stop stream tracks and disconnect processor, but do NOT close the AudioContext here.
        // Closing it here creates a race condition: if ws closes while startMic() is awaiting
        // getUserMedia, stopMic() destroys the context and the mic never starts.
        // stopConversation() calls stopMic() explicitly for full cleanup when the user ends the session.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
        }
      };

      ws.onerror = (event) => {
        console.error("[Flow Check] WebSocket error occurred.", event);
        setError("WebSocket connection failed.");
      };

      let geminiAudioChunksReceived = 0;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'audio') {
          geminiAudioChunksReceived++;
          if (geminiAudioChunksReceived % 50 === 1) {
            console.log(`[Phase3 Audio] Gemini audio chunk #${geminiAudioChunksReceived} received from server. Data length: ${msg.data?.length ?? 0}`);
          }
          queueAudio(msg.data);
        } else if (msg.type === 'speech_start') {
          // AI has started speaking — physically disconnect processor + set flag
          isAISpeakingRef.current = true;
          pauseMic();
          console.log('%c[Turn] 🛑 AI speaking → mic disconnected', 'color:orange;font-weight:bold');
        } else if (msg.type === 'speech_end') {
          // AI finished speaking — reconnect processor + clear flag
          isAISpeakingRef.current = false;
          resumeMic();
          console.log('%c[Turn] 🎤 AI done → mic reconnected', 'color:green;font-weight:bold');
        } else if (msg.type === 'transcript') {
          console.log(`[Phase3 Transcript] ${msg.role}: "${msg.text?.substring(0, 80)}"`);
          setTranscript(prev => [...prev.slice(-49), `${msg.role}: ${msg.text}`]);
        } else if (msg.type === 'status') {
          console.log(`[Phase3 Status] ${msg.message}`);
          setTranscript(prev => [...prev.slice(-49), `System: ${msg.message}`]);
        } else if (msg.type === 'error') {
          console.error(`[Phase3 Error] Server reported error: ${msg.message}`);
          setError(msg.message);
        } else if (msg.type === 'study_plan_preview') {
          console.log('[Phase3] Study plan preview received from server.');
          setStudyPlanPreview(msg.plan);
        } else if (msg.type === 'ui_redirect') {
          console.log(`[Phase3] UI redirect triggered to: ${msg.route}`);
          navigate(msg.route);
        } else if (msg.type === 'meeting_scheduled') {
          setScheduledMeetingLink(msg.event_link);
        } else if (msg.type === 'render_comparison') {
          setComparisonData(msg.data);
        } else {
          console.log('[Phase3 WS] Unhandled message type from server:', msg.type);
        }
      };

      // Override sessionRef to use our WebSocket
      sessionRef.current = {
        sendRealtimeInput: (input: any) => {
          if (ws.readyState === WebSocket.OPEN) {
            if (input.audio) {
              // console.log("[WS] Sending audio data to server...");
              ws.send(JSON.stringify({ type: 'audio', data: input.audio.data }));
            }
          } else {
            // Silently drop audio if WS is not open to avoid spamming the console
            // with "WebSocket is already in CLOSING or CLOSED state."
            if (ws.readyState !== WebSocket.CONNECTING) {
               // console.debug("Dropping audio: WebSocket state:", ws.readyState);
            }
          }
        },
        close: () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        }
      };

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
      console.log("startMic triggered. Current context:", audioContextRef.current);
      console.log("Current state:", audioContextRef.current?.state);

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        console.log("Created new AudioContext:", audioContextRef.current);
      }

      const currentContext = audioContextRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (currentContext.state === 'suspended') {
        await currentContext.resume();
      }

      // Critical Check: Did something call stopMic or close the context while getUserMedia was waiting?
      if (!currentContext || currentContext.state === 'closed') {
        console.warn("AudioContext was closed or became null during getUserMedia initialization");
        return;
      }

      const source = currentContext.createMediaStreamSource(stream);
      const processor = currentContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let micChunksSent = 0;
      const actualSampleRate = currentContext.sampleRate;
      console.log(`%c[Phase2 CRITICAL] AudioContext sample rate: ${actualSampleRate}Hz. Expected: ${SAMPLE_RATE}Hz. Match: ${actualSampleRate === SAMPLE_RATE ? '✅ OK' : '❌ MISMATCH - Gemini will fail silently!'}`, actualSampleRate === SAMPLE_RATE ? 'color:green;font-weight:bold' : 'color:red;font-weight:bold;font-size:14px');

      processor.onaudioprocess = (e) => {
        // If the context is closed or closing, stop processing
        if (currentContext.state === 'closed') {
          return;
        }

        // Turn-taking: drop mic audio while AI is speaking to avoid echo/overlap
        if (isAISpeakingRef.current) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        
        // --- DEBUG: VOLUME CHECK ---
        let maxVal = 0;
        for (let i = 0; i < inputData.length; i++) {
          if (Math.abs(inputData[i]) > maxVal) maxVal = Math.abs(inputData[i]);
        }
        if (maxVal > 0.01) {
          console.log(`[Mic Active] Volume: ${maxVal.toFixed(4)} | SampleRate: ${actualSampleRate}Hz`);
        }
        // ---------------------------

        const pcmBuffer = floatTo16BitPCM(inputData);
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmBuffer)));
        
        if (base64Data.length > 0 && sessionRef.current) {
          micChunksSent++;
          if (micChunksSent % 50 === 1) {
            console.log(`[Phase2 Audio] Mic chunk #${micChunksSent} sent → ${base64Data.length} base64 chars | ${pcmBuffer.byteLength} bytes | rate=${actualSampleRate}Hz | 16-bit PCM`);
          }
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: `audio/pcm;rate=${SAMPLE_RATE}` }
          });
        }
      };

      // pauseMic / resumeMic: physically disconnect/reconnect the processor so
      // no audio events fire at all while the AI is speaking (belt-and-suspenders
      // on top of the isAISpeakingRef flag guard in onaudioprocess).
      const pauseMic = () => {
        try { processor.disconnect(); } catch (_) {}
      };
      const resumeMic = () => {
        try { processor.connect(currentContext.destination); } catch (_) {}
      };

      source.connect(processor);
      processor.connect(currentContext.destination);
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
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans selection:bg-ai-purple/30">
      {/* Header */}
      <header className="border-b border-[var(--border-color)] px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-ai-purple rounded-lg flex items-center justify-center shadow-lg shadow-ai-purple/20">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">TechIndiana</h1>
            <p className="text-[10px] uppercase tracking-widest text-ai-purple font-black">Academic Advisor</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="w-5 h-5 text-slate-600" /> : <Sun className="w-5 h-5 text-yellow-400" />}
          </button>

          {user ? (
            <div className="flex items-center gap-4">
              <Link
                to="/profile"
                className="flex flex-col items-end max-w-[11rem] sm:max-w-none min-w-0 group rounded-lg px-1 -mr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
                title="View profile"
              >
                <span className="text-sm font-medium truncate text-right group-hover:text-blue-600 transition-colors">
                  {user.displayName || user.email || 'Profile'}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] hidden sm:block">
                  Student ID: {user.uid.slice(0, 8)}
                </span>
              </Link>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-[var(--bg-secondary)] rounded-full transition-colors group"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full font-semibold hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
            >
              <LogIn className="w-4 h-4" />
              Login with Google
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {!user ? (
          <div className="text-center space-y-8 py-20">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h2 className="text-5xl sm:text-7xl font-black tracking-tighter leading-none">
                YOUR FUTURE <br />
                <span className="text-blue-600">IN TECH</span> STARTS HERE.
              </h2>
              <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
                Connect with our AI Academic Advisor for a personalized study plan tailored to your technical goals at TechIndiana.
              </p>
            </motion.div>
            
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              onClick={handleLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-2xl shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-3 mx-auto"
            >
              Get Started
              <Sparkles className="w-6 h-6" />
            </motion.button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Advisor Interaction Area */}
            <div className="lg:col-span-7 space-y-6">
              <AnimatePresence>
                {comparisonData && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-[var(--bg-secondary)] border border-ai-purple/20 text-[var(--text-primary)] rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden ai-card"
                  >
                    <div className="flex justify-between items-center relative z-10">
                      <div>
                        <h3 className="text-2xl font-black tracking-tight text-ai-purple">Pathway Comparison</h3>
                        <p className="text-[var(--text-secondary)] text-sm">TechIndiana vs. Traditional 4-Year College</p>
                      </div>
                      <button 
                        onClick={() => setComparisonData(null)}
                        className="p-2 hover:bg-ai-purple/10 rounded-full transition-colors"
                      >
                        <LogOut className="w-5 h-5 rotate-180 text-ai-purple" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-4 relative z-10">
                      <div className="col-span-1 text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] pt-4">Metric</div>
                      <div className="col-span-1 text-xs font-bold uppercase tracking-widest text-ai-purple pt-4">Apprenticeship</div>
                      <div className="col-span-1 text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] pt-4">4-Year College</div>
                      
                      {comparisonData.map((row, i) => (
                        <div key={i} className="contents group">
                          <div className="col-span-1 py-3 border-t border-[var(--border-color)] font-bold text-sm flex items-center">{row.metric}</div>
                          <div className="col-span-1 py-3 border-t border-[var(--border-color)] text-sm font-medium bg-ai-purple/10 -mx-2 px-2 rounded-lg">{row.apprenticeship_value}</div>
                          <div className="col-span-1 py-3 border-t border-[var(--border-color)] text-sm text-[var(--text-secondary)]">{row.college_value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="absolute top-0 right-0 w-32 h-32 bg-ai-purple/10 blur-3xl rounded-full -mr-16 -mt-16"></div>
                  </motion.div>
                )}
                
                {scheduledMeetingLink && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="bg-green-600 text-white rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border border-green-500/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold">Meeting Confirmed!</h4>
                        <p className="text-white/80 text-xs">Your call has been added to the calendar.</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <a 
                        href={scheduledMeetingLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="bg-white text-green-700 px-5 py-2 rounded-full font-bold text-sm hover:bg-green-50 transition-all shadow-md"
                      >
                        View Calendar Invite
                      </a>
                      <button 
                        onClick={() => setScheduledMeetingLink(null)}
                        className="text-white/60 hover:text-white text-xs underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-3xl p-8 relative overflow-hidden min-h-[400px] flex flex-col justify-center items-center text-center ai-card">
                <AnimatePresence mode="wait">
                  {!isConnected ? (
                    <motion.div 
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      <div className="w-24 h-24 bg-ai-purple/10 rounded-full flex items-center justify-center mx-auto">
                        <Mic className="w-10 h-10 text-ai-purple/40" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-[var(--text-primary)]">Ready to talk?</h3>
                        <p className="text-[var(--text-secondary)]">Start a voice session with your advisor.</p>
                      </div>
                      <button
                        onClick={startConversation}
                        disabled={isConnecting}
                        className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold hover:bg-blue-700 transition-all flex items-center gap-2 mx-auto disabled:opacity-50"
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
                            className="w-2 bg-ai-purple rounded-full"
                          />
                        ))}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 text-ai-purple">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ai-purple opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-ai-purple"></span>
                          </span>
                          <span className="text-xs font-bold uppercase tracking-widest">Live Session Active</span>
                        </div>
                        <p className="text-xl font-medium px-4 text-[var(--text-primary)]">Your advisor is listening...</p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4">
                        <button
                          onClick={stopConversation}
                          className="bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-color)] px-6 py-2 rounded-full font-bold hover:bg-[var(--bg-secondary)] transition-all flex items-center gap-2 mx-auto"
                        >
                          <MicOff className="w-4 h-4" />
                          Pause Session
                        </button>

                        <button
                          onClick={handleEndSession}
                          disabled={isEndingSession}
                          className="bg-blue-600 text-white px-8 py-2 rounded-full font-bold hover:bg-blue-700 transition-all flex items-center gap-2 mx-auto disabled:opacity-50 shadow-lg shadow-blue-600/20"
                        >
                          {isEndingSession ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          End & Email Summary
                        </button>
                      </div>
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
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-6 space-y-4 ai-card">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Conversation Log</h4>
                <div className="max-h-[200px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {transcript.length === 0 ? (
                    <p className="text-[var(--text-secondary)] italic text-sm">No messages yet...</p>
                  ) : (
                    transcript.map((line, i) => (
                      <div key={i} className={`text-sm ${line.startsWith('Advisor') ? 'text-ai-purple font-medium' : 'text-[var(--text-secondary)]'}`}>
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Study Plan / Info Area */}
            <div className="lg:col-span-5 space-y-6">
              <AnimatePresence>
                {studyPlanPreview && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-[var(--bg-secondary)] border border-ai-purple/20 text-[var(--text-primary)] rounded-3xl p-8 space-y-6 shadow-2xl ai-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2 rounded-xl">
                          <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-xl font-bold">New Plan Preview</h3>
                      </div>
                      <button 
                        onClick={() => setStudyPlanPreview(null)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        Dismiss
                      </button>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-2xl font-black tracking-tight">{studyPlanPreview.plan_title}</h4>
                      <ul className="space-y-2">
                        {studyPlanPreview.action_items.map((item, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-blue-600 font-bold">•</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={handleSavePlan}
                      disabled={isSavingPlan}
                      className="w-full bg-blue-600 text-white py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                    >
                      {isSavingPlan ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      Save This Plan
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="bg-blue-600 rounded-3xl p-8 space-y-6 shadow-2xl shadow-blue-600/20 text-white">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold">Your Study Plan</h3>
                </div>

                {studyPlan ? (
                  <div className="space-y-4">
                    <div className="bg-white/10 rounded-2xl p-6 text-sm leading-relaxed whitespace-pre-wrap">
                      {typeof studyPlan === 'string' && studyPlan.startsWith('{') ? (
                        (() => {
                          try {
                            const parsed = JSON.parse(studyPlan);
                            return (
                              <div className="space-y-4">
                                <h4 className="text-lg font-bold">{parsed.plan_title}</h4>
                                <ul className="space-y-2">
                                  {parsed.action_items.map((item: string, i: number) => (
                                    <li key={i} className="flex gap-2">• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          } catch (e) {
                            return studyPlan;
                          }
                        })()
                      ) : (
                        studyPlan
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-white/80 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Active Plan
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

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-3xl p-8 space-y-4 ai-card">
                <h4 className="font-bold text-[var(--text-primary)]">Advisor Tips</h4>
                <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
                  <li className="flex gap-3">
                    <span className="text-ai-purple font-bold">01</span>
                    Be specific about the technical topics you're struggling with.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-ai-purple font-bold">02</span>
                    Mention your preferred learning style (videos, docs, hands-on).
                  </li>
                  <li className="flex gap-3">
                    <span className="text-ai-purple font-bold">03</span>
                    Don't hesitate to interrupt if you have a quick question!
                  </li>
                </ul>
              </div>
            </div>
          </div>
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
          background: var(--border-color);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--ai-purple);
        }
        .ai-card {
          backdrop-filter: blur(8px);
          transition: all 0.3s ease;
        }
        .dark .ai-card:hover {
          border-color: rgba(74, 79, 118, 0.4);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VoiceAgent />} />
        <Route path="/students" element={<StudentPage />} />
        <Route path="/parents" element={<ParentPage />} />
        <Route path="/adult-learners" element={<AdultLearnerPage />} />
        <Route path="/employers" element={<EmployerPage />} />
        <Route path="/counselors" element={<CounselorPage />} />
        <Route path="/profile" element={<UserProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

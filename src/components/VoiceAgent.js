import React, { useRef, useEffect, useState } from 'react';

export default function VoiceAgent({ idToken }) {
  const wsRef = useRef(null);
  const [aiMessages, setAiMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Audio capture and resampling to 16kHz PCM
  const startMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new window.AudioContext({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
      }
      const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
      wsRef.current?.send(JSON.stringify({ audio: audioBase64 }));
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
  };

  useEffect(() => {
    if (!idToken) return;
    const ws = new window.WebSocket(`ws://localhost:8080/api/voice-agent?token=${idToken}`);
    wsRef.current = ws;

    ws.onopen = startMic;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ai') setAiMessages(m => [...m, msg.text]);
      if (msg.type === 'barge-in') {
        // Stop audio playback immediately (implement your audio flush logic here)
      }
    };
    ws.onclose = () => {};
    ws.onerror = () => {};

    return () => ws.close();
  }, [idToken]);

  return (
    <div>
      <h2>AI Conversation</h2>
      <div>{aiMessages.map((m, i) => <div key={i}>{m}</div>)}</div>
    </div>
  );
}

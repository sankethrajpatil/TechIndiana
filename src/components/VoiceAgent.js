import React, { useEffect, useRef } from 'react';

export default function VoiceAgent() {
  const wsRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const ws = new window.WebSocket('ws://localhost:5000/api/voice-agent', token);
    wsRef.current = ws;

    ws.onopen = () => {
      // Ready to send/receive audio/text
    };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'ai') {
        // Handle Gemini AI output (audio/text)
        console.log(msg.data);
      }
    };
    ws.onclose = () => {};
    ws.onerror = () => {};

    return () => ws.close();
  }, []);

  // Add UI for sending audio/text to the agent as needed
  return <div>Voice Agent Connected</div>;
}

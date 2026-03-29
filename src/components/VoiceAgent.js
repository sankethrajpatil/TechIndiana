

import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';


export default function VoiceAgent({ idToken }) {
  const navigate = useNavigate();
  const wsRef = useRef(null);
  const [aiMessages, setAiMessages] = useState([]);
  const [meetingLink, setMeetingLink] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [studyPlan, setStudyPlan] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);

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
      if (msg.type === 'study_plan') {
        setStudyPlan({
          plan_title: msg.plan_title,
          action_items: msg.action_items
        });
      }
      if (msg.type === 'ui_redirect' && msg.route) {
        navigate(msg.route);
      }
      if (msg.type === 'meeting_scheduled' && msg.event_link) {
        setMeetingLink(msg.event_link);
      }
    };
    ws.onclose = () => {};
    ws.onerror = () => {};

    return () => ws.close();
  }, [idToken, navigate]);

  // End Session handler
  const handleEndSession = async () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setEndingSession(true);
    try {
      const res = await fetch('/api/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (res.ok) {
        alert('Session ended. Your study plan has been emailed to you!');
        // Optionally redirect:
        // window.location.href = '/dashboard';
      } else {
        alert('Failed to end session. Please try again.');
      }
    } catch (err) {
      alert('Error ending session.');
    }
    setEndingSession(false);
  };

  // Save Plan handler
  const handleSavePlan = async () => {
    if (!studyPlan) return;
    setSavingPlan(true);
    try {
      const res = await fetch('/api/profile/plan', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ study_plan: studyPlan })
      });
      if (res.ok) {
        alert('Study plan saved!');
      } else {
        alert('Failed to save study plan.');
      }
    } catch (err) {
      alert('Error saving study plan.');
    }
    setSavingPlan(false);
  };

  return (
    <div>
      {meetingLink && (
        <div style={{
          background: '#e3fcec',
          border: '2px solid #34c759',
          color: '#222',
          borderRadius: 12,
          padding: 24,
          margin: '24px auto',
          maxWidth: 420,
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(52,199,89,0.08)'
        }}>
          <h3 style={{ color: '#228c3c', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>Meeting Confirmed!</h3>
          <p style={{ marginBottom: 16 }}>Your meeting has been scheduled. Click below to view the calendar invite:</p>
          <a href={meetingLink} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-block',
            background: '#34c759',
            color: 'white',
            padding: '10px 28px',
            borderRadius: 8,
            fontWeight: 'bold',
            textDecoration: 'none',
            fontSize: 16
          }}>View Calendar Event</a>
        </div>
      )}
      <h2>AI Conversation</h2>
      <div>{aiMessages.map((m, i) => <div key={i}>{m}</div>)}</div>
      {studyPlan && (
        <div style={{
          margin: '32px auto',
          padding: 24,
          maxWidth: 500,
          background: '#f5f5f5',
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <h3>{studyPlan.plan_title}</h3>
          <ol>
            {studyPlan.action_items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
          <button
            onClick={handleSavePlan}
            style={{
              marginTop: 16,
              padding: '10px 28px',
              background: '#388e3c',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 'bold',
              cursor: savingPlan ? 'not-allowed' : 'pointer',
              opacity: savingPlan ? 0.6 : 1
            }}
            disabled={savingPlan}
          >
            {savingPlan ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      )}
      <button
        onClick={handleEndSession}
        style={{
          marginTop: 24,
          padding: '12px 32px',
          background: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 18,
          fontWeight: 'bold',
          cursor: endingSession ? 'not-allowed' : 'pointer',
          opacity: endingSession ? 0.6 : 1
        }}
        disabled={endingSession}
      >
        {endingSession ? 'Ending Session...' : 'End Session & Email Summary'}
      </button>
    </div>
  );
}

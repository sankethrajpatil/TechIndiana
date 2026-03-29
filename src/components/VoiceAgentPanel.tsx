import React from 'react';

type Props = {
  isConnected: boolean;
  isConnecting: boolean;
  transcript: string[];
  onStart: () => void;
  onStop: () => void;
};

export default function VoiceAgentPanel({ isConnected, isConnecting, transcript, onStart, onStop }: Props) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">AI Academic Advisor</div>
        <div>
          {!isConnected ? (
            <button onClick={onStart} className="px-3 py-1 bg-white text-black rounded">{isConnecting ? 'Connecting...' : 'Start Session'}</button>
          ) : (
            <button onClick={onStop} className="px-3 py-1 bg-red-600 rounded">End Session</button>
          )}
        </div>
      </div>

      <div className="max-h-48 overflow-auto text-sm text-white/80">
        {transcript.length === 0 ? (
          <div className="text-white/40">No conversation yet. Start the session to talk with the advisor.</div>
        ) : (
          transcript.map((t, i) => <div key={i} className="py-1">{t}</div>)
        )}
      </div>
    </div>
  );
}

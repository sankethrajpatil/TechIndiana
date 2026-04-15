# Audio Streaming Rules (Gemini Live API)

To ensure high-fidelity voice interaction and minimal latency, all audio entering and leaving the TechIndiana system must follow these rules.

## Outbound (User to AI)
- **Format:** Linear PCM (Raw).
- **Sample Rate:** Must be resampled to **16,000 Hz (16kHz)**.
- **Bit Depth:** **16-bit** signed integer.
- **Channels:** Mono.

## Inbound (AI to User)
- The backend receives 16kHz PCM chunks from Gemini.
- The React frontend should use the Web Audio API to queue and play these chunks smoothly.
- **Flushing:** If the backend receives a "user speech detected" event, it must clear the outbound audio buffer immediately.

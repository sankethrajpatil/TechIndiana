# TechIndiana API & Session Rules

## WebSocket Endpoint: `/api/voice-agent`
- This is the main entry point for the Gemini Live session.
- Requires a valid Firebase ID Token passed in the `sec-websocket-protocol` or as a query param.
- Protocol must handle:
  - `session_update` (Initial setup)
  - `audio_chunk` (User voice)
  - `realtime_response` (AI logic)

## REST Endpoint: `POST /api/session/end`
- Purpose: Safely teardown the Gemini session and save the final `UserProfile` and `study_plan` to MongoDB.
- Body: `{ sessionId: string, summary: boolean }`

## Middleware: Firebase Auth
- Every request must be validated against `firebase-admin`.
- Populate `req.user` with the `firebaseUid`.

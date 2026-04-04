# System Architecture

TechIndiana uses a modern distributed architecture to facilitate real-time voice interactions and deep integration with secondary tools.

## System Overview

```mermaid
graph TD
    User([User Client]) <-->|Vite / React| Frontend[Frontend Web App]
    Frontend <-->|WebSocket / HTTPS| Backend[Node.js / Express Server]
    
    subgraph "AI Core"
        Backend <-->|Gemini Live API| Gemini[Gemini 1.5/2.0 Advisor]
        Gemini -->|Tool Call| Backend
    end
    
    subgraph "Integrations"
        Backend -->|Google Calendar API| Calendar[Scheduling Service]
        Backend -->|Nodemailer| Email[Resource Delivery]
        Backend <-->|Mongoose| MongoDB[(User Data Store)]
    </div>
    
    subgraph "Authentication"
        Frontend <-->|Firebase SDK| Firebase[Firebase Auth]
    </div>
```

## Frontend Components (src/)

- **App.tsx**: Main layout, routing, and theme state.
- **VoiceAgent**: Manages WebSocket connection, microphone input, and speaker output.
- **PathwayComparison**: Specialized component for rendering AI-generated comparative analysis (Parents persona).
- **Middleware/Auth**: Connects Firebase tokens to Backend WebSocket authentication.

## Backend Components (server/)

- **server.ts**: Coordinates the WebSocket lifecycle between the Client and Google Gemini.
- **Routes/Session**: Handles HTTP endpoints for user setup.
- **Middleware/Auth**: Verifies Firebase JST tokens on WebSocket upgrades.
- **Services/CalendarService**: Encapsulates scheduling logic (OAuth2 via Service Accounts).
- **Services/EmailService**: Orchestrates resource distribution via SMTP.

## Data Flow: Real-time Voice Interaction

1. **Input**: User speaks -> Microphone captures PCM audio -> Client sends base64 PCM over WebSocket.
2. **AI Processing**: Server forwards PCM to Gemini Live Session.
3. **Decisions**: Gemini determines if a `Tool Call` (e.g., `schedule_meeting`) is needed.
4. **Execution**: Server executes the tool call (e.g., Calling `calendarService`).
5. **Output**: Gemini's generated response (Audio + Tool Output) is sent back to the Client for playback/render.

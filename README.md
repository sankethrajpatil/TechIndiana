# TechIndiana - AI-Driven Academic Advisor

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

TechIndiana is a modern, AI-powered educational platform designed to guide students, adult learners, and parents through the tech career landscape. Featuring a Gemini Live-powered voice advisor, it provides personalized study plans with YouTube tutorials, career assessments, and pathway comparisons.

## 🚀 Key Features

- **Gemini Live AI Advisor**: Real-time voice interaction using `gemini-2.5-flash-native-audio-preview` for academic guidance.
- **YouTube Study Plans**: AI-generated study plans with milestone dates and curated YouTube tutorials via the YouTube Data API v3.
- **AI-Driven UI Routing**: The advisor can dynamically navigate you to relevant pages (Persona-specific landing pages).
- **Counselor Dashboard**: Role-based admin portal for counselors to view, assign, and manage student progress.
- **Dual Login Flow**: "Explore My Future" for students and "Counselor Portal" for authorized counselors/admins.
- **Session Persistence**: Study plans and conversation history auto-saved to MongoDB, restored across sessions.
- **Scheduling API**: Direct integration with Google Calendar to book discovery calls with recruiters.
- **Resource Delivery**: Automated email system (Nodemailer) with formatted HTML study plans, milestone timelines, and video thumbnails.
- **Adult Skills Assessment**: Mapping professional experience to modern tech roles.
- **Interactive Visualizations**: Side-by-side pathway comparisons (TechIndiana vs. Traditional College) for parents.
- **Agentic Memory**: Long-term memory extraction and injection for context-aware returning sessions.
- **Dynamic Theme System**: Robust Light/Dark mode with a professional Blue & Purple palette.

## 🛠️ Tech Stack

**Frontend:** React 19, Vite 6, Tailwind CSS 4.0, Motion (Framer Motion), Lucide React, React Router DOM.
**Backend:** Node.js 22, Express, WebSocket (`ws`), TypeScript.
**AI/ML:** Google Gemini 2.5 Flash (Native Audio Preview — Real-time Multi-modal Live API).
**Database:** MongoDB Atlas via Mongoose 9.
**Auth:** Firebase Auth (Google provider) + Firebase Admin SDK.
**Integrations:** Google Calendar API, YouTube Data API v3, Nodemailer.
**Testing:** Vitest 4.1 (111 tests across 8 test files).
**CI/CD:** GitHub Actions with Workload Identity Federation → GCP Cloud Run + GitLab mirror.
**Hosting:** GCP Cloud Run (`techindiana-voice`, `us-central1`).

## 📂 Documentation

Detailed technical documentation can be found in the [docs/](docs/) folder:
- [System Architecture](docs/architecture.md)
- [Database Schema](docs/databaseSchema.md)
- [Agentic AI Logic](docs/agenticAI.md)

## 🏁 Getting Started

1. **Clone the repo:**
   ```bash
   git clone https://github.com/sankethrajpatil/TechIndiana.git
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file with the following:
   ```
   GEMINI_API_KEY=<your-gemini-api-key>
   GOOGLE_API_KEY=<your-youtube-data-api-key>
   MONGODB_URI=<your-mongodb-atlas-uri>
   MONGODB_DB=techindiana
   FIREBASE_SERVICE_ACCOUNT=<path-to-firebase-admin-sdk-json>
   EMAIL_USER=<your-gmail-address>
   EMAIL_PASS=<your-gmail-app-password>
   NODE_ENV=development
   ```

4. **Launch:**
   ```bash
   npx tsx server.ts
   ```
   The app runs on `http://localhost:8080`.

## 🔐 Role-Based Access Control

| Role | Access |
|------|--------|
| `student` (default) | Voice advisor, study plans, profile |
| `counselor` | All student access + counselor dashboard, student management |
| `admin` | All counselor access + role management for other users |

Roles are stored in the `UserProfile.role` field in MongoDB. Admins can assign roles via `PUT /api/admin/role`.

## 🧠 Agentic Memory & Rules

The TechIndiana AI utilizes a structured agentic memory and rule repository located in [.claude/](.claude/) to maintain context and follow strict execution protocols.

### 📜 Engineering Rules
- **Synchronous Tool Calling:** All function calls from the Gemini Live API MUST be matched by a synchronous `functionResponse` with a corresponding `id` before the AI resumes speaking.
- **Audio Standards:** All inbound/outbound audio must be resampled to **16kHz, 16-bit signed PCM** (Mono) for compatibility with the Gemini Live API.
- **WebSocket Stability:** All server-side `ws.send()` calls are guarded by `readyState` checks. A 30-second ping/pong heartbeat detects dead connections.
- **Barge-in Logic:** The system implements strict audio flushing when user speech is detected to ensure a natural conversational "barge-in" experience.
- **Styling Standards:** Adhere to the `#4A4F76` purple accent for AI elements and `dark:bg-slate-900` for dark mode backgrounds as defined in [rules/reflex.md](.claude/rules/reflex.md).

### 🛠️ Local Execution & Skills
- **Skill Orchestration:** Core business logic is abstracted into [skills/](.claude/skills/) (e.g., `email-actions`, `workflow-orchestration`).
- **Future-Proofing:** For future Python-based evaluation or multi-agent LangGraph flows, follow the guidelines in [rules/python.md](.claude/rules/python.md) and [rules/langgraph.md](.claude/rules/langgraph.md).


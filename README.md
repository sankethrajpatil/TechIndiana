# TechIndiana - AI-Driven Academic Advisor

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

TechIndiana is a modern, AI-powered educational platform designed to guide students, adult learners, and parents through the tech career landscape. Featuring a Gemini Live-powered voice advisor, it provides personalized study plans, career assessments, and pathway comparisons.

## 🚀 Key Features

- **Gemini Live AI Advisor**: Real-time voice interaction for academic guidance.
- **AI-Driven UI Routing**: The advisor can dynamically navigate you to relevant pages (Persona-specific landing pages).
- **Scheduling API**: Direct integration with Google Calendar to book discovery calls with recruiters.
- **Resource Delivery**: Automated email system (Nodemailer) to send curated resources and session summaries.
- **Adult Skills Assessment**: Mapping professional experience to modern tech roles.
- **Interactive Visualizations**: Side-by-side pathway comparisons (TechIndiana vs. Traditional College) for parents.
- **Dynamic Theme System**: Robust Light/Dark mode with a professional Blue & Purple palette.

## 🛠️ Tech Stack

**Frontend:** React 19, Vite, Tailwind CSS 4.0, Framer Motion, Lucide React.
**Backend:** Node.js, Express, WebSocket (ws).
**AI/ML:** Google Gemini 1.5/2.0 (Real-time Multi-modal API).
**Integrations:** Firebase Auth, Google Calendar API, Nodemailer, MongoDB.

## 📂 Documentation

Detailed technical documentation can be found in the [docs/](docs/) folder:
- [System Architecture](docs/architecture.md)
- [Database Schema](docs/databaseSchema.md)
- [Agentic AI Logic](docs/agenticAI.md)

## 🏁 Getting Started

1. **Clone the repo:**
   ```bash
   git clone https://github.com/sanky/TechIndiana.git
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file with `GOOGLE_API_KEY`, `MONGODB_URI`, `FIREBASE_API_KEY`, and `EMAIL_CONFIG`.

4. **Launch:**
   ```bash
   npm run dev
   ```

## 🧠 Agentic Memory & Rules

The TechIndiana AI utilizes a structured agentic memory and rule repository located in [.claude/](.claude/) to maintain context and follow strict execution protocols.

### 📜 Engineering Rules
- **Synchronous Tool Calling:** All function calls from the Gemini Live API MUST be matched by a synchronous `functionResponse` with a corresponding `id` before the AI resumes speaking.
- **Audio Standards:** All inbound/outbound audio must be resampled to **16kHz, 16-bit signed PCM** (Mono) for compatibility with the Gemini 3.1 Live API.
- **Barge-in Logic:** The system implements strict audio flushing when user speech is detected to ensure a natural conversational "barge-in" experience.
- **Styling Standards:** Adhere to the `#4A4F76` purple accent for AI elements and `dark:bg-slate-900` for dark mode backgrounds as defined in [rules/reflex.md](.claude/rules/reflex.md).

### 🛠️ Local Execution & Skills
- **Skill Orchestration:** Core business logic is abstracted into [skills/](.claude/skills/) (e.g., `email-actions`, `workflow-orchestration`).
- **State Management:** The global terminal and UI state is tracked via [memory/ui_state.json](.claude/memory/ui_state.json).
- **Future-Proofing:** For future Python-based evaluation or multi-agent LangGraph flows, follow the guidelines in [rules/python.md](.claude/rules/python.md) and [rules/langgraph.md](.claude/rules/langgraph.md).


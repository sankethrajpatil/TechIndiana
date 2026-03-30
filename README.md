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

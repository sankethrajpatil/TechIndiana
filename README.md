<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TechIndiana: AI-Driven Apprenticeship Platform

TechIndiana is a voice-first, AI-powered platform for career navigation, apprenticeship planning, and resource delivery. It uses Google Gemini 3.1 Live API, Google Calendar, MongoDB, and React.

## Features
- **Voice Agent**: Conversational AI for onboarding, study plans, and navigation
- **AI-Driven UI Routing**: Dynamic persona-based page redirects
- **Calendar Scheduling**: Book meetings for employers, parents, and students
- **Resource Delivery**: Email toolkits and guides to counselors and parents
- **Skills Self-Assessment**: Maps adult learners to IT pathways

## Quick Start

**Prerequisites:** Node.js, MongoDB, Google Cloud Service Account (for Calendar), Gmail account (for email)

1. Install dependencies:
   `npm install`
2. Set up environment variables:
   - `GEMINI_API_KEY` (Gemini 3.1 Live)
   - `GOOGLE_APPLICATION_CREDENTIALS` (path to your Google service account JSON)
   - `GOOGLE_CALENDAR_ID` (target Google Calendar ID)
   - `EMAIL_USER` and `EMAIL_PASS` (Gmail for Nodemailer)
3. Run the app:
   `npm run dev`

## Architecture
See [ARCHITECTURE.md](ARCHITECTURE.md) for a full system and schema overview.

## Contributing
Open issues or PRs for improvements, new features, or bug fixes.

## License
MIT

# TechIndiana Chat Context

## Overview
TechIndiana is an enterprise-grade AI voice agent and career navigation platform designed to bridge the gap between education and employment. It leverages the **Gemini 3.1 Flash Live API** for a low-latency, speech-to-speech E2E pipeline.

## AI Architecture
- **Model:** Gemini 3.1 Flash (Live).
- **Communication:** WebSockets for real-time PCM audio streaming.
- **Tool Calling:** Strict synchronous function calling. Every `call_id` must be matched by a `functionResponse` before the model continues.

## Database Schema (MongoDB/Mongoose)
The core user data is stored in the `UserProfile` collection:
- `firebaseUid`: Unique identifier from Firebase Auth.
- `name`: User's full name.
- `background`: Current education level or work history.
- `expectations`: Career goals and what they hope to achieve.
- `study_plan`: Array of objects representing the AI-generated pathway.

## Active Persona
The agent contextually adapts its tone and tools based on the route:
- `/students`: High school/College focus.
- `/parents`: Guidance and financial planning.
- `/adult-learners`: Reskilling and career pivots.
- `/employers`: Talent pipeline and partnership.
- `/counselors`: Toolkit and oversight.

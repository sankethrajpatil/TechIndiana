# TechIndiana Engineering & Design Notes

## User Personas
1. **Students**: Focus on apprenticeships vs. college.
2. **Parents**: Focus on ROI and support systems.
3. **Adult Learners**: Focus on efficient skill acquisition and "assess_adult_skills".
4. **Employers**: Focus on ROI for business and "schedule_partnership_call".
5. **Counselors**: Focus on data-driven guidance and "send_counselor_toolkit".

## Audio Handling (Barge-in)
- When the user starts speaking while the AI is talking, the client must send an `audio_flushing` signal.
- The backend must immediately stop the current stream and discard buffered audio to maintain conversational flow.

## Synchronous Tooling Logic
- **Crucial:** The Gemini Live API requires that for every `functionCall` received with an `id`, the backend MUST respond with a `functionResponse` containing the *exact same* `id`.
- If the tool interacts with the frontend (e.g., `show_pathway_comparison`), the backend must wait for a "ready" signal or return a success status before the AI resumes.

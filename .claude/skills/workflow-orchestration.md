# Skill: Workflow Orchestration

## assess_adult_skills
- **Input:** Current job history and desired pivot.
- **Logic:** Calls a specialized RAG pipeline to map transferable skills to open Indiana "Next Level Jobs" opportunities.

## schedule_partnership_call
- **Target:** Employer Persona.
- **Integration:** Google Calendar API.
- **Logic:** Proposes 3 time slots based on the TechIndiana Partnership Manager's availability.

## schedule_advisor_call
- **Target:** Student/Adult-Learner Persona.
- **Functionality:** Books a deep-dive session with a human advisor if the AI detects complexity beyond the automated scope.

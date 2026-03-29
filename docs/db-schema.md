# MongoDB Database Schema

## Collection: users
Each document represents a student/user and is identified by their unique `userId`.

### Fields
- **userId**: string (document key, unique for each user)
- **name**: string — The student's full name. (required)
- **grade**: string — The student's grade or level. (required)
- **areaOfInterest**: string — The student's primary area of technical interest. (required)

### Example Document
```json
{
  "userId": "abc123xyz",
  "name": "Jane Doe",
  "grade": "10",
  "areaOfInterest": "Web Development"
}
```markdown
# MongoDB Database Schema

Database name: `techindiana_ai`

This document describes the collections used by the TechIndiana project, example document shapes, recommended indexes, and how the server connects to Atlas. Where the exact field names were not present in the repository, reasonable assumptions are noted — verify against your Atlas documents and adjust the application queries if needed.

---

## Connection / environment

- The server reads the connection string and database name from environment variables:
  - `MONGODB_URI` — your Atlas connection string (do not commit this)
  - `MONGODB_DB` — name of the database (default used: `techindiana_ai`)

- Optional: `CREATE_INDEXES=true` can be set in development to create recommended indexes on startup.

Example (local `.env`):
```
MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
MONGODB_DB=techindiana_ai
```

---

## Collections and example schemas

Note: MongoDB is schemaless. The shapes below are the expected/common fields used by the application. Adjust if your documents use different field names.

### 1) `personas_reference`
Represents user personas used to tailor journeys, questions and rules.

Fields (typical):
- `_id`: ObjectId
- `persona`: string — persona identifier, e.g. "student", "career-changer"
- `displayName`: string — human friendly name
- `description`: string — long description of persona
- `metadata`: object — free-form metadata

Example:
```json
{
  "_id": { "$oid": "..." },
  "persona": "highschool_student",
  "displayName": "High School Student",
  "description": "Students in grades 9-12 exploring tech careers",
  "metadata": { "ageRange": "14-18" }
}
```

### 2) `programs_reference`
Programs or courses offered/recommended by TechIndiana.

Fields:
- `_id`, `programId` (optional), `name`, `summary`, `duration`, `tags`, `details`

Example:
```json
{
  "programId": "web-dev-101",
  "name": "Web Development Foundations",
  "summary": "Intro course to HTML/CSS/JS",
  "duration": "8 weeks",
  "tags": ["web","frontend"]
}
```

### 3) `career_tracks`
Career tracks mapping to programs and personas.

Fields:
- `_id`, `trackId`, `title`, `overview`, `recommendedPrograms`: [programId,...], `skills`

Example:
```json
{ "trackId":"frontend_engineer", "title":"Frontend Engineer", "overview":"...", "recommendedPrograms": ["web-dev-101"] }
```

### 4) `employer_archetypes`
Profiles representing employer needs or archetypes used to align recommendations.

Fields:
- `_id`, `name`, `description`, `requirements`

### 5) `main_user_journeys`
Primary student journeys. This collection is used heavily by the app to present step-by-step plans.

Fields (expected):
- `_id`
- `persona`: string — persona identifier this journey targets
- `title`: string
- `steps`: array of step objects { order, title, description, resources }
- `program_recommended`: string or [string]
- `metadata`: object

Example:
```json
{
  "persona": "highschool_student",
  "title": "Onboarding & Foundations",
  "steps": [ { "order":1, "title":"Intro to HTML", "description":"..." } ],
  "program_recommended": ["web-dev-101"]
}
```

Recommended indexes:
- `{ persona: 1 }`
- `{ program_recommended: 1 }`

### 6) `question_bank`
Repository of diagnostic or persona-driven questions.

Fields:
- `_id`, `persona`: string, `question`: string, `type`: string (e.g., multiple-choice), `options`: array, `metadata`

Example:
```json
{ "persona":"highschool_student", "question":"What topics interest you?", "type":"multi" }
```

Recommended index: `{ persona: 1 }`

### 7) `decision_rules`
Rules driving program recommendations and navigation logic.

Fields (typical):
- `_id`, `persona`, `ruleId`, `conditions`: object/array, `actions`: object/array, `priority`

Example:
```json
{ "persona":"highschool_student", "ruleId":"r1", "conditions":[{"q":"coding_interest","eq":true}], "actions":[{"recommend":"web-dev-101"}] }
```

Recommended index: `{ persona: 1 }`

### 8) `conversation_scenarios`
Prewritten conversation flows/scenarios for the assistant.

Fields:
- `_id`, `persona`, `scenarioId`, `turns`: array of messages/steps, `metadata`

Example:
```json
{ "persona":"highschool_student", "scenarioId":"onboarding_v1", "turns":[ { "speaker":"bot","text":"Hi! What's your name?" } ] }
```

Recommended index: `{ persona: 1 }`

### 9) `navigation_logic`
Rules that determine UI navigation and branching.

Fields:
- `_id`, `persona`, `nodeId`, `conditions`, `nextNodes`

Example:
```json
{ "persona":"highschool_student", "nodeId":"start", "conditions":[], "nextNodes":["ask_interest"] }
```

---

## Existing `users` collection
The repo already used a `users` collection for saving minimal student details (created via the Express API). Example document:

```json
{
  "userId": "abc123xyz",
  "name": "Jane Doe",
  "grade": "10",
  "areaOfInterest": "Web Development"
}
```

---

## Indexes and startup behavior
- The project includes optional automatic index creation when `CREATE_INDEXES=true`. This will attempt to create the persona-based indexes described above.
- Creating indexes in production should be done carefully during a maintenance window for large collections.

---

## Verification & adjustments
- If any collection uses different field names (for example `personaId` instead of `persona`), update the queries in `services/techIndianaService.js` and re-run tests.
- To view actual documents, open your Atlas cluster, navigate to `techindiana_ai` and inspect collections. Then copy exact field names into this document.

---

If you'd like, I can connect to your Atlas instance (you'll need to provide a temporary read-only URI) and extract the exact field names and a sample document for each collection and update this file to exactly match production.
```

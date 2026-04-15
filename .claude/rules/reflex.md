# React, Vite, and Tailwind Rules

Since TechIndiana transitioned from Reflex to a modern React stack, these rules are strictly enforced for UI consistency.

## Styling (Tailwind CSS)
- **Accent Color:** Use `#4A4F76` for all AI-specific elements (circles, buttons, highlights).
- **Dark Mode:** Enforce `dark:bg-slate-900` for the page background.
- **Light Mode:** Use a clean white (`bg-white`) with high-contrast text.
- **Typography:** Use sans-serif fonts (Inter or similar) for an enterprise-grade feel.

## Component Structure
- Use functional components with TypeScript.
- Store shared state (like the `UserProfile`) in a React Context or a robust state manager.
- Personas must be routed using `react-router-dom` to preserve browser history and state.

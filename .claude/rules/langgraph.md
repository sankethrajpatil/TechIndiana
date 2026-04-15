# Future Expansion: LangGraph Rules

If the task orchestration logic moves to a LangGraph-based service (Multi-agent architecture):

1. **State Management:** Use a `TypedDict` to track the user's career progress across different agents (e.g., Discovery Agent vs. Scheduling Agent).
2. **Check-pointing:** Implement MongoDB-backed check-pointers to allow users to resume voice sessions exactly where they left off.
3. **Interrupts:** Use the `interrupt` pattern for tools that require human-in-the-loop (e.g., verifying a rare certification).

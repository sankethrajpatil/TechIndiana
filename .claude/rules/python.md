# Python Evaluation & Analysis Rules

While the core TechIndiana stack is Node.js, we use Python for offline evaluation pipelines and LLM-as-a-Judge workflows.

## Evaluation Framework
- **Goal:** Test Retrieval Recall and Faithfulness of the AI's career advice.
- **Library:** Use `ragas` or bespoke LangGraph agents for evaluation.
- **Metric Tracking:**
  - **Relevancy:** Is the suggested apprenticeship valid for the user's background?
  - **Accuracy:** Does the salary data match the Indiana Department of Workforce Development records?

## Code Standards
- Use `pydantic` for data validation in evaluation scripts.
- Type hints are mandatory.
- Use `pytest` for unit testing logic pipelines.

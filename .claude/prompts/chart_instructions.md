# Tool: show_pathway_comparison

## Purpose
Visualizes a side-by-side comparison of different career pathways (e.g., a 4-year degree vs. a 2-year apprenticeship) on the React frontend.

## Data Structure
The `comparison_points` array sent to the tool must include:
- `label`: e.g., "Starting Salary", "Total Cost", "Time to Completion".
- `pathway_a`: The value for the first option.
- `pathway_b`: The value for the second option.

## Frontend UI Rules
- Use the TechIndiana purple (`#4A4F76`) for the apprenticeship bars.
- Use a neutral slate/gray for the traditional college path.
- Enable smooth transitions between comparison states.

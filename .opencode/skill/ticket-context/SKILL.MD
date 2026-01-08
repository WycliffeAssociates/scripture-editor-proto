---
name: ticket-context
description: Provides a technical template for planning documents and ticket creation
---
# What I do
This skill is used to help create technical planning documents and tickets for software development tasks.

## 1. Goal (1 Sentence)
What outcome are we producing? (Not the mechanism).

## 2. Non-Goals
What is explicitly out of scope? (The "helpful creativity" kill-switch).

## 3. Constraints & Invariants
*   **Physics:** Budgets, latency limits, strict boundaries.
*   **Architecture:** Hexagonal rules, no new dependencies, etc.

## 4. Repo Anchors & Prior Art
*   **Truth Files:** Which files define the source of truth?
*   **Pattern to Reuse:** Link to an existing implementation (e.g., "Use the Retry logic in `src/core/utils/retry.ts`"). 
*   **Rule:** Do not invent new frameworks or abstractions if these exist.

## 5. Acceptance Criteria / Defintion of Done
The checks that decide success.
*   **Tests:** Specific edge cases to cover.
*   **Verifiability:** How do we know it works without trusting the LLM? What's verifiable?

## 6. Implementation Steps (The Adjacent Possible)
Break this down into small, verifiable steps
1.  ...
2.  ...
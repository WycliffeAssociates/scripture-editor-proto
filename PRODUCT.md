# Product

## Register

product

## Users

Sefer serves scripture translation teams whose members may have little or no familiarity with Git or software-development workflows. They need to edit, review, save, recover, and share scripture confidently while several people may work on the same project from different devices and with unreliable connectivity.

## Product Purpose

Sefer is a local-first scripture editor for USFM. It protects work on the user's device, creates understandable saved versions, and helps teams exchange and reconcile changes without requiring them to learn Git. Success means users can tell where their work is, what will happen next, and when a human decision is required—without fearing silent data loss.

## Brand Personality

Calm, trustworthy, and plainspoken. The product should convey care for meaningful text, competence under difficult connectivity, and confidence that work remains recoverable.

## Anti-references

- Developer tools that expose branches, commit hashes, merge terminology, or source-control mechanics as the primary mental model.
- Generic infrastructure dashboards with dense status badges, unexplained system vocabulary, and decorative telemetry.
- Playful collaboration metaphors that make conflicts or data-loss risk feel trivial.
- Interfaces that hide important state changes behind animation, color alone, or automatic decisions the user cannot inspect.

## Design Principles

1. Show where work lives: distinguish the open workspace, the saved local copy, and the shared online copy.
2. Describe outcomes, not implementation: use plain collaboration language while keeping technical details available as secondary explanation.
3. Make safety visible: checking for updates must never look like it erases local work, and human review must be explicit when meaning overlaps.
4. Teach through concrete stories: unfamiliar synchronization behavior is easier to understand through realistic, stepwise scenarios than abstract status lists.
5. Preserve agency without ceremony: automate safe reconciliation, pause for genuine judgment, and avoid making users operate Git-shaped controls.

## Accessibility & Inclusion

Target WCAG 2.1 AA. State must be communicated with text and shape as well as color. Interactive controls require visible focus states and descriptive labels. Motion must support `prefers-reduced-motion` and must never be the only way to perceive a transition. Language should assume no Git knowledge and remain understandable when translated.

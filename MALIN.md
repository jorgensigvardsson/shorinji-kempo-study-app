# Malin's Collaboration Instructions

These instructions describe how to collaborate with Malin. They complement the shared project rules in `AGENTS.md`.

## Working with Malin

- Keep the dialogue with Malin lighthearted and a little playful while remaining clear and helpful.
- Malin contributes frontend ideas and is not a developer. Explain technical decisions in simple, concrete language and do not assume prior development knowledge.
- If Malin's intent is unclear or could reasonably be interpreted in different ways, ask clarifying questions instead of guessing.
- Do not make code changes unless Malin has clearly approved them first.
- Before an approved edit, explain what will change, which files are involved, and what will stay untouched.
- Keep changes small and easy to review or revert.
- Do not commit changes or create or switch branches unless Malin explicitly requests it.

## Protecting the app's content

- The app is based on Shorinji Kempo literature and its content is important. Never delete, rewrite, restructure, or silently "clean up" literature, technique records, grading requirements, translations, or other app data.
- If a proposed change could remove, alter, migrate, or hide existing content or user data, stop and ask Malin for explicit approval before proceeding.
- Prefer composing existing data and components in a new UI over changing the underlying content.
- Preserve existing URLs and user workflows where practical; use redirects or compatibility paths instead of breaking old links.
- After edits, verify that data files and content sources were not changed unintentionally.

## Frontend direction

- Prioritize clarity, ease of navigation, breathing room, and a lightweight feel.
- Avoid adding more boxes, shadows, tight spacing, or dense card layouts without a clear reason.
- Review one screen at a time and scope visual experiments to that screen unless a global change is explicitly approved.
- Preserve existing notes, ratings, filters, search behavior, study flows, and expandable technique details.
- Follow the existing React, TypeScript, Bootstrap, and translation patterns.

## Keeping focus

- Use `TODO.md` to park useful side ideas when the current task should remain focused.
- Do not act on TODO items automatically; bring them back into the conversation when they become relevant and ask for approval before editing.
- Before finishing a task, report what changed, what was deliberately left untouched, and how it was verified.

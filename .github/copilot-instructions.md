# Project Collaboration Instructions

## Working with the user

- The user is contributing frontend ideas and is not a developer. Explain technical decisions in simple, concrete language.
- Do not make code changes unless the user has clearly approved them first.
- Before an approved edit, explain what will change, which files are involved, and what will stay untouched.
- Keep changes small and easy to review or revert.
- Do not commit changes or create branches unless explicitly requested.

## Protecting the app's content

- The app is based on Shorinji Kempo literature and its content is important. Never delete, rewrite, restructure, or silently "clean up" literature, technique records, grading requirements, translations, or other app data.
- If a proposed change could remove, alter, migrate, or hide existing content or user data, stop and ask for explicit approval before proceeding.
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

- Use [TODO.md](../TODO.md) to park useful side ideas when the current task should remain focused.
- Do not act on todo items automatically; bring them back into the conversation when they become relevant and ask for approval before editing.
- Before finishing a task, report what changed, what was deliberately left untouched, and how it was verified.

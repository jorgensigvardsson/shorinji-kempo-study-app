# Malin's Collaboration Instructions

These instructions describe how to collaborate with Malin. They complement the shared project rules in `AGENTS.md`.

## Malin is a contributor to the source repository
Starting 2026-08-31

## Working with Malin

- Keep the dialogue with Malin lighthearted and a little playful while remaining clear and helpful.
- Malin contributes frontend ideas and is not a developer. Explain technical decisions in simple, concrete language and do not assume prior development knowledge.
- If Malin's intent is unclear or could reasonably be interpreted in different ways, ask clarifying questions instead of guessing.
- Do not make code changes unless Malin has clearly approved them first.
- Before an approved edit, explain what will change, which files are involved, and what will stay untouched.
- Keep changes small and easy to review or revert.
- Do not commit changes or create or switch branches unless Malin explicitly requests it.

## Starting Malin's local app

- At the beginning of every working session with Malin, make sure her local development environment is running so the app is immediately available in VS Code's Simple Browser. Check the URLs first and start only the services that are missing; never start duplicate processes.
- This Windows setup runs directly on the computer without Docker. Docker is not installed and should not be tried first.
- The local environment consists of three background processes:
  - Frontend: run `npm run dev` from `frontend` with `VITE_HTTPS=false`. It is available at `http://localhost:5173`.
  - Authentication backend: run `go run .` from `backend/auth`. Its health check is `http://localhost:8081/healthz`.
  - Persistence backend: run `go run .` from `backend/persistence`. Its health check is `http://localhost:8080/healthz`.
- Start missing services as hidden background processes with PowerShell `Start-Process`. Redirect output to the existing ignored files in `.codex`: `vite.stdout.log`, `vite.stderr.log`, `auth.stdout.log`, `auth.stderr.log`, `persistence.stdout.log`, and `persistence.stderr.log`. Do not create new untracked log files.
- Use HTTP requests to the three URLs above to determine whether the services are ready. Do not rely only on port or process listings. All three URLs must return HTTP 200 before telling Malin that the app is ready.
- `Start-Process` can leave the Codex shell wrapper looking active even after the services have started. If that happens, stop only the yielded wrapper after the processes have launched, then check the three URLs; the hidden child processes should remain running.
- Persistence may briefly log a JWKS connection failure when it starts before authentication. This is harmless only if it soon logs `jwks: loaded 1 key(s)` and the persistence health check returns HTTP 200.
- When Malin asks for her local email login code, read the most recent `[email:dev] verification code` entry from `.codex/auth.stderr.log`.
- To show the app inside VS Code: open the Command Palette with `Ctrl+Shift+P`, choose `Simple Browser: Show`, and enter `http://localhost:5173`.

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

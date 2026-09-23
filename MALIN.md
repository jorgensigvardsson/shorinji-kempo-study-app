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

## Helping Malin with Git and branches

- Git and branch management is difficult for Malin. Guide her proactively in plain language; do not wait for her to know which Git command or workflow to request.
- At the start of each new coding task, before editing, inspect and tell Malin:
  - which branch is active;
  - whether there are uncommitted changes and what task they appear to belong to;
  - whether the branch is behind or ahead of its GitHub counterpart; and
  - whether this is a safe place for the new work.
- Treat `main` as the stable integration branch, not as a place for ongoing feature work. For a new topic, recommend one small, clearly named `feature/…`, `fix/…`, or `docs/…` branch created from an up-to-date `main`.
- Malin often alternates between several ideas. Keep each topic on its own branch. Before changing topic or branch, protect the current work: explain whether it should be committed, kept on the current branch, or temporarily stashed. Never carry unrelated uncommitted files onto another branch silently.
- A general interface-polish pass is one valid topic even when it touches several unrelated screens. Do not force every spacing, colour, label, or alignment adjustment onto its own branch. Separate a change when it introduces a feature, changes behaviour or data, or grows into a larger redesign.
- For a new branch, the normal sequence is: protect current work; switch to `main`; run `git pull --rebase origin main`; create the new branch from that updated `main`; then confirm the new active branch to Malin. Committing, switching, and creating the branch still require her explicit approval.
- It is normal for `main` and a feature branch to both gain commits. This is not a mistake. Before release, bring the latest `main` into the feature branch and test the combined result. Prefer a normal merge for a branch that has already been pushed, shared, or deployed to staging; do not rewrite its published history with a rebase.
- Before switching branches or combining work, check both local and GitHub branch state. Pay special attention to local-only commits and uncommitted files, and explain them before taking action.
- Use the repository's release path explicitly and explain each boundary: feature branch → `deploy-staging` for staging; feature branch → `main` once accepted; updated `main` → `deploy` to start production. Merging into `main` alone does not deploy production.
- When Malin says she wants to start, continue, stage, merge, or release some work, translate that intention into the safe Git sequence and offer to carry it out. Do not make her memorize the commands.

## Describing Malin's changes

- Keep the user-facing changelog proportional to what users will notice, not to the number of files, commits, or individual CSS adjustments.
- When one release contains three or more small visual or wording adjustments, normally combine them into one calm entry equivalent to **"Small interface improvements"** in all four changelog languages. A short broad qualifier such as "across study and training screens" is fine when it helps, but do not list every margin, colour, heading, or button adjustment.
- One or two small changes may be described separately when knowing about them genuinely helps the user. Do not create several prominent changelog headlines merely because the polish touched several screens.
- Always give a clear, specific changelog entry to a new feature, a substantial redesign, a changed workflow or behaviour, and an important bug, accessibility, privacy, security, sync, or data-protection fix. Never hide one of those inside "small interface improvements".
- Git commit messages serve developers rather than app users. They may summarize a coherent cross-app polish pass without enumerating every tiny edit, but must remain specific enough to understand later—for example, `Polish interface details across study screens`, not `Small changes`.
- If a set of changes mixes minor polish with a significant feature or fix, keep the feature or fix distinct in the changelog and fold only the genuinely minor items into the general interface-improvements entry.

## Starting Malin's local app

- At the beginning of every working session with Malin, ask one simple setup question: **"Do you want to use the Docker preview here, or the direct Windows setup?"** Do not assume that the setup used in the previous session is available.
- Malin normally uses the Docker preview described below. The direct Windows setup is the fallback when she is working somewhere that does not have access to that environment.
- For either setup, check its real health endpoints/status first and start only missing services. Never start duplicate processes or mix processes from the two setups.

### Docker preview (Malin's usual setup)

- Run the development stack with Docker Compose from the repository root. It consists of `frontend`, `auth`, `persistence`, and the `proxy`, with the working tree mounted into the containers for live reload.
- Start or repair the stack with `docker compose up -d`. Do not also start host-side `go run` or Vite processes.
- Open the app at `https://localhost:5173`. The proxy terminates TLS and is the only service that publishes a host port.
- Do not test `http://localhost:8080` or `http://localhost:8081` in this setup: the backend ports intentionally exist only inside the Compose network. Verify the frontend with an HTTPS request to `https://localhost:5173`, check the auth container's health with `docker compose ps`, and confirm that persistence logs `listening on :8080` without a later build error.
- A response from `http://localhost:5173` saying that plain HTTP was sent to an HTTPS port means the Docker preview is already listening; use HTTPS instead of starting another frontend.
- The containers run as the local UID/GID supplied by `LOCAL_UID`/`LOCAL_GID`. If generated `backend/*/tmp` build files have stale ownership, inspect the actual host and container IDs before correcting only those generated directories. Never assume the ID is `1000`, and do not alter source files or `devdata` to fix a build-cache permission problem.
- Missing Google, Microsoft, or Cosmos environment variables are expected for ordinary local file-backed development and are not by themselves a startup failure.

### Direct Windows setup (fallback)

- This setup runs directly on the computer without Docker. Use it only after Malin chooses it; do not try Docker first in this setup.
- The local environment consists of three background processes:
  - Frontend: run `npm run dev` from `frontend` with `VITE_HTTPS=false`. It is available at `http://localhost:5173`.
    Malin's setup is HTTP only, which is fine — `localhost` is a secure context anyway. Serving over HTTPS needs the Docker stack (`docker compose up`, see "Development" in `README.md`), and Docker is not installed here.
    With no `VITE_API_URL`/`VITE_AUTH_URL` set, the app falls back to `http://localhost:8081` and `http://localhost:8080` — which is exactly what these three processes serve, so nothing extra is needed here.
  - Authentication backend: run `go run .` from `backend/auth`. Its health check is `http://localhost:8081/healthz`.
  - Persistence backend: run `go run .` from `backend/persistence`. Its health check is `http://localhost:8080/healthz`.
- Start missing services as hidden background processes with PowerShell `Start-Process`. Redirect output to the existing ignored files in `.codex`: `vite.stdout.log`, `vite.stderr.log`, `auth.stdout.log`, `auth.stderr.log`, `persistence.stdout.log`, and `persistence.stderr.log`. Do not create new untracked log files.
- Use HTTP requests to the three URLs above to determine whether the services are ready. Do not rely only on port or process listings. All three URLs must return HTTP 200 before telling Malin that the app is ready.
- `Start-Process` can leave the Codex shell wrapper looking active even after the services have started. If that happens, stop only the yielded wrapper after the processes have launched, then check the three URLs; the hidden child processes should remain running.
- Persistence may briefly log a JWKS connection failure when it starts before authentication. This is harmless only if it soon logs `jwks: loaded 1 key(s)` and the persistence health check returns HTTP 200.
- When Malin asks for her local email login code, read the most recent `[email:dev] verification code` entry from `.codex/auth.stderr.log`.
- If the local login has no account or the branch picker is empty, the data directory needs seeding — see "Seeding a local account" in `README.md`. Run `go run ./cmd/devseed --apply` from `backend/auth`, then restart the auth service. This deletes the local data directory, so confirm with Malin first.
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

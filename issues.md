# Issues

Tracking issues for the AI Video Editor MVP. See `claude.md` for full spec.

**Scope note:** `server/` is on hold. For now everything — including API routes,
Firebase access, and future AI/agent logic — lives inside `client/` (Next.js
App Router, using `src/app/api/*` route handlers as the backend). Revisit the
separate Cloud Run `server/` once the Next.js API routes outgrow what's
practical to run inside request handlers (e.g. long-running FFmpeg renders).

Auth is deliberately skipped for now — building the core transcript ↔ video
editing loop first, single local session, no persistence across reload.

---

## #1 — Firebase project setup + authentication — **deferred**

Set up Firebase (Auth, Firestore, Storage) and implement sign up / login.

- Create Firebase project, enable Google + Email/Password providers
- Add `client/src/lib/firebase/` (client SDK init + admin SDK init for server-side use in route handlers)
- Env vars for Firebase config (`.env.local`, never committed)
- Login/signup screen (Google button + email/password form)
- Auth state available app-wide (e.g. `useAuthStore` or a context provider)
- Protected routes: unauthenticated users redirected to login

**Spec refs:** sections 1 (#1), 2 (Authentication), 13, 18, 19

---

## #2 — Project CRUD + Dashboard — **deferred**

Users can create, rename, delete, and list their video projects.

- `VideoProject` type in `client/src/types/project.ts`
- Firestore `projects/{projectId}` collection, owned by `userId`
- API routes: `POST /api/projects`, `GET /api/projects`, `GET /api/projects/:id`
- Dashboard screen: project grid/list + "New Project" action
- Ownership check on every project read/write (never trust client-supplied `userId`)

**Spec refs:** sections 1 (#2), 2 (Projects), 9, 17, 18, 21, 26 (Dashboard)

---

## #3 — Video upload — **done, local-only**

Users can upload a video and it's ready for editing.

- ~~Storage path convention: `users/{userId}/projects/{projectId}/original/`~~ deferred — no Firebase Storage yet; video stays in-browser as an object URL (`useProjectStore`)
- ~~Upload progress bar / resumable upload~~ deferred — single local file read, no progress needed yet
- Client-side file picker (`UploadScreen.tsx`), `video/*` accept filter
- Original file handed directly to `/api/transcribe`
- Not yet done: server-side file type/size validation beyond the 25MB Whisper cap, persistence across reload

**Spec refs:** sections 1 (#3), 2 (Video Upload), 9, 15, 17, 21

---

## #4 — Transcription pipeline — **done (word-level)**

Automatically transcribe an uploaded video and store word/sentence-level timestamps.

- `POST /api/transcribe` (`client/src/app/api/transcribe/route.ts`) accepts the raw video file and calls OpenAI Whisper (`whisper-1`, `verbose_json`, word+segment granularity) — no separate ffmpeg audio-extraction step yet, Whisper accepts mp4 directly
- Word + segment timestamps mapped into `Transcript` / `TranscriptSegment` / `TranscriptWord` (`client/src/lib/ai/transcribe.ts`)
- 25MB request-size cap enforced (Whisper API limit) with a structured `{ success: false, error }` response on failure
- Not yet done: persisted storage (Firestore), async/queued status (queued/processing/completed/failed) — currently a single synchronous request/response
- Verified end-to-end with a real generated speech clip (see commit history / manual test)

**Spec refs:** sections 1 (#4), 2 (Transcription), 10, 17, 21

---

## #5 — Editor: video + transcript + transcript-driven cuts — **done**

The core loop: view video and transcript side by side, delete transcript text, see the video cut accordingly.

- `EditorLayout` (video left, transcript right, timeline below) per the section 26 wireframe
- `VideoPlayer`: click a transcript word → seeks video; playback highlights the current word
- Word/range selection in `TranscriptPanel` (click, shift-click range) → "Delete selection" creates a `cut` `EditOperation` (`useTimelineStore`)
- Cut transcript words render struck-through; cut video ranges are removed from the `Timeline` bar and skipped automatically during playback (`lib/timeline/cuts.ts` maps source-time ↔ edited-time)
- Undo/redo over cut operations
- Not yet done: sentence/segment-level delete shortcut (currently word-by-word or range-select), persistence across reload

**Spec refs:** sections 1 (#5–#7), 2 (Video Editor, Transcript Editing), 8, 10, 11, 16, 19, 20, 26 (Editor)

---

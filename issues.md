# Issues

Tracking issues for the AI Video Editor MVP. See `claude.md` for full spec.

**Scope note:** `server/` is on hold. For now everything — including API
routes and future AI/agent logic — lives inside `client/` (Next.js App
Router, using `src/app/api/*` route handlers as the backend).

**Major decision (2026-09-16): no Firebase, no cloud, local-first.**
Persistence is SQLite (via Prisma) + the local filesystem, not
Firestore/Firebase Storage. There is no login — v1 is a single local user,
by design, not a temporary gap. This project is heading toward an open
source launch: self-hosted, `npm install && npm run dev`, no cloud account
required. See `claude.md` sections 2, 13–18 for the full rationale.

---

## #1 — Firebase / accounts — **not planned**

Superseded by the no-Firebase, no-auth decision above. v1 has no login
screen and no multi-user concept — see `claude.md` section 2 (Accounts)
and section 18 (Security) for what that does and doesn't mean. Revisit
only if this ever needs to run as a shared multi-user deployment, and
even then, real auth (not Firebase) would need its own decision.

---

## #2 — Project CRUD + Dashboard — **blocked on #7**

Users can create, rename, delete, and list their video projects.

- `VideoProject` type in `client/src/types/project.ts` (no `userId` — see spec section 9)
- Prisma `Project` model (see #7), no ownership checks needed for v1
- API routes: `POST /api/projects`, `GET /api/projects`, `GET /api/projects/:id`
- Dashboard screen: project grid/list + "New Project" action
- This is what turns the current single-session editor into something that survives a reload

**Spec refs:** sections 1 (#1), 2 (Projects), 9, 17, 21, 26 (Dashboard)

---

## #3 — Video upload — **done, in-browser only**

Users can upload a video and it's ready for editing.

- Storage path convention (`data/projects/{projectId}/original/`, per spec section 15): not wired up yet — see #7; video currently stays in-browser as an object URL (`useProjectStore`), never written to disk
- Upload progress bar: deferred — single local file read, no progress needed yet
- Client-side file picker (`UploadScreen.tsx`), `video/*` accept filter
- Original file handed directly to `/api/transcribe`
- Not yet done: server-side file type/size validation beyond the 25MB Whisper cap, persistence across reload (blocked on #7)

**Spec refs:** sections 1 (#3), 2 (Video Upload), 9, 15, 17, 21

---

## #4 — Transcription pipeline — **done (word-level)**

Automatically transcribe an uploaded video and store word/sentence-level timestamps.

- `POST /api/transcribe` (`client/src/app/api/transcribe/route.ts`) accepts the raw video file and calls OpenAI Whisper (`whisper-1`, `verbose_json`, word+segment granularity) — no separate ffmpeg audio-extraction step yet, Whisper accepts mp4 directly
- Word + segment timestamps mapped into `Transcript` / `TranscriptSegment` / `TranscriptWord` (`client/src/lib/ai/transcribe.ts`)
- 25MB request-size cap enforced (Whisper API limit) with a structured `{ success: false, error }` response on failure
- Not yet done: persisted storage (Prisma `Transcript` model, blocked on #7), async/queued status (queued/processing/completed/failed) — currently a single synchronous request/response
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

## #6 — Filters drawer (Descript-style) — **done, preview-only**

A right-side drawer of visual filter presets (None, Black & white, Vintage,
Warm, Cool, High contrast, Faded), applied live to the video preview.

- `FilterDrawer.tsx`: grabs a still frame from the live video via canvas the moment the drawer opens, previews every preset against that real frame
- Selection stored on `useProjectStore.filterId`, applied as a CSS `filter` on the `<video>` element in `VideoPlayer` — instant, no re-encode
- `lib/video/filters.ts` holds the preset definitions (CSS `filter` strings)
- Preview-only by design: this is not in the FFmpeg render pipeline yet (export is still stubbed) — will need to become an actual FFmpeg `-vf` filter mapping once rendering exists, not just a browser CSS filter

**Spec refs:** section 26 (Editor toolbar); explicitly lightweight vs. section 28's "advanced color grading" (out of MVP scope) — this is presets only, no manual grading controls

---

## #7 — Local persistence: SQLite + Prisma + local filesystem — **next up**

Replace the current in-memory/single-session state with real local
persistence, per `claude.md` sections 13, 15, 17. This is what everything
else (#2, #3, #4) is blocked on.

- `prisma/schema.prisma`: `Project`, `Asset`, `Transcript`, `EditOperation`, `RenderJob` models, each keyed by `projectId` with cascading delete (no `User`/ownership — see spec section 2)
- `client/src/lib/db/` — Prisma client singleton
- `client/src/lib/storage/` — local filesystem helpers: write uploads under `${DATA_DIR}/projects/{projectId}/original/`, path validation that rejects anything resolving outside `DATA_DIR` (spec section 18)
- `DATA_DIR` env var (default `./data`), gitignored
- Wire `/api/projects` CRUD + `/api/projects/:id/upload` + `/api/projects/:id/transcribe` to actually persist instead of living only in Zustand
- Once this lands, re-open #2/#3/#4 to remove their "not yet done: persistence" notes

**Spec refs:** sections 9, 13, 15, 17, 18, 21

---

## #8 — OSS launch readiness — **not started**

What's needed before this repo is public, per the local-first/OSS
decision above.

- `LICENSE` file (license choice still needed — ask before picking one)
- `.env.example` in `client/` (documents `OPENAI_API_KEY`, `DATA_DIR`, and any future env vars)
- Root `README.md`: add the no-auth/local-network security note from `claude.md` section 18 ("don't expose this to a public/shared network without adding real auth")
- Contributing guide (how to run locally, how to file issues) — can be light for v1
- Basic CI: lint + build on PRs
- Sweep for anything environment-specific that shouldn't be in a public repo (none currently known, but re-check before publishing)

**Spec refs:** section 13 (local-first framing), section 18 (self-hosting security note)

---

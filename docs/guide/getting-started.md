# Getting Started

transcriptcut is local-first: everything runs on your own machine. The
only external dependency is an OpenAI API key, used for transcription and
the AI buttons (filler words, speakers, chapters, show notes,
highlights), never for storage.

## Run with Docker

The easiest way to run it. All you need is
[Docker](https://docs.docker.com/get-docker/); the image includes Bun,
FFmpeg (with subtitle burn-in support) and the fonts captions need.

```bash
git clone https://github.com/amide-init/transcriptcut.git
cd transcriptcut
docker compose up --build
```

Open `http://localhost:3001`. On first launch the app asks
for your OpenAI API key. To skip that, run `cp .env.example .env` and set
`OPENAI_API_KEY` before starting. It's the same root `.env` the
development setup uses.

Projects, uploads and renders live in the `transcriptcut-data` Docker
volume, so they survive restarts and rebuilds. To update, run
`git pull && docker compose up --build`.

The app is published on `127.0.0.1` only, since it has no login (see
[Security & Self-Hosting](/guide/security)). Caption fonts use free Liberation and DejaVu equivalents of Arial,
Helvetica, Verdana and the rest, so burned-in captions can look slightly
different from the same export on a Mac.

## Development setup

For working on the code, with hot reload.

### Requirements

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- [Bun](https://bun.sh) (the backend's runtime)
- [FFmpeg](https://ffmpeg.org/download.html) and `ffprobe` on your
  `PATH` (used for audio extraction, cuts, audio cleanup and export)
- An OpenAI API key (used server-side only)

### Setup

```bash
git clone https://github.com/amide-init/transcriptcut.git
cd transcriptcut
pnpm install                      # installs deps for client + server
cp .env.example .env              # then fill in OPENAI_API_KEY
pnpm --filter server db:generate  # generates the Prisma client
pnpm run dev                      # runs the Vite client and Bun backend together
```

Open `http://localhost:5173`. See
[`.env.example`](https://github.com/amide-init/transcriptcut/blob/main/.env.example)
for what each variable does. `MAX_UPLOAD_MB` raises or lowers the upload
limit, which defaults to 10 GB.

::: tip Long dev sessions
`pnpm run dev` runs the backend with `bun --watch`, which holds on to a
few file handles every time it reloads. After a long session with many
server code edits, starting FFmpeg can fail with `EBADF: bad file
descriptor, posix_spawn`. Restarting `pnpm run dev` clears it.
:::

## Your first edit

1. **Create a project** from the dashboard.
2. **Upload a video** — it's stored under your local `DATA_DIR`, never
   overwritten.
3. **Wait for transcription** — Whisper produces word- and
   segment-level timestamps automatically. Long episodes are transcribed
   in chunks in the background, with progress shown.
4. **Select text in the transcript and delete it.** The matching section
   of the video is cut immediately — reflected on the timeline and
   skipped during playback.
5. **Try "Find filler words" or "Find long pauses"** to flag candidates
   for one-click removal.
6. **Preview**, then **Export** to render the final MP4 with every
   preview effect (filters, color, logo, captions) baked in, or pick MP3 /
   WAV for an audio-only podcast feed.

Making a podcast? The [Podcast Workflow](/guide/podcasting) guide covers
speakers, audio cleanup, chapters, show notes and Shorts. See
[Editing Workflow](/guide/editing-workflow) for how transcript edits map
to video cuts, and [AI-Assisted Editing](/guide/ai-editing) for what the
AI does (and deliberately does not do).

## Testing

```bash
pnpm run test   # runs both client and server test suites
```

Deterministic Vitest unit tests cover timeline cut/trim math,
transcript-to-caption mapping, the FFmpeg render-plan builder (cuts,
audio cleanup, reframing, chapters), chunked transcription and speaker
alignment, chapter and highlight validation, path-traversal safety, and
CSS-preview ↔ FFmpeg-export parity. CI runs the same command on every PR.

## Project structure

```text
docs/        — this documentation site (VitePress)
claude.md    — full product spec
client/      — Vite + React editor UI (SPA, no server rendering)
server/      — Bun + Hono backend (API routes, FFmpeg, Prisma/SQLite, OpenAI)
```

The client and server run as separate processes, kept in one piece by
`pnpm run dev` from the repo root. See [Architecture](/guide/architecture)
for how they talk to each other.

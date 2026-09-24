# Architecture

transcriptcut is deliberately simple infrastructure: no managed database,
no object storage, no job queue, no cloud account. The full spec lives in
[`claude.md`](https://github.com/amide-init/transcriptcut/blob/main/claude.md)
in the repo root — this page is a shorter map of the same territory.

## Local-first stack

| Concern     | Choice                                                    |
| ----------- | ---------------------------------------------------------- |
| Database    | SQLite via Prisma — a single file, no server process        |
| Storage     | The local filesystem, under a configurable `DATA_DIR`       |
| Rendering   | FFmpeg, invoked as a local child process                    |
| AI          | An LLM provider API key (OpenAI by default) for inference only |

If you want to self-host this on a VPS, a container, or a home server,
that should work by pointing `DATA_DIR` at a persistent volume — no
rewrite required.

## Two processes, one dev command

`client/` is a Vite + React SPA (no server-side rendering); `server/` is
a Bun + Hono backend serving the REST API, FFmpeg, Prisma/SQLite, and
the OpenAI calls. They run as separate processes, started together by
`pnpm run dev` from the repo root, with Vite proxying `/api/*` to the
backend in development. This split — one deployable backend unit, no
server-rendering step to work around — is also what makes the native
macOS app possible: the packaged app spawns the same Bun server as a
child process and points a Tauri window at it. See [Download](/download).

## Data on disk

```text
data/
  app.db          — the SQLite database
  projects/{projectId}/
    original/     — uploaded source video, never overwritten
    proxy/        — 720p editing proxy (made for sources above 720p or over 300 MB)
    audio/        — small speech-quality track: transcription, speaker detection, waveform
    logo/         — uploaded watermark image
    render/       — exports, clips, and audio previews
```

Rendered output is always a separate file from the original — the
project's state lives in the timeline model, not in a rendered video.

## The timeline is the source of truth

The project is represented as editable operations and timeline state,
never just a final rendered file:

```typescript
type VideoProject = {
  id: string;
  name: string;
  duration: number;
  assets: Asset[];
  tracks: Track[];
  transcriptId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type Track = { id: string; type: "video" | "audio" | "subtitle"; clips: Clip[] };

type Clip = {
  id: string;
  assetId: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
};
```

Every edit is an operation (cut, trim, split, caption) applied to this
model — serializable, deterministic, validated, undoable, and replayable.
See [Editing Workflow](/guide/editing-workflow).

## Long work runs in the background

Transcription, speaker detection and rendering can each take minutes on a
long episode, so none of them block an API request. Each gets a job row
the frontend polls: `TranscriptionJob` (transcription and speaker
detection, with chunk progress) and `RenderJob` (exports, clips, audio
previews). Jobs still running when the server restarts are marked failed,
so a retry is never blocked.

Rendering, for example:

```text
Frontend → API route → create RenderJob row (status: "queued")
         → kick off a local async render task → FFmpeg (child process)
         → write output to disk → update RenderJob row
Frontend polls for status.
```

For a single local user, one render at a time is fine — there's no
Pub/Sub or separate worker process. A real job queue is only worth
adding if concurrent renders become an actual requirement.

## Database upgrades

The server applies any pending Prisma migrations at startup and records
them in Prisma's own `_prisma_migrations` table. That's what upgrades an
existing Mac app install, which can't run the Prisma CLI, to a newer
schema without losing projects. For a database that's already current,
it does nothing.

## No accounts, by design

v1 is a single local user — whoever runs the app owns every project on
that machine. There's no `User` model and no ownership checks, but every
table is still keyed by `projectId` with a foreign key and cascading
delete, so an `ownerId` column could be added later without a schema
rewrite. See [Security & Self-Hosting](/guide/security) for what this
does and doesn't mean for exposing the app beyond your own machine.

## Keeping providers swappable

Transcription and future AI integrations sit behind clear service
interfaces so a provider can be swapped without touching call sites —
useful if you'd rather point transcription at a different Whisper-
compatible endpoint, for example.

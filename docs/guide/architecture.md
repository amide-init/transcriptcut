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

## Data on disk

```text
data/
  projects/{projectId}/
    original/     — uploaded source video, never overwritten
    proxy/        — lower-res proxy used by the editor where possible
    audio/        — extracted audio for transcription
    thumbnails/   — timeline frame thumbnails
    renders/      — exported output files
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

## Rendering is asynchronous

Long-running FFmpeg work never blocks an API request:

```text
Frontend → API route → create RenderJob row (status: "queued")
         → kick off a local async render task → FFmpeg (child process)
         → write output to disk → update RenderJob row
Frontend polls for status.
```

For a single local user, one render at a time is fine — there's no
Pub/Sub or separate worker process. A real job queue is only worth
adding if concurrent renders become an actual requirement.

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

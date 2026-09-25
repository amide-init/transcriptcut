# CLAUDE.md

## Project: AI Video Editor MVP

Build a web-based, AI-powered video editor inspired by Descript.

The core product idea is:

> **Edit video by editing its transcript and by giving natural-language commands to an AI editor.**

The MVP should prioritize a reliable transcript ↔ video editing workflow over advanced visual effects.

This project is **local-first and open source**. It runs entirely on your
own machine — no cloud account, no vendor sign-up, no bill — with a single
`pnpm install && pnpm run dev`. The only external dependency is an LLM
provider API key (for transcription and AI editing), used purely for
inference calls, never for storage. See section 13 for the full
architecture rationale.

---

# 1. Product Goal

Users should be able to:

1. Create a video project.
2. Upload a video.
3. Automatically transcribe the video.
4. View the video and transcript side-by-side.
5. Edit/delete transcript sections.
6. Automatically reflect transcript edits on the video timeline.
7. Give natural-language editing commands.
8. Let AI convert commands into structured edit operations.
9. Preview the result.
10. Render/export the final video.

Example:

> Remove the first 30 seconds.

AI produces:

```json
{
  "operations": [
    {
      "type": "trim",
      "start": 0,
      "end": 30
    }
  ]
}
```

Another example:

> Remove all filler words.

AI identifies filler words from the transcript and creates corresponding cut operations.

---

# 2. MVP Scope

## Must Have

### Accounts

No accounts, no login screen. v1 is a single local user — whoever runs the
app owns every project on that machine. This is a deliberate simplicity
choice for a self-hosted OSS tool, not an oversight; see section 18 for
what that does and doesn't mean for security, and section 17 for how the
schema stays ready for multi-user support later without a rewrite.

### Projects

* Create project
* Rename project
* Delete project
* List projects

### Video Upload

* Upload video to local filesystem storage
* Display upload progress
* Store video metadata

### Transcription

* Extract/process audio
* Speech-to-text
* Store transcript
* Store sentence/word timestamps

### Video Editor

Desktop-first editor containing:

```text
┌─────────────────────────────────────────────────────┐
│                    Video Preview                    │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│                          │       Transcript         │
│          Video           │                          │
│                          │  Hello everyone...       │
│                          │  Today we are going...   │
│                          │                          │
├──────────────────────────┴──────────────────────────┤
│                    Timeline                         │
│                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
└─────────────────────────────────────────────────────┘
```

### Transcript Editing

Users can:

* select text
* delete text
* delete a sentence
* delete a transcript segment
* jump from transcript → video timestamp
* jump from video → transcript timestamp

Deleting transcript content should create a corresponding video cut.

---

# 3. AI Editing

**Status: the free-text "Ask AI" command bar described below was built
(LangGraph Director/Editor/Validator pipeline, see sections 5-8), verified
end-to-end, then deliberately removed** -- an open text field that could
propose arbitrary edits to the project was decided against. AI-assisted
editing in this project now means specific, scoped actions the user
explicitly triggers (filler-word removal, silence removal), not an
open-ended chat interface. Sections 5-8 (the agent architecture) remain
as a record of that design and could be relevant again behind a more
constrained interface, but nothing currently implements them.

Provide an AI command interface.

Example commands:

```text
Remove the first 20 seconds.

Remove all filler words.

Remove the section where I talk about pricing.

Make this video shorter.

Remove long pauses.

Keep only the important parts.
```

The AI must NOT directly modify video files.

The AI produces structured edit operations.

---

# 4. Model Strategy

Use only two LLMs for editing in the MVP.

## GPT-4o-mini

Use for:

* intent classification
* simple editing commands
* transcript cleanup
* filler-word detection
* structured extraction
* simple transformations
* low-cost operations

## GPT-5.6 Luna

Use for:

* complex editing requests
* multi-step editing plans
* ambiguous requests
* selecting important sections
* reasoning across transcript/context
* complex AI Director behavior

### Model routing

```text
User request
     │
     ▼
GPT-4o-mini
     │
     ├── Simple / deterministic
     │        ↓
     │    Execute
     │
     └── Complex / ambiguous
              ↓
        GPT-5.6 Luna
              ↓
         Edit Plan
```

Do not use GPT-5.6 Luna for every request.

## Transcription model

Transcription is a separate concern from editing and isn't routed through
the GPT-4o-mini / GPT-5.6 Luna split above. Use OpenAI Whisper
(`whisper-1`, `verbose_json`, word + segment timestamp granularity) —
already implemented in `lib/ai/transcribe.ts`. Long episodes are handled
by `lib/ai/transcription-job.ts`: it extracts a mono 16kHz 32kbps speech
track, splits it into ~10-minute chunks at detected silences
(`lib/ai/chunking.ts`), transcribes the chunks in parallel, and merges them
back onto the source timeline, so source file size never hits Whisper's
25MB upload cap. Keep it behind a clear
service interface (per section 29) so the provider can be swapped later.

---

# 5. Agent Architecture

Use LangGraph.

Keep the MVP agent architecture small.

## Agents

### Director Agent

Responsible for understanding the user's request.

Input:

```text
User request
Project context
Transcript context
Current edit state
```

Output:

```text
Edit intent
Required operations
```

---

### Editor Agent

Converts the intent into structured editing operations.

Example:

```json
{
  "operations": [
    {
      "type": "cut",
      "start": 42.2,
      "end": 48.7,
      "reason": "Filler content"
    }
  ]
}
```

---

### Validator Agent

Validates the generated operations.

Check:

* timestamps are valid
* start < end
* timestamps are inside video duration
* operations do not produce invalid timeline state
* referenced assets exist
* operations are supported
* no impossible edit combinations

If invalid, return a structured error.

---

# 6. Agent Principle

## Agents reason. Tools execute.

Never allow an LLM to directly execute FFmpeg commands.

Correct:

```text
User
 ↓
LLM
 ↓
Edit Operations JSON
 ↓
Validation
 ↓
Application logic
 ↓
FFmpeg
```

Incorrect:

```text
User
 ↓
LLM
 ↓
raw shell command
 ↓
FFmpeg
```

All media operations must be deterministic and controlled by application code.

---

# 7. Tools Available to Agents

Create typed tools such as:

```typescript
searchTranscript()
getTranscriptSegment()
getProjectState()

createCut()
trimVideo()
splitClip()

removeFillerWords()
removeSilence()

createCaption()
getTimeline()

validateEditPlan()
createRenderJob()
```

Agents should only access tools that are necessary for their task.

---

# 8. Edit Operation Model

Create a common operation format.

Example:

```typescript
type EditOperation =
  | {
      type: "cut";
      start: number;
      end: number;
      reason?: string;
    }
  | {
      type: "trim";
      start: number;
      end: number;
    }
  | {
      type: "split";
      timestamp: number;
    }
  | {
      type: "caption";
      text: string;
      start: number;
      end: number;
    };
```

Operations must be:

* serializable
* deterministic
* validated
* undoable
* replayable

---

# 9. Timeline Model

The timeline is the source of truth for editing.

Example:

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
```

No `userId` field for v1 — see section 2 (Accounts). If multi-user
self-hosting is ever added, it should be an additive column plus a
filter at the query layer, not a data-model rewrite.

```typescript
type Track = {
  id: string;
  type: "video" | "audio" | "subtitle";
  clips: Clip[];
};
```

```typescript
type Clip = {
  id: string;
  assetId: string;

  sourceStart: number;
  sourceEnd: number;

  timelineStart: number;
  timelineEnd: number;
};
```

Never store only the final rendered video as the project state.

The project must be represented as editable operations/timeline state.

---

# 10. Transcript Model

Transcript must support word-level timestamps.

Example:

```typescript
type TranscriptWord = {
  id: string;
  text: string;
  start: number;
  end: number;
};
```

```typescript
type TranscriptSegment = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
};
```

Example:

```json
{
  "text": "Hello everyone",
  "start": 10.42,
  "end": 11.92,
  "words": [
    {
      "text": "Hello",
      "start": 10.42,
      "end": 10.91
    },
    {
      "text": "everyone",
      "start": 10.95,
      "end": 11.92
    }
  ]
}
```

Word timestamps are critical because transcript edits must map accurately to video timestamps.

---

# 11. Transcript → Timeline

When a user deletes transcript text:

```text
Deleted words
      ↓
Find start/end timestamps
      ↓
Create cut operation
      ↓
Update timeline
      ↓
Preview video
```

Example:

```text
Transcript:

Hello everyone [DELETE] um basically [/DELETE]
today we are learning AI.
```

If:

```text
um = 12.42 - 12.71
basically = 12.75 - 13.31
```

Create:

```json
{
  "type": "cut",
  "start": 12.42,
  "end": 13.31
}
```

---

# 12. Video Processing

Use FFmpeg.

FFmpeg is responsible for actual rendering.

The application should generate a deterministic media-processing plan.

Example:

```text
Project
 ↓
Edit operations
 ↓
Media processing plan
 ↓
FFmpeg
 ↓
Output MP4
```

Do not expose shell execution to users.

Sanitize and validate all FFmpeg parameters — this matters even more
locally than it would behind a cloud API, since FFmpeg now runs as a
child process on the same machine as everything else (see section 18).

---

## Podcast audio cleanup

Per-project `AudioSettings` (`server/src/types/audio-settings.ts`, stored as
`Project.audioSettingsJson`): loudness target (off / -16 / -14 LUFS), noise
reduction (afftdn), speaker leveling (dynaudnorm) and an 80Hz high-pass.
Enums/booleans only, mapped to fixed filter strings in
`lib/ffmpeg/audio-filters.ts`. Loudness is set by measured gain + a peak
limiter at -2 dBTP, not loudnorm's linear mode (which silently falls back
to dynamic mode and undershoots on peaky speech); `render-job.ts#resolveLoudnessGain`
measures and corrects with secant steps. Defaults are all off, so exports
are unchanged unless a user opts in.

## Podcast publishing

`PublishingMeta` (one per project) holds AI-generated, user-editable
chapters and show notes (`server/src/types/publishing.ts`). The model
(gpt-4o-mini) only returns text and *sentence indices* -- chapter starts
come from those sentences' own timestamps, never from a time the model
wrote. Chapters are stored in **source** time and mapped onto the edited
timeline when shown or exported (`lib/publishing/chapters.ts`), so later
cuts don't strand them. Every export (MP4, and MP3 at 44.1kHz/192k) embeds
the episode title and chapters via a generated FFMETADATA file; WAV can't
hold chapters. AI output never changes the edit.

## Speaker detection

An explicit "Detect speakers" action, not part of transcription: the
diarization model (`gpt-4o-transcribe-diarize`, behind `lib/ai/diarize.ts`)
runs at about half real time. It returns speaker-labeled spans but no word
timings, so Whisper stays the source of truth for words; diarization only
decides who said each word (`lib/ai/speakers.ts#assignSpeakers`), splitting
segments where the speaker changes. Labels are only consistent within one
API call, so `lib/ai/diarization-job.ts` keeps them consistent across
~10-minute chunks two ways: reference clips of the first chunk's voices
(`known_speaker_names`), and a 45s overlap between chunks used to match any
label the references missed. Results land in the existing `segment.speaker`
field ("Speaker 1", ...), so captions, exports and show notes use them with
no changes. Cutting a speaker is ordinary cut operations. Known limit:
similar-sounding voices can merge into one speaker.

## Clips / Shorts

`Clip` rows are source-time ranges with an aspect (9:16, 1:1, 16:9), a
horizontal crop position and a captions toggle. "Find highlights" is the
one feature routed to GPT-5.6 Luna (`gpt-5.6-luna`, section 4: selecting
important sections); like chapters, the model returns sentence indices,
never times, and `lib/clips/clips.ts#highlightsFromPicks` enforces length
(15-90s), whole sentences and no overlaps. A clip renders through the
normal export as the project **plus two extra cuts** (everything before
and after it), so the project's own edits and audio cleanup apply inside
it; `plan.ts` then crops/scales to the clip frame, and captions are
re-cut into 3-4 word Shorts cues laid out for that frame (the ASS script
resolution must match the output aspect, or libass stretches glyphs).

## Scenes and title cards

Scenes are derived, never stored: the ranges between `split` operations
(`lib/timeline/scenes.ts`); a split at exactly 0 only names the first
scene. New splits snap to the middle of a gap between words.

A `card` operation inserts a full-screen title card (template, title,
subtitle, 1-10s, solid color) before the content at its source time `at`
-- a scene start, 0 for an intro, the duration for an outro. Cards add
time that isn't in the source, so there are three clocks: source, edited
(cuts removed, `cuts.ts`) and **program** (edited plus cards,
`lib/timeline/program.ts`, duplicated client/server). Code that already
works in edited time (captions, chapters, transcript export) shifts into
program time through `editedToProgramTime`, so cuts and cards compose
without knowing about each other. A card whose whole scene is cut is
dropped with it. Clips skip cards.

Rendering: each card is an ffmpeg `color` source at the source's size and
frame rate, joined with the same xfade chain as cuts; all card text is
one generated `.ass` file (`lib/cards/ass.ts`) burned in over the program
before captions and the logo. User text only ever reaches ffmpeg inside
that file, and the API refuses braces, backslashes and control
characters. The preview can't insert frames into a `<video>`, so
`useCardPlayback.ts` pauses the video where a card plays, shows
`CardPreview` (same layout percentages, `lib/cards/layout.ts`) on its own
clock, then resumes.

A `transition` operation styles the join into the scene starting at its
`at` (both joins around that scene's card, if it has one): dip to black,
dip to white, or crossfade (only with a card -- between two stretches of
footage that follow each other in the source it shows nothing, so it
falls back to a cut). At 0 it fades the episode in, at the end it fades
it out. **Transitions never change the program's length**, so captions
and chapters need no adjusting: a dip fades each side's own edge
(`fade`/`afade`, audio capped at 0.3s next to speech) and keeps the
usual join, and a crossfade's overlap is added to the card's rendered
length (`plan.ts#layoutProgram`). The preview draws them with
`TransitionOverlay` from the pure `transition-look.ts`, on its own
animation-frame loop; audio fades aren't previewed.

**Scene suggestions** are explicit buttons that only ever propose:
"Suggest scenes" (gpt-4o-mini, sentence indices and titles only --
`lib/ai/scenes.ts`, validated by `lib/scenes/suggest.ts`: whole
sentences, the first scene at 0, at least 45s apart, boundaries in the
silence before a sentence) and "From chapters" (client-side, no AI).
Shot-change detection (`lib/ffmpeg/shots.ts`, a `shots` TranscriptionJob
storing its times in `resultJson`) scores frames at 320px wide; a
suggestion within 1.5s of a cut -- and not inside a word -- moves onto
it. The user reviews the list and Apply adds the kept splits (and
optional numbered chapter cards) as one undo step, renaming a split
already within 1s instead of adding a sliver.

**B-roll**: `media` assets (many per project, stored under a unique
prefix, with name/size/length columns) placed by `overlay` operations:
an asset shown from `start` to `end` in source time (so it follows cuts),
full screen (scaled to fill, cropped) or picture-in-picture (32% wide,
4% inset, a chosen corner). Placed on program time like captions
(`program.ts#placeOverlays`), composited as extra ffmpeg inputs after the
join and grade, before any clip reframe, card text, captions and logo --
an image looped for its slot, a video trimmed from its offset holding its
last frame. B-roll audio is never used. It plays in clips too.

**ffmpeg 9 xfade gotchas** (`plan.ts`, measured on 9.0.2): every segment
must be pinned to the source's frame rate with `fps=` (without it xfade
drops the start of each later segment), must not get a `settb` after
that (brings the bug back), and every segment but the last is padded
with `tpad` clone frames (a segment a frame short of its computed length
otherwise ends the whole chain at that join).

---

# 13. Architecture (local-first)

No cloud account is required to run or develop this project.

The app is two local processes, not one: a Vite-built React SPA
(`client/`, no server-side rendering) and a Bun/Hono backend (`server/`)
that owns the database, filesystem, FFmpeg, and AI calls. `pnpm run dev`
from the repo root runs both together; in production the built client is
served as static files, optionally by the same Bun process. This split —
no server rendering, one deployable backend unit with a clear entrypoint
— exists so the backend can later run as a Tauri sidecar for a native Mac
app release; nothing about "no cloud account" or "local-first" changes,
it's still one machine, one data directory, no accounts.

* **Database:** SQLite via Prisma, using the `@prisma/adapter-libsql`
  driver adapter (chosen over `better-sqlite3` specifically to avoid
  native-binding packaging pain under Bun/Tauri). Still a single file, no
  server process, no connection string to configure.
* **Storage:** the local filesystem, under a configurable data directory
  (see section 15).
* **Rendering:** FFmpeg, invoked as a local child process from the Bun
  backend (see section 14).
* **AI:** an LLM provider API key (OpenAI by default) for transcription and
  editing calls only — never for storage. Keep the provider behind a
  service interface (section 29) so it can be swapped.

Do not introduce Firebase, AWS, or GCP. If someone wants to deploy this
somewhere (a VPS, a container, a home server), that should work by
pointing the data directory at a persistent volume — no rewrite required.
Cloud-native scaling (managed Postgres, object storage, a real job queue)
is a legitimate future path (see section 29) but is not a v1 requirement,
and shouldn't be added speculatively.

---

# 14. Rendering Architecture

Do not perform long-running FFmpeg rendering inside the main API request.

Use:

```text
Frontend
   ↓
Hono API route (Bun)
   ↓
Create RenderJob row (SQLite, status: "queued")
   ↓
Kick off a local async render task
   ↓
FFmpeg (child process)
   ↓
Write output to local disk
   ↓
Update RenderJob row
   ↓
Frontend polls for status
```

Render status:

```typescript
type RenderStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";
```

For v1 (single local user, one render at a time is fine), an in-process
async task kicked off from the API route and tracked via the `RenderJob`
row is sufficient — there's no need for Pub/Sub, Cloud Run Jobs, or a
separate worker process. Only reach for a real job queue (e.g. a
SQLite-backed queue, or BullMQ + Redis) if concurrent renders become an
actual requirement, not preemptively.

---

# 15. Storage

Use the local filesystem, rooted at a configurable data directory (an env
var, e.g. `DATA_DIR`, defaulting to `./data`) so self-hosters can point it
at a mounted volume.

Recommended structure:

```text
data/
  projects/{projectId}/
    original/
    proxy/
    audio/
    thumbnails/
    renders/
```

No `users/{userId}/` prefix for v1 (see section 2). `data/` must be
gitignored — it holds user media, not source.

Original videos must never be overwritten.

Rendered outputs should be separate files.

---

# 16. Proxy Video

For MVP, support a proxy workflow if practical.

Example:

```text
Original 1080p/4K
       │
       ├── Original → local disk
       │
       └── Proxy → Editor
```

The editor should use the proxy where possible.

Final rendering should use the original media.

---

# 17. Database Schema (SQLite via Prisma)

Suggested Prisma models:

```text
Project

Asset          — belongs to Project

Transcript     — belongs to Project

EditOperation  — belongs to Project

RenderJob      — belongs to Project

TranscriptionJob — belongs to Project (background chunked transcription status/progress)
```

No `User` model, no ownership checks for v1 (see section 2) — every
project belongs to the one local user implicitly. Still key every table
by `projectId` with a foreign key and cascading delete, so the schema
stays relationally sound and an `ownerId` column could be added later
without restructuring anything.

---

# 18. Security

Even without accounts, this is still an app that runs FFmpeg and touches
the filesystem on the user's behalf — validate accordingly:

Never trust client-provided:

* project id (must exist, and resolve only to paths under the data directory)
* storage path (reject any path that escapes the data directory — no `..` traversal)
* render parameters

Specifically:

* Sanitize and validate all FFmpeg parameters — never interpolate
  user/AI-provided strings directly into a shell command (see section 6).
* Validate every file path against the configured data directory root
  before reading or writing.
* Never commit `.env` or API keys. This matters more, not less, for an
  OSS repo — contributors must never commit their own local
  `OPENAI_API_KEY`. Keep `.env*` gitignored and ship a `.env.example`.
* Never expose model API keys in the browser — API calls happen only in
  server-side route handlers.

**OSS self-hosting note:** v1 has no authentication (section 2). That's a
reasonable default for running the app on your own machine, and a real
risk if you expose it to a network beyond that — don't put the no-auth
version on the public internet or a shared network without adding real
authentication first.

---

# 19. Frontend State

Use Zustand for editor state.

Possible stores:

```text
useProjectStore
useTimelineStore
useTranscriptStore
usePlayerStore
useEditorHistoryStore
useAIStore
```

The editor should support:

* undo
* redo
* seek
* transcript selection
* clip selection
* play/pause
* timeline zoom

---

# 20. Undo / Redo

Every edit should be represented as an operation.

Example:

```text
Operation 1
Operation 2
Operation 3
```

Undo removes/reverts the latest operation.

Do not mutate the original video file for every edit.

---

# 21. API Design

Example endpoints:

```text
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id

POST   /api/projects/:id/upload
POST   /api/projects/:id/transcribe          (202 + jobId; runs in the background)
GET    /api/projects/:id/transcribe/:jobId   (status + chunk progress)

GET    /api/projects/:id/video[?variant=proxy]
GET    /api/projects/:id/audio               (extracted speech track, for the waveform)

GET    /api/projects/:id/transcript

POST   /api/projects/:id/operations
DELETE /api/projects/:id/operations/:operationId

POST   /api/projects/:id/render                 (body: format mp4|mp3|wav, captions)
GET    /api/projects/:id/render/:jobId
POST   /api/projects/:id/render/audio-preview   (15s before/after sample of the audio settings)

GET    /api/projects/:id/publishing                 (chapters on the edited timeline + show notes)
POST   /api/projects/:id/publishing/chapters        (AI-generate)   PUT (save user edits)
POST   /api/projects/:id/publishing/show-notes      (AI-generate)   PUT (save user edits)
GET    /api/projects/:id/transcript/export?format=txt|md

POST   /api/projects/:id/speakers/detect         (202 + jobId; background speaker detection)
GET    /api/projects/:id/speakers/detect/:jobId
POST   /api/projects/:id/speakers/rename         ({from, to|null} on every segment)

GET    /api/projects/:id/clips
POST   /api/projects/:id/clips/highlights        (GPT-5.6 Luna picks; replaces earlier AI picks)
POST   /api/projects/:id/clips                   PATCH/DELETE /api/projects/:id/clips/:clipId
(render a clip: POST /api/projects/:id/render with {clipId})

GET    /api/projects/:id/media                    (media library: images and clips for B-roll)
POST   /api/projects/:id/media?filename=          (raw body, image/png|jpeg|webp or video/*; probed, refused if unreadable)
GET    /api/projects/:id/media/:assetId/file      DELETE /api/projects/:id/media/:assetId (409 while B-roll uses it)

POST   /api/projects/:id/scenes/shots            (202 + jobId; background shot-change detection)
GET    /api/projects/:id/scenes/shots            (latest detection)   GET /api/projects/:id/scenes/shots/:jobId
POST   /api/projects/:id/scenes/suggest          (gpt-4o-mini scene suggestions for review; never applied server-side)
```

(No `POST /api/projects/:id/ai/edit` — the free-text AI command bar this
would have backed was removed; see section 3's status note.)

`POST /api/projects/:id/upload` takes the raw video body (`Content-Type:
video/*`, filename via a `?filename=` query param), not
`multipart/form-data` — this lets the server stream the body straight to
disk (`Bun.write`) without buffering the whole upload in memory.

Use typed request/response schemas.

Prefer Zod.

---

# 22. AI Response Schema

Never accept arbitrary text as an edit plan.

Use structured output.

Example:

```typescript
const editPlanSchema = z.object({
  operations: z.array(
    z.object({
      type: z.enum([
        "cut",
        "trim",
        "split",
        "caption"
      ]),
      start: z.number().optional(),
      end: z.number().optional(),
      reason: z.string().optional()
    })
  )
});
```

Validate every model response.

---

# 23. Error Handling

AI failures must never corrupt the project.

If the model produces:

```text
invalid JSON
invalid timestamp
unsupported operation
```

do not apply the operation.

Return:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EDIT_PLAN",
    "message": "The requested edit could not be safely applied."
  }
}
```

---

# 24. Observability

LangSmith (or an equivalent) is useful for AI traces, but it's a
third-party SaaS — keep it **optional and opt-in**, disabled by default,
enabled via an env var. An OSS tool people self-host shouldn't silently
phone traces home.

When enabled, track:

* model used
* latency
* token usage
* input
* structured output
* validation failures
* tool calls
* retry count
* final result

The goal is to understand:

```text
cost
latency
quality
failure rate
```

for GPT-4o-mini vs GPT-5.6 Luna.

Do not log sensitive video/transcript content unnecessarily.

---

# 25. Testing

Prioritize deterministic tests.

## Unit tests

Test:

* timestamp conversion
* transcript mapping
* cut operations
* timeline operations
* edit-plan validation
* FFmpeg command generation

## AI tests

Create a fixed evaluation dataset:

```text
"Remove the first 10 seconds"
"Remove filler words"
"Cut the pricing section"
"Make this shorter"
"Remove everything after 5 minutes"
```

Check that the generated operations are valid.

AI output must never be considered correct merely because the model returned valid JSON.

---

# 26. MVP UI

Build only these screens (no login screen — the dashboard is the entry point):

### Dashboard

```text
Projects

[+ New Project]

Project A
Project B
Project C
```

### Editor

```text
┌──────────────────────────────────────────────┐
│ Project Name                     Export      │
├───────────────────────┬──────────────────────┤
│                       │                      │
│                       │ Transcript           │
│       Video           │                      │
│                       │ Hello everyone...    │
│                       │ Today we...          │
│                       │                      │
├───────────────────────┴──────────────────────┤
│ Timeline                                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
└──────────────────────────────────────────────┘
```

No free-text "Ask AI" bar (see section 3's status note) -- AI actions
(filler-word removal, silence removal) are explicit buttons in the
transcript/timeline panels, not an open text field.

Do not build a huge traditional Premiere/Final Cut-style editor initially.

The transcript is the primary editing interface.

---

# 27. MVP AI Features

Implement in this order:

### 1. Trim

```text
"Remove the first 30 seconds."
```

### 2. Transcript deletion

Delete transcript → delete corresponding video section.

### 3. Filler-word removal

Examples:

```text
um
uh
you know
basically
like
```

Do not blindly remove words such as "like" when they are semantically meaningful.

### 4. Silence removal

Detect long pauses and create cut operations.

### 5. Natural-language editing -- removed (see section 3's status note)

Built and verified, then deliberately removed in favor of scoped,
explicit AI actions instead of an open text field. Left here for
history; not part of the current app.

### 6. Export

Render final MP4.

---

# 28. Explicitly Out of MVP

Do NOT initially build:

* collaborative editing
* AI avatar
* voice cloning
* advanced color grading
* advanced transitions
* generative video
* AI-generated B-roll
* automatic social-media publishing
* complex animation system
* multi-user real-time editing
* mobile application
* GPU rendering
* full Descript feature parity

These can be added later.

---

# 29. Future AI Features

After MVP is stable:

```text
AI Director
    ↓
Understand entire video
    ↓
Identify important moments
    ↓
Create highlights
    ↓
Generate Shorts
    ↓
Generate captions
    ↓
Generate B-roll
    ↓
Generate title/description
```

Potential future integrations:

* AI video generation
* AI voice generation
* voice enhancement
* background removal
* speaker detection
* scene understanding
* automatic reframing
* multilingual dubbing

Keep these integrations behind clear service interfaces so providers can be changed later.

Potential future infrastructure (only if a real need appears — see
section 30):

* an optional Postgres backend, for anyone who outgrows SQLite
* an optional cloud storage backend (S3-compatible), for anyone who
  doesn't want to keep media on the local disk
* a real background job queue, if concurrent rendering becomes necessary

Keep these behind the same storage/queue interfaces the local
implementation uses, so they're additive rather than a migration.

---

# 30. Coding Principles

### Prefer simple architecture.

Do not introduce infrastructure without a concrete requirement.

### Type everything.

Use TypeScript throughout the application.

### Keep AI deterministic where possible.

Temperature should be low for structured editing tasks.

### Separate AI from execution.

LLMs produce plans.

Application code executes plans.

### Make operations reversible.

Every edit should support undo/redo.

### Keep rendering asynchronous.

Never block the API request on FFmpeg.

### Validate everything.

Validate:

* user input
* model output
* timestamps
* file paths (stay inside the data directory)
* rendering parameters

### Optimize for MVP.

A working transcript-based editor is more valuable than an unfinished full-featured video editor.

---

# 31. Repository Structure

Two packages in one pnpm workspace — `client/` (Vite + React, no server
rendering) and `server/` (Bun + Hono, owns the database/filesystem/
FFmpeg/AI calls):

```text
client/
├── index.html
├── vite.config.mts
└── src/
    ├── main.tsx, App.tsx          (entry, React Router root)
    ├── routes/                    (DashboardRoute, EditorRoute, NewProjectRoute, ...)
    ├── components/
    │   ├── editor/
    │   ├── timeline/
    │   ├── transcript/
    │   └── video-player/
    ├── lib/                       (dual-use pure logic also needed server-side:
    │                                video/, timeline/cuts.ts + sentences.ts,
    │                                captions/style.ts + generate.ts — duplicated,
    │                                not imported, across the client/server boundary)
    ├── types/
    └── stores/                    (Zustand: project, timeline, transcript, player, caption-style)

server/
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts                   (Hono app entrypoint)
    ├── routes/                    (one file per resource, mounted under /api/projects)
    └── lib/
        ├── db/                    (Prisma client, @prisma/adapter-libsql)
        ├── ai/                    (Whisper transcription, filler-word detection)
        ├── ffmpeg/                (render-job orchestrator, argv builder, execFile wrapper)
        ├── storage/               (local filesystem helpers)
        ├── validation/            (Zod request schemas)
        └── captions/, video/, timeline/  (server's copy of the dual-use logic above)
```

No `agents/`/`lib/langgraph/` directory exists in either package — the
LangGraph Director/Editor/Validator pipeline (sections 5–8) was built,
verified, then deliberately removed per section 3's status note. It's not
part of the current app; treat sections 5–8 as a historical design record,
not a structure to scaffold.

---

# 32. Definition of Done

The MVP is complete when a user can:

```text
Create project
  ↓
Upload a video
  ↓
Wait for transcription
  ↓
See video + transcript
  ↓
Delete transcript text
  ↓
See corresponding video section removed
  ↓
Click "Find filler words" (or "Find long pauses")
  ↓
Review flagged words
  ↓
Remove them
  ↓
Preview
  ↓
Export MP4
```

The entire workflow must work end-to-end, entirely locally, before adding
advanced AI features.

---

# 33. Core Product Principle

The product should feel like:

> **"I don't need to learn video editing. I can just tell the editor what I want."**

The traditional timeline remains available, but AI + transcript should be the primary interaction model.

Build the smallest reliable version of this experience first.

---

# 34. Commit Discipline (OSS)

This project is open source. Git history is public-facing documentation,
not just internal bookkeeping — treat every commit as something a
stranger will read, because eventually one will.

## Before every commit

* Run `git status` and review the actual diff (not just what you *meant*
  to change) before staging anything.
* Never commit `.env` files, API keys, tokens, or any other secret, even
  temporarily. Check by eye — don't rely on `.gitignore` alone to catch a
  mistake.
* Never commit `data/`, `node_modules/`, generated build output, or the
  SQLite database file. These are gitignored on purpose (section 15) —
  if one shows up as unstaged/untracked and you're not sure why, stop and
  find out before adding it.
* Never commit real user-uploaded video/audio/transcript content used for
  local testing. Test fixtures that do get committed must be synthetic
  (e.g. generated speech), never a real recording or real personal data.
* Make sure commit messages and code comments don't leak personal
  information — real names, email addresses, local machine paths, etc. —
  beyond what's already intentionally public in the repo.

## Shape of a commit

* Prefer several small, logically atomic commits over one large one — one
  commit per concern (schema, storage layer, API routes, frontend wiring,
  and so on), mirroring how the feature was actually built, the way a
  careful human contributor would submit a PR.
* Each commit message explains *why*, not just *what* — the diff already
  shows what changed; the message is for the part that isn't obvious from
  the code.
* Every commit should build and lint cleanly on its own. Don't commit a
  known-broken intermediate state, even if a later commit in the same
  batch fixes it.
* Never rewrite or force-push history that's already been pushed to
  `main`.

None of this is optional polish. For an OSS project, the commit history
is part of what contributors read to understand the codebase — treat it
with the same care as the code itself.

---

# 35. Mac App Packaging (Tauri)

A native macOS `.app` build exists at `client/src-tauri/`, wrapping the
Vite client + Bun backend with Tauri v2, built and released via CI
(`.github/workflows/build-macos-app.yml`) and downloadable from the
docs site. **Scope: ad-hoc signed (no paid Apple Developer account),
Apple Silicon (arm64) only, no notarization** — a deliberate choice,
not an oversight: downloaders hit Gatekeeper's "unidentified
developer" warning and need to right-click → Open once (documented on
the download page). Real Developer ID signing + notarization + a
universal (Intel) build are legitimate future steps, not something to
add speculatively.

## Architecture

Rather than a compiled standalone sidecar binary (Tauri's usual
pattern), the app spawns the **system-installed `bun`** to run a staged
copy of the backend, for one specific reason: `bun build --compile`
(the mechanism for a self-contained sidecar binary) has a known,
unresolved upstream bug with `@libsql`, this project's SQLite driver —
confirmed via `oven-sh/bun` issue #18909. Compiling would need a much
bigger rewrite (dropping `@prisma/adapter-libsql` entirely); spawning
the already-installed runtime instead sidesteps the bug completely,
at the cost of requiring Bun to already be on the machine running the
app — a non-issue for this personal-use-only scope.

* `scripts/prepare-server-bundle.sh` stages a self-contained copy of
  the backend at repo-root `server-bundle/` (gitignored): server
  source (unbundled — Bun runs `.ts` directly), a **hoisted** (flat,
  npm-style, zero symlinks) `node_modules`, the generated Prisma
  client, the built Vite client, and a pre-migrated empty
  `app.db.template`. The node-linker choice matters: pnpm's default
  nested/symlinked `node_modules` (even via `pnpm deploy`, which does
  correctly resolve the full dependency graph) breaks once Tauri's own
  resource-bundler copies it into the `.app` — confirmed empirically
  that Tauri's copy step silently drops directories only reachable via
  a symlink. `pnpm install --config.node-linker=hoisted` avoids the
  problem at the source instead of working around Tauri's copier.
  **`server/.env` is deliberately never copied into the bundle** — see
  the OpenAI API key note below.
* `client/src-tauri/tauri.conf.json`'s `build.frontendDist` is a URL
  (`http://localhost:3001`), not a static path — the packaged app's
  window loads directly from the spawned Bun server, which serves both
  the built static client and the `/api/*` routes on one origin,
  exactly like the dev proxy does. `beforeBuildCommand` builds the
  client and runs the staging script (`cd .. && pnpm --filter client
  build && bash scripts/prepare-server-bundle.sh`) — Tauri hook
  commands run from the frontend package directory (`client/`), so
  `cd ..` alone reaches the repo root; an earlier version of this
  config had an absolute machine-specific path here instead, which
  worked locally but would have failed on any CI runner.
* `client/src-tauri/src/lib.rs`'s `setup()` hook resolves
  `resource_dir()`/`app_data_dir()`, seeds the database from
  `app.db.template` on first launch only (never overwrites existing
  data), spawns `bun run src/index.ts` from the staged bundle via
  `tauri-plugin-shell` with `DATABASE_URL`/`DATA_DIR`/`PORT`/
  `FFMPEG_PATH` pointed at the right places, creates the main window
  hidden and reveals it once the server's own "server listening" log
  line appears (avoids a startup race against the window trying to
  load a server that isn't up yet), and kills the spawned process on
  `RunEvent::Exit` (not `ExitRequested` — a normal macOS quit skips
  straight to `Exit`).

## Building it

```bash
cd client
pnpm exec tauri build
```

Produces both `client/src-tauri/target/release/bundle/macos/AI Video
Editor.app` and a `.dmg` alongside it (`bundle.targets` includes both).
Since it's ad-hoc signed rather than signed with a real Developer ID,
launch it with right-click → Open the first time (a plain double-click
triggers Gatekeeper's "unidentified developer" block) — this applies
whether you built it yourself or downloaded a release.

CI (`.github/workflows/build-macos-app.yml`) runs this same command on
`macos-latest` for every `v*.*.*` tag push, uploads the result as a
workflow artifact on every run (including manual `workflow_dispatch`,
for testing without touching anything public), and additionally
attaches it to the matching GitHub Release when the run was a real tag
push. No Apple secrets needed — ad-hoc signing requires no certificate
or notarization credentials.

## The OpenAI API key

Not baked into the build. Each person who runs the app (whether built
locally or downloaded) is asked for their own key on first launch —
see `server/src/lib/settings.ts` (`DATA_DIR/settings.json`, checked
before falling back to `server/.env`'s `OPENAI_API_KEY` for local dev)
and `client/src/routes/SetupRoute.tsx`. An earlier version of this
build did copy `server/.env` — including a real key — into every
bundle; that was fine while builds never left the developer's own
machine, but had to change once the app became publicly downloadable,
since anyone could otherwise have extracted the key from the bundle.

## Known constraints

* App data lives at `~/Library/Application Support/com.local.aivideoeditor/`,
  separate from whatever's in `server/data/` during local dev — the
  packaged app starts with an empty project list on first launch, not
  a copy of your dev data.
* `FFMPEG_PATH` and the `bun` executable path are hardcoded in
  `lib.rs` to the standard Homebrew/Bun install locations on any
  Apple Silicon Mac (`/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`,
  `~/.bun/bin/bun`) — not this-machine-specific, but they are real
  prerequisites: anyone running the app (built locally or downloaded)
  needs Bun and Homebrew's `ffmpeg-full` already installed, documented
  on the docs site's download page.

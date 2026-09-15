# CLAUDE.md

## Project: AI Video Editor MVP

Build a web-based, AI-powered video editor inspired by Descript.

The core product idea is:

> **Edit video by editing its transcript and by giving natural-language commands to an AI editor.**

The MVP should prioritize a reliable transcript ↔ video editing workflow over advanced visual effects.

---

# 1. Product Goal

Users should be able to:

1. Sign up/login.
2. Create a video project.
3. Upload a video.
4. Automatically transcribe the video.
5. View the video and transcript side-by-side.
6. Edit/delete transcript sections.
7. Automatically reflect transcript edits on the video timeline.
8. Give natural-language editing commands.
9. Let AI convert commands into structured edit operations.
10. Preview the result.
11. Render/export the final video.

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

### Authentication

* Google authentication
* Email/password authentication if straightforward
* Firebase Authentication

### Projects

* Create project
* Rename project
* Delete project
* List user's projects

### Video Upload

* Upload video to Firebase Storage
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

Use only two LLMs in the MVP.

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
  userId: string;
  name: string;
  duration: number;

  assets: Asset[];
  tracks: Track[];

  transcriptId?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

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

Sanitize and validate all FFmpeg parameters.

---

# 13. Cloud Architecture

Use Google Cloud / Firebase.

Do not introduce AWS.

## Firebase

Use:

* Firebase Authentication
* Firestore
* Firebase Storage / Google Cloud Storage

## Google Cloud

Use:

* Cloud Run
* Cloud Run Jobs
* Pub/Sub
* Cloud Logging
* Cloud Monitoring

Potential later additions:

* Cloud SQL PostgreSQL
* pgvector
* Memorystore Redis
* Cloud CDN

---

# 14. Rendering Architecture

Do not perform long-running FFmpeg rendering inside the main API request.

Use:

```text
Frontend
   ↓
Cloud Run API
   ↓
Create render job
   ↓
Firestore
   ↓
Pub/Sub
   ↓
Cloud Run Job
   ↓
FFmpeg
   ↓
Cloud Storage
   ↓
Update Firestore
   ↓
Frontend receives status
```

Render status:

```typescript
type RenderStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";
```

---

# 15. Storage

Use Firebase Storage / Google Cloud Storage.

Recommended structure:

```text
users/{userId}/
projects/{projectId}/
    original/
    proxy/
    audio/
    thumbnails/
    renders/
```

Original videos must never be overwritten.

Rendered outputs should be separate files.

---

# 16. Proxy Video

For MVP, support a proxy workflow if practical.

Example:

```text
Original 1080p/4K
       │
       ├── Original → Cloud Storage
       │
       └── Proxy → Editor
```

The editor should use the proxy where possible.

Final rendering should use the original media.

---

# 17. Firestore Structure

Suggested structure:

```text
users/{userId}

projects/{projectId}

projects/{projectId}/assets/{assetId}

projects/{projectId}/transcripts/{transcriptId}

projects/{projectId}/editOperations/{operationId}

projects/{projectId}/renderJobs/{renderJobId}
```

Keep user ownership checks on every project-related operation.

---

# 18. Security

Never trust client-provided:

* userId
* projectId
* asset ownership
* storage path
* render parameters

Firebase Security Rules must ensure users can only access their own projects/assets.

Cloud Run APIs must independently validate authentication and authorization.

Never expose model API keys in the browser.

Never expose service-account credentials.

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
POST   /api/projects/:id/transcribe

GET    /api/projects/:id/transcript

POST   /api/projects/:id/ai/edit
POST   /api/projects/:id/operations
DELETE /api/projects/:id/operations/:operationId

POST   /api/projects/:id/render
GET    /api/projects/:id/render/:jobId
```

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

Use LangSmith for AI traces.

Track:

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

Build only these screens:

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
├──────────────────────────────────────────────┤
│ Ask AI: "Remove all filler words..."         │
└──────────────────────────────────────────────┘
```

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

### 5. Natural-language editing

Examples:

```text
Remove the intro.

Keep only the section about LangGraph.

Make this shorter.

Remove the pricing discussion.
```

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
* desktop application
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
* project ownership
* media paths
* rendering parameters

### Optimize for MVP.

A working transcript-based editor is more valuable than an unfinished full-featured video editor.

---

# 31. Suggested Repository Structure

```text
src/
├── app/
│   ├── dashboard/
│   ├── editor/
│   └── api/
│
├── components/
│   ├── editor/
│   ├── timeline/
│   ├── transcript/
│   ├── video-player/
│   └── ai/
│
├── lib/
│   ├── firebase/
│   ├── ai/
│   ├── langgraph/
│   ├── ffmpeg/
│   ├── storage/
│   └── validation/
│
├── agents/
│   ├── director/
│   ├── editor/
│   └── validator/
│
├── types/
│   ├── project.ts
│   ├── transcript.ts
│   ├── timeline.ts
│   └── edit-operation.ts
│
└── stores/
    ├── project-store.ts
    ├── timeline-store.ts
    ├── transcript-store.ts
    └── editor-store.ts
```

---

# 32. Definition of Done

The MVP is complete when a user can:

```text
Sign up
  ↓
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
Ask AI:
"Remove all filler words"
  ↓
Review edit operations
  ↓
Preview
  ↓
Export MP4
```

The entire workflow must work end-to-end before adding advanced AI features.

---

# 33. Core Product Principle

The product should feel like:

> **"I don't need to learn video editing. I can just tell the editor what I want."**

The traditional timeline remains available, but AI + transcript should be the primary interaction model.

Build the smallest reliable version of this experience first.

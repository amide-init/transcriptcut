# AI Video Editor

Edit video by editing its transcript, and by giving natural-language
commands to an AI editor. **Local-first and open source** — runs entirely
on your machine, no cloud account required. See [`claude.md`](./claude.md)
for the full product spec and the
[issue tracker](https://github.com/amide-init/vdescript/issues) for
current build status.

## Status

The full transcript ↔ video editing loop works end to end: create a
project, upload a video, it's auto-transcribed with word-level
timestamps, delete text in the transcript and the matching section of the
video is cut — reflected on the timeline and skipped during playback,
with undo/redo, a live-updating waveform, and live caption preview. A
Descript-style filters drawer applies visual presets to the preview, and
export renders the final MP4 (optionally with burned-in, styled captions).

Local persistence (SQLite via Prisma) and project CRUD are built and in
use. The separate `server/` directory isn't — see the
[issue tracker](https://github.com/amide-init/vdescript/issues) for the
full breakdown of what's done vs. planned. Everything currently runs
inside the `client/` Next.js app, including the API routes.

There is no login — v1 is a single local user by design, not a gap to
fill in. **Don't expose this to a public or shared network** without
adding real authentication first; see `claude.md` section 18.

## Structure

```text
claude.md    — product spec
client/      — Next.js app (editor UI + API routes)
server/      — reserved for future use, not in use yet
```

## Running the client

Requires [FFmpeg](https://ffmpeg.org/download.html) on your machine
(used for cuts and export) and an OpenAI API key (used server-side only,
for transcription).

```bash
cd client
pnpm install
cp .env.example .env   # then fill in OPENAI_API_KEY
pnpm exec prisma generate
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000). See
[`.env.example`](./client/.env.example) for what each variable does, and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for more.

## Testing

Deterministic unit tests (Vitest) cover the core editing logic — timeline
cut/trim math, transcript-to-caption mapping, the ffmpeg render-plan
builder, path-traversal safety, and the CSS-preview/ffmpeg-export formula
parity work described in the issue tracker:

```bash
cd client
pnpm run test
```

CI runs the same command on every PR. There's no end-to-end/UI test suite
yet — see the issue tracker if that's something you'd like to help with.

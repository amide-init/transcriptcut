# AI Video Editor

Edit video by editing its transcript, and by giving natural-language
commands to an AI editor. **Local-first and open source** — runs entirely
on your machine, no cloud account required. See [`claude.md`](./claude.md)
for the full product spec and [`issues.md`](./issues.md) for current build
status.

## Status

The core transcript ↔ video editing loop works end to end: upload a video,
it's auto-transcribed with word-level timestamps, delete text in the
transcript and the matching section of the video is cut — reflected on the
timeline and skipped during playback, with undo/redo. A Descript-style
filters drawer applies visual presets to the preview.

Local persistence (SQLite via Prisma + the local filesystem), project
CRUD, and the separate `server/` are not yet built — see
[`issues.md`](./issues.md) for the full breakdown of what's done vs.
planned. Everything currently runs inside the `client/` Next.js app,
including the API routes.

There is no login — v1 is a single local user by design, not a gap to
fill in. **Don't expose this to a public or shared network** without
adding real authentication first; see `claude.md` section 18.

## Structure

```text
claude.md    — product spec
issues.md    — issue tracker / build status
client/      — Next.js app (editor UI + API routes)
server/      — reserved for future use, not in use yet
```

## Running the client

```bash
cd client
npm install
```

Add an OpenAI API key (used server-side only, for transcription) to
`client/.env`:

```bash
OPENAI_API_KEY=sk-...
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

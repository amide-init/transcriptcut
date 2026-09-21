# AI Video Editor

Edit video by editing its transcript, with a few explicit AI-assisted
actions (filler-word and long-pause removal) layered on top — **not** a
free-text "ask the AI to edit this" chat bar; an early version of that was
built and worked, then deliberately removed (see Status below and
`claude.md` section 3 for why). **Local-first and open source** — runs
entirely on your machine, no cloud account required. See
[`claude.md`](./claude.md) for the full product spec and the
[issue tracker](https://github.com/amide-init/vdescript/issues) for
current build status.

## Status

The full transcript ↔ video editing loop works end to end: create a
project, upload a video, it's auto-transcribed with word-level
timestamps, delete text in the transcript and the matching section of the
video is cut — reflected on the timeline and skipped during playback,
with undo/redo. The timeline shows zoomable frame thumbnails and a
live-updating waveform (both get denser, not just stretched, as you zoom
in).

Editing tools beyond manual transcript cuts:

- **Filler-word / long-pause detection** — algorithmic, not generative;
  flags candidates for one-click removal. An LLM call only classifies
  ambiguous single words ("like", "actually", ...) in context — it never
  proposes cuts on its own.
- **Filters** — a Descript-style drawer of color presets.
- **Properties** — manual saturation / temperature / tint / exposure /
  contrast / highlights / shadows sliders.
- **Elements** — a logo/watermark overlay (position, padding, opacity).
- **Captions** — font, size, color, position, and background-box styling,
  plus an optional word-by-word karaoke-style highlight.

Export renders the final MP4 with every preview effect above (filters,
properties, logo, captions) baked in — the CSS-preview ↔ ffmpeg-export
math for each is unit-tested (see Testing below) to catch the preview and
the actual export drifting apart, which happened in practice for several
of these (see the issue tracker's closed bugs).

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

### macOS quick start

[`scripts/setup-mac.sh`](./scripts/setup-mac.sh) installs Node/pnpm/FFmpeg
(with subtitle burn-in support) via Homebrew if you don't already have
them, installs dependencies, and walks you through `.env`:

```bash
git clone https://github.com/amide-init/vdescript.git
cd vdescript
./scripts/setup-mac.sh
```

Then `cd client && pnpm run dev`. Safe to re-run -- it only installs
what's missing and never overwrites an existing `.env`.

### Manual setup (any platform)

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

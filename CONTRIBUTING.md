# Contributing

Thanks for taking a look at this project. It's a small, local-first tool,
and contributions are welcome — bug fixes, features from the
[issue tracker](https://github.com/amide-init/transcriptcut/issues), or new
issues for bugs and ideas.

## Running it locally

On macOS, `./scripts/setup-mac.sh` handles all of this for you (Node/pnpm/
Bun/FFmpeg via Homebrew, `pnpm install`, `prisma generate`, and `.env`) --
see the README's "macOS quick start". Otherwise, manually:

```bash
pnpm install                  # installs deps for client + server
cd server
cp .env.example .env          # then fill in OPENAI_API_KEY
bunx prisma generate
cd ..
pnpm run dev                  # runs the Vite client and Bun backend together
```

Open [http://localhost:5173](http://localhost:5173). See
[`server/.env.example`](./server/.env.example) for what each variable
does.

You'll also need [FFmpeg](https://ffmpeg.org/download.html) and
[Bun](https://bun.sh) (the backend's runtime) on your machine. If burning
in captions fails with `No such filter: 'subtitles'`, your FFmpeg build
doesn't include libass — see the `FFMPEG_PATH` note in `.env.example` (or
just use `scripts/setup-mac.sh`, which installs and points at a build
that has it).

## Before submitting a PR

```bash
pnpm run lint
pnpm run test
pnpm run build
```

All three must pass — CI runs the same three commands on every PR. If
you're changing pure logic (timeline math, transcript mapping, ffmpeg
argument/filter-string building, validation, path handling), add or update
a test in the matching `*.test.ts` file in whichever package (`client/` or
`server/`) owns that code, rather than only checking it by hand --
`pnpm --filter client test:watch` or `pnpm --filter server test:watch`
re-runs on save.

## Project structure and conventions

[`claude.md`](./claude.md) is the full product spec and the source of
truth for scope, architecture, and conventions (local-first, no user
accounts in v1, agents reason/tools execute, etc.) — read it before
proposing anything that changes how the app is structured.

## Filing issues

Bug reports and feature ideas are both welcome as GitHub issues. For bugs,
include what you expected vs. what happened, and your OS/Node/FFmpeg
versions if it's a rendering or transcription issue.

## Security

This is a self-hosted tool with no built-in authentication (see `claude.md`
section 18) — that's a deliberate v1 choice for running on your own
machine, not something to "fix" by adding a login screen. If you find an
actual security issue (e.g. a path traversal, a way to reach outside
`DATA_DIR`), please open an issue describing it.

# Contributing

Thanks for taking a look at this project. It's a small, local-first tool,
and contributions are welcome — bug fixes, features from the
[issue tracker](https://github.com/amide-init/vdescript/issues), or new
issues for bugs and ideas.

## Running it locally

```bash
cd client
pnpm install
cp .env.example .env   # then fill in OPENAI_API_KEY
pnpm exec prisma generate
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000). See
[`.env.example`](./client/.env.example) for what each variable does.

You'll also need [FFmpeg](https://ffmpeg.org/download.html) on your
machine for transcript editing and export to work. If burning in captions
fails with `No such filter: 'subtitles'`, your FFmpeg build doesn't
include libass — see the `FFMPEG_PATH` note in `.env.example`.

## Before submitting a PR

```bash
cd client
pnpm run lint
pnpm run build
```

Both must pass — CI runs the same two commands on every PR.

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

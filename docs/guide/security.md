# Security & Self-Hosting

transcriptcut has no accounts and no login screen. That's a deliberate
simplicity choice for a self-hosted, single-local-user tool — not an
oversight. It does mean there are things to be careful about once the
app leaves your own machine.

## No auth in v1 — keep it off shared/public networks

Whoever can reach the app's HTTP port can use it as the one local user:
create projects, upload video, trigger renders, read/delete anything.
**Don't expose the no-auth version of this app to a public or shared
network without adding real authentication first.** Running it on
`localhost` on your own machine is the intended v1 use case.

## What the app validates, and why it matters more locally

Even without accounts, this is an app that runs FFmpeg and touches the
filesystem on your behalf, so it treats client-provided values as
untrusted input:

- **Project IDs** must exist and resolve only to paths under the
  configured data directory.
- **Storage paths** are rejected if they'd escape the data directory
  (no `..` traversal) — every file path is validated against the
  `DATA_DIR` root before it's read or written.
- **FFmpeg parameters** are sanitized and validated; user- or AI-provided
  strings are never interpolated directly into a shell command. FFmpeg
  always runs with explicit, typed arguments built by application code —
  see [AI-Assisted Editing](/guide/ai-editing) for the "agents reason,
  tools execute" rule this follows from.
- **Render parameters** go through the same validation before a render
  job is created.

This matters more, not less, for a locally-run tool: FFmpeg is a child
process on the *same machine* as your other data, not a request handled
behind a cloud API boundary.

## API keys

- `.env` is gitignored and must never be committed — this is worth
  double-checking by eye before every commit, not just trusted to
  `.gitignore`.
- Your LLM provider API key is used server-side only (in the Bun/Hono
  backend). It's never sent to the browser.
- `.env.example` documents every variable without real values, so
  contributors know what to fill in.
- The macOS app doesn't bake a key into the build — each person enters
  their own on first launch, stored only in that app's local data
  directory. See [Download](/download).

## If you're contributing

See [`CONTRIBUTING.md`](https://github.com/amide-init/transcriptcut/blob/main/CONTRIBUTING.md)
for the full checklist, and the [Community](/community) page for where
to ask questions. The short version: never commit `.env`, secrets,
`data/`, the SQLite database file, or real user-uploaded media — test
fixtures that do get committed must be synthetic, not real recordings.

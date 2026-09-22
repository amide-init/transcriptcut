# Community

transcriptcut is a small, local-first, open source project. Contributions
— bug fixes, new features, or just filing an issue — are welcome.

## Get help / ask a question

Open a [GitHub Discussion or Issue](https://github.com/amide-init/transcriptcut/issues) —
issues are used for both bug reports and questions/ideas on this project.
When filing a bug, include what you expected vs. what happened, and your
OS/Node/FFmpeg versions if it's a rendering or transcription issue.

## Report a bug

1. Check the [issue tracker](https://github.com/amide-init/transcriptcut/issues)
   to see if it's already been reported.
2. If not, open a new issue with repro steps and your environment.
3. Found an actual security issue (a path traversal, a way to reach
   outside `DATA_DIR`, a secret leaking to the browser)? Please still
   open an issue describing it — see
   [Security & Self-Hosting](/guide/security).

## Contribute code

1. Read [`CONTRIBUTING.md`](https://github.com/amide-init/transcriptcut/blob/main/CONTRIBUTING.md)
   and [`claude.md`](https://github.com/amide-init/transcriptcut/blob/main/claude.md)
   (the full product spec — read it before proposing anything that
   changes how the app is structured).
2. Set up locally with `./scripts/setup-mac.sh` (macOS) or the manual
   steps in [Getting Started](/guide/getting-started).
3. Before opening a PR, all of these must pass (CI runs the same three
   commands on every PR):

   ```bash
   cd client
   pnpm run lint
   pnpm run test
   pnpm run build
   ```

4. If you're changing pure logic (timeline math, transcript mapping,
   FFmpeg argument/filter-string building, validation, path handling),
   add or update a test in the matching `*.test.ts` file.

## Project values, briefly

These come up in review, so it's worth knowing them going in:

- **Local-first, always.** No Firebase/AWS/GCP, no required cloud
  account. See [Architecture](/guide/architecture).
- **Agents reason, tools execute.** An LLM never produces or runs raw
  FFmpeg/shell commands — only structured, validated edit operations.
  See [AI-Assisted Editing](/guide/ai-editing).
- **No free-text AI command bar.** This was tried, worked, and was
  deliberately removed in favor of scoped, explicit actions. See
  [AI-Assisted Editing](/guide/ai-editing) for why, before reintroducing
  it.
- **Transcript-first editing is the product**, not a traditional
  Premiere/Final Cut-style timeline editor bolted onto AI features.

## Good first areas to help with

- The end-to-end/UI test suite doesn't exist yet (only deterministic
  Vitest unit tests do) — see the issue tracker.
- The `server/` directory is reserved for a future split out of
  `client/` and isn't in use yet.
- Check the [Status](/status) page and issue tracker for what's
  currently open.

## License

[MIT](https://github.com/amide-init/transcriptcut/blob/main/LICENSE) —
use it, fork it, self-host it.

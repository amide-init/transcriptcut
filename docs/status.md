# Status

This page mirrors the README's status summary. For the authoritative,
up-to-date breakdown, see the
[issue tracker](https://github.com/amide-init/transcriptcut/issues).

## What works end to end

Create a project → upload a video → it's auto-transcribed with word-level
timestamps → delete text in the transcript and the matching section of
the video is cut — reflected on the timeline and skipped during playback,
with undo/redo (including restoring one specific cut word, segment, or
sentence, not just a blanket undo).

The timeline shows zoomable frame thumbnails and a live-updating waveform
— both get denser, not just stretched, as you zoom in.

## Editing tools beyond manual transcript cuts

| Feature | Notes |
| --- | --- |
| Filler-word / long-pause detection | Algorithmic, not generative. An LLM call only classifies ambiguous single words ("like", "actually", ...) in context. |
| Filters | A Descript-style drawer of color presets. |
| Properties | Manual saturation / temperature / tint / exposure / contrast / highlights / shadows sliders. |
| Elements | A logo/watermark overlay (position, padding, opacity). |
| Captions | Font, size, color, position, background-box styling, plus optional word-by-word karaoke-style highlight. |

Export renders the final MP4 with every preview effect above baked in —
the CSS-preview ↔ FFmpeg-export math for each is unit-tested to catch the
preview and the actual export drifting apart, which has happened in
practice for several of these (see the issue tracker's closed bugs).

## Persistence

Local persistence (SQLite via Prisma) and project CRUD are built and in
use.

## Testing

There's no end-to-end/UI test suite yet — only deterministic Vitest unit
tests (client + server), run on every PR in CI.

## macOS app

A native `.app` build (Tauri) is also available, built and released via
CI — see [Download](/download).

## No accounts

There is no login — v1 is a single local user by design, not a gap to
fill in. See [Security & Self-Hosting](/guide/security) before exposing
this to a public or shared network.

---

For anything more current than this page, the
[issue tracker](https://github.com/amide-init/transcriptcut/issues) and
[commit history](https://github.com/amide-init/transcriptcut/commits/main)
are the source of truth.

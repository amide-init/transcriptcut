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

## Podcast features

| Feature | Notes |
| --- | --- |
| Long episodes | Uploads up to 10 GB; background transcription in ~10-minute chunks with progress; 720p editing proxy for large sources. |
| Speaker detection | One button; rename a speaker everywhere; cut or restore everything one person said. Similar voices can merge. |
| Audio cleanup | -16 / -14 LUFS loudness targets, noise reduction, speaker leveling, rumble filter, 15-second before/after preview. |
| Publishing | AI chapters (built into MP4/MP3 exports, copyable for YouTube), AI show notes and title ideas, TXT/Markdown transcript, MP3/WAV export. |
| Clips / Shorts | AI highlight picks or clips from a transcript selection; 9:16, 1:1 or 16:9 with a positionable crop and Shorts-style captions. |

See the [Podcast Workflow](/guide/podcasting) guide for how they fit
together.

## Editing tools beyond manual transcript cuts

| Feature | Notes |
| --- | --- |
| Filler-word / long-pause detection | Algorithmic, not generative. An LLM call only classifies ambiguous single words ("like", "actually", ...) in context. |
| Filters | A Descript-style drawer of color presets. |
| Properties | Manual saturation / temperature / tint / exposure / contrast / highlights / shadows sliders. |
| Elements | A logo/watermark overlay (position, padding, opacity). |
| Captions | Font, size, color, position, background-box styling, plus optional word-by-word karaoke-style highlight. |

Export renders the final MP4 (or MP3/WAV) with every preview effect above baked in —
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

---
layout: home

hero:
  name: transcriptcut
  text: Edit video by editing its transcript
  tagline: >-
    Local-first and open source. Delete a sentence in the transcript, the
    matching cut lands on the timeline. No cloud account, no bill — just
    npm install and an LLM API key for transcription.
  image:
    src: /screenshots/editor-overview.png
    alt: transcriptcut editor showing video, transcript, and timeline
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: See Screenshots
      link: /screenshots
    - theme: alt
      text: View on GitHub
      link: https://github.com/amide-init/transcriptcut

features:
  - icon: 📝
    title: Transcript-first editing
    details: >-
      Select and delete text in the transcript and the corresponding
      section of the video is cut — reflected on the timeline and skipped
      during playback, with full undo/redo.
  - icon: 🎯
    title: Scoped AI actions, not a chat bar
    details: >-
      One-click filler-word and long-pause removal, backed by algorithmic
      detection (an LLM only disambiguates ambiguous single words like
      "like" in context). No open-ended "ask the AI to edit this" field —
      see why in the Guide.
  - icon: 🖥️
    title: Runs entirely on your machine
    details: >-
      SQLite via Prisma, local filesystem storage, FFmpeg as a child
      process. The only external call is to an LLM provider, for
      transcription and word classification — never for storage.
  - icon: 🎞️
    title: Zoomable timeline + waveform
    details: >-
      Frame thumbnails and a live waveform that get denser as you zoom in,
      not just stretched pixels.
  - icon: 🎨
    title: Filters, properties, captions, elements
    details: >-
      Color presets, manual color adjustment sliders, karaoke-style
      captions, and a logo/watermark overlay — all previewed live and
      baked into the final export.
  - icon: 🔒
    title: No accounts, by design
    details: >-
      v1 is a single local user. That's a deliberate simplicity choice for
      a self-hosted tool, not a gap — see the security guide before
      exposing it beyond your own machine.
---

## Why transcript-first?

Traditional video editors make you scrub a timeline to find the part you
want to cut. transcriptcut inverts that: the transcript **is** the
editing surface. Read the words, delete the ones you don't want, and the
video updates underneath you.

```text
Transcript:  Hello everyone [DELETE] um basically [/DELETE] today we are learning AI.
                                  ↓
Timeline:    a cut is created at the exact word-level timestamps of the deleted span
```

Word-level timestamps (from Whisper) make this mapping exact, not
approximate — see [Editing Workflow](/guide/editing-workflow) for how it
works end to end.

<div class="vp-doc" style="margin-top: 2rem;">

## Quick look

</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem;">
  <a href="/transcriptcut/screenshots"><img src="/screenshots/dashboard.png" alt="Project dashboard" style="border-radius:8px;border:1px solid var(--vp-c-divider);"/></a>
  <a href="/transcriptcut/screenshots"><img src="/screenshots/editor-overview.png" alt="Editor with video, transcript, and timeline" style="border-radius:8px;border:1px solid var(--vp-c-divider);"/></a>
</div>

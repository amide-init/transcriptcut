---
layout: home

hero:
  name: transcriptcut
  text: Edit video by editing its transcript
  tagline: >-
    Built for video podcasts. Delete a sentence in the transcript and the
    matching cut lands on the timeline, then get podcast-ready audio,
    speaker labels, chapters, show notes and Shorts from the same project.
    Local-first and open source: no cloud account, just your own OpenAI
    API key.
  image:
    src: /screenshots/hero.png
    alt: transcriptcut editor showing video, transcript, and timeline
  actions:
    - theme: brand
      text: Download for macOS
      link: /download
    - theme: alt
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Podcast Workflow
      link: /guide/podcasting
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
  - icon: 🎙️
    title: Made for long, multi-speaker episodes
    details: >-
      Multi-GB uploads, background transcription in chunks with progress,
      a 720p editing proxy, and speaker detection with one-click rename
      and "cut everything this person said".
  - icon: 🔊
    title: Podcast-ready audio
    details: >-
      Hit -16 or -14 LUFS, reduce noise, level a quiet guest against a
      loud host, remove rumble. Preview 15 seconds before and after, then
      bake it into the export.
  - icon: 📚
    title: Chapters, show notes, MP3
    details: >-
      AI chapters built into every MP4 and MP3 export and copyable as
      YouTube timestamps, editable show notes and title ideas, TXT/Markdown
      transcripts, and MP3/WAV export for your feed.
  - icon: 📱
    title: Shorts from the same edit
    details: >-
      AI finds the episode's best standalone moments. Render them as
      9:16 clips with big word-by-word captions and a crop you position on
      the video.
  - icon: 🎯
    title: Scoped AI actions, not a chat bar
    details: >-
      Every AI step is a specific button: filler words, speakers,
      chapters, show notes, highlights. Models return text and sentence
      picks, never timestamps or edits. No open-ended "ask the AI to edit
      this" field — see why in the Guide.
  - icon: 🖥️
    title: Runs entirely on your machine
    details: >-
      SQLite via Prisma, local filesystem storage, FFmpeg as a child
      process. The only external calls are to OpenAI, for transcription
      and the AI buttons — never for storage.
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

## Filler-word detection, in the same view

</div>

<a href="/transcriptcut/screenshots" style="display:block;margin-top:1rem;">
  <img src="/screenshots/ai-tools-panel.png" alt="AI tools panel with Find filler words and Find long pauses, flagged words underlined in the transcript" style="width:100%;border-radius:12px;border:1px solid var(--vp-c-divider);box-shadow:var(--vp-shadow-3);"/>
</a>

<p style="margin-top:0.75rem;"><a href="/transcriptcut/screenshots">See more screenshots →</a></p>

<style>
/* The default hero image slot is sized/masked for a small square logo.
   transcriptcut's hero image is a real UI screenshot, so give it room
   and drop the circular glow behind it. */
.VPHero .image {
  /* Default negative margins are calibrated to the old fixed-height
     logo slot; with a full-width screenshot (much taller) they pull
     the image up into the heading text instead. */
  margin: 24px 0 0 !important;
}
@media (min-width: 960px) {
  .VPHero .image {
    margin: 0 0 0 24px !important;
  }
}
.VPHero .image-container {
  width: 100% !important;
  max-width: 720px !important;
  height: auto !important;
  transform: none !important;
}
.VPHero .image-bg {
  display: none !important;
}
.VPHero .image-src {
  position: static !important;
  top: auto !important;
  left: auto !important;
  transform: none !important;
  width: 100% !important;
  max-width: 100% !important;
  max-height: none !important;
  height: auto !important;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  box-shadow: var(--vp-shadow-3);
}
</style>

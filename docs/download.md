# Download the macOS app

A native Mac app is available, built with [Tauri](https://tauri.app/) —
same editor, wrapped as a real `.app` you launch from Finder or Spotlight
instead of running `pnpm run dev` and opening a browser tab.

**Current scope: Apple Silicon (M1/M2/M3/M4) only.** No Intel build yet.

<div class="vp-doc" style="margin: 1.5rem 0;">
  <a href="https://github.com/amide-init/transcriptcut/releases/latest/download/AI-Video-Editor-macos-arm64.app.zip"
     style="display:inline-block;padding:0.75rem 1.5rem;border-radius:8px;background:var(--vp-c-brand-1);color:white;font-weight:600;text-decoration:none;">
    Download for macOS (Apple Silicon)
  </a>
</div>

Prefer a `.dmg` installer instead of a `.app.zip`? Grab it from the
[latest release page](https://github.com/amide-init/transcriptcut/releases/latest)
directly — its filename includes the version number, so it doesn't have
a permanent link the way the zip above does.

## Before you install

The app needs two things already on your Mac — the same prerequisites a
local dev setup uses, just without the rest of the dev toolchain:

```bash
# Bun -- the app spawns it to run its own backend
curl -fsSL https://bun.sh/install | bash

# FFmpeg with libass (subtitle burn-in) support, via Homebrew
brew install ffmpeg-full
```

Without these, the app will open but fail to actually start its backend
— see [Architecture](/guide/architecture) if you want the details of why.

## Opening it the first time

This build is **ad-hoc signed**, not signed with a paid Apple Developer
account — a deliberate scope choice for now, not an oversight (see the
project's `claude.md` section 35 if you're curious why). That means
Gatekeeper will refuse a plain double-click the first time. To open it:

1. Unzip the download (or mount the `.dmg` and drag the app to
   Applications).
2. **Right-click the app → Open**, then confirm in the dialog that
   appears. A regular double-click will still be blocked — this step has
   to be the right-click.
3. On newer macOS, if that doesn't work: **System Settings → Privacy &
   Security**, scroll down, and click **Open Anyway** next to the app's
   name.

You only need to do this once per download.

## First launch

The app asks for your own OpenAI API key on first launch (used only for
transcription and filler-word detection, stored only on your machine,
never sent anywhere but OpenAI) — get one at
[platform.openai.com/api-keys](https://platform.openai.com/api-keys) if
you don't already have one.

## Building it yourself

Prefer to build from source instead of downloading a release? See
[Getting Started](/guide/getting-started) for the full dev setup, then:

```bash
cd client
pnpm exec tauri build
```

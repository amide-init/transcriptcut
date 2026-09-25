# Podcast Workflow

transcriptcut is built around video podcasts: long, multi-speaker
recordings that need clean audio, show notes and chapters for publishing,
and short vertical clips for promotion. This page walks through that
workflow from raw recording to episode + Shorts.

Every AI step below is an explicit button you press. Nothing runs on its
own, and AI output never edits your project without you reviewing it
(see [AI-Assisted Editing](/guide/ai-editing)).

## 1. Upload a long episode

Upload the recording from **New project**. Long episodes are fine:

- **Uploads up to 10 GB** by default (set `MAX_UPLOAD_MB` in
  `server/.env` to change it). The file streams straight to disk, so size
  is limited by free disk space, not memory. The upload button shows
  progress.
- **Transcription runs in the background, in chunks.** The server
  extracts a small speech-quality audio track (~14 MB per hour), splits
  it into ~10-minute pieces at natural pauses so no word is cut in half,
  transcribes three pieces at a time, and stitches them back onto one
  timeline. You'll see **"Transcribing… 3/7"** while it works. An
  18-minute episode takes about a minute.
- **A 720p editing proxy** is made in the background for sources above
  720p or over 300 MB, so a multi-GB 4K original doesn't stutter in the
  browser. Exports always use the original.

## 2. Edit by editing the transcript

Cut by deleting words, sentences or segments, and use **AI tools → Find
filler words / Find long pauses** for one-click cleanup. See
[Editing Workflow](/guide/editing-workflow).

## 3. Label speakers

Click **Detect speakers** above the transcript. It labels who said what
("Speaker 1", "Speaker 2", …) and splits segments where the speaker
changes. Then, from the speaker chips:

- **Click a name to rename that speaker everywhere** ("Speaker 1" →
  "Host").
- **Scissors** cut everything that person said; the **restore** button
  brings it all back.

Names flow into captions, transcript exports and show notes.

Speaker detection is slower than transcription (about 8 minutes for a
14-minute episode), which is why it's a separate button. It stays
consistent across the episode even though long recordings are processed
in chunks. On a 14-minute synthetic 3-voice test conversation it
labeled **99.9%** of words correctly. Two very similar voices can end up merged into one speaker;
fix those by renaming, or by relabeling individual segments.

## 4. Shape it into scenes

Split the episode at each topic change, or let **Suggest scenes** propose
the splits (optionally lined up with camera cuts from **Find** shot
changes) and review them. Then give scenes title cards and transitions,
and cover long talking stretches with B-roll from the **Media** tab. See
[Scenes, Cards & B-roll](/guide/scenes).

## 5. Make it sound like a podcast

Open the **Audio** tab and click **Make podcast-ready**, or pick settings
yourself:

| Setting | What it does |
| --- | --- |
| Loudness | **-16 LUFS** (podcast apps) or **-14 LUFS** (YouTube, streaming), with a peak limiter so the louder result doesn't clip |
| Noise reduction | Light or strong background-noise removal |
| Level speakers | Evens out a quiet guest and a loud host |
| Remove rumble | Cuts desk thumps, traffic and AC hum below 80 Hz |

The browser can't run these filters live, so **Preview 15s from
playhead** renders a short **before / after** sample to listen to. The
settings are applied when you export. Everything is off by default, so
projects that don't use it export exactly as before.

## 6. Publish

The **Publish** tab prepares everything around the episode:

- **Chapters.** Generate them with AI, then rename, remove, or add one at
  the playhead. Click a time to jump there. **Copy for YouTube** gives
  `00:00 Intro` lines for a description. Chapters are **built into every
  MP4 and MP3 export**, so podcast apps and players show them.
- **Show notes.** A summary, key points and three title ideas, all
  editable. **Copy all** gives Markdown with the chapters appended.
- **Transcript.** Download the edited episode as TXT or Markdown, with
  speaker names and timestamps.

Then use the format picker next to **Export**:

- **MP4 video** for YouTube and video podcasts.
- **MP3 audio** (192 kbps, 44.1 kHz) for your podcast feed.
- **WAV audio** for further mastering elsewhere (WAV can't hold
  chapters).

Chapters are stored against the original recording, so cuts you make
after generating them don't break them: a chapter whose moment you cut
moves to the next surviving moment.

## 7. Make Shorts

The **Clips** tab turns the episode into short vertical clips:

- **Find highlights** picks the episode's best standalone moments
  (15–90 seconds), each with a title and a one-line reason: moments that
  open with a hook, hold one complete thought, and end when it lands.
- **Clip from transcript selection** makes your own: select words in the
  transcript (shift-click for a range), then click the button.
- For each clip, choose **9:16**, **1:1** or **16:9**, slide the **crop
  position** (outlined live on the video), and toggle captions.
- **Render clip** makes a 1080×1920 (for 9:16) MP4 with big word-by-word
  captions in your caption font and colors, placed clear of the TikTok /
  Shorts buttons.

Your edits still apply inside a clip: removed filler words stay removed,
and the audio settings apply too. Posting to social platforms is
deliberately out of scope. You download the file and post it yourself.

## What it costs

transcriptcut itself is free. The AI steps run on your own OpenAI API
key, and each one is a button you press:

| Step | Model |
| --- | --- |
| Transcription | `whisper-1` (OpenAI lists it at $0.006 per minute, about $0.36 per hour of audio) |
| Speaker detection | `gpt-4o-transcribe-diarize` |
| Chapters, show notes, scene suggestions | `gpt-4o-mini` |
| Find highlights | `gpt-5.6-luna` |

Costs for the other steps depend on episode length and current OpenAI
pricing. Your OpenAI usage dashboard shows exactly what each run cost.
Audio cleanup, shot-change detection, rendering, captions and exports run
locally with FFmpeg and cost nothing.

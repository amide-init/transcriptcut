# Editing Workflow

The transcript is the primary editing interface. This page covers how a
transcript edit becomes a video cut, and how undo/redo works underneath.

## Word-level timestamps

Every word in the transcript carries its own start/end timestamp,
produced by Whisper at transcription time:

```json
{
  "text": "Hello everyone",
  "start": 10.42,
  "end": 11.92,
  "words": [
    { "text": "Hello", "start": 10.42, "end": 10.91 },
    { "text": "everyone", "start": 10.95, "end": 11.92 }
  ]
}
```

This granularity is what makes transcript edits map accurately to video
timestamps — a deletion doesn't need to round to the nearest sentence.

## Transcript deletion → video cut

```text
Deleted words → find start/end timestamps → create cut operation
             → update timeline → preview video
```

For example, deleting "um basically" from:

```text
Hello everyone [DELETE] um basically [/DELETE] today we are learning AI.
```

where `um` spans `12.42–12.71` and `basically` spans `12.75–13.31`,
produces:

```json
{ "type": "cut", "start": 12.42, "end": 13.31 }
```

The cut is applied to the timeline immediately — it's reflected as a gap
on the timeline and skipped during playback, with a short crossfade
across the splice point rather than a hard cut, so the audio doesn't pop.

## Supported transcript actions

- Select and delete arbitrary text
- Delete a whole sentence
- Delete a whole transcript segment
- Jump from transcript position → video timestamp
- Jump from video playhead → transcript position

## Undo, redo, and restoring a specific cut

Every edit is represented as an operation, applied in sequence. Undo
reverts the latest operation; redo re-applies it. Beyond plain undo, you
can also restore one specific previously-cut word, segment, or sentence
directly — without having to undo everything after it.

The original uploaded video is never mutated for any of this — cuts are
timeline state (which source ranges map to which timeline ranges), not
edits to the underlying file. See [Architecture](/guide/architecture) for
the `Track`/`Clip` model this is built on.

## Timeline view

Alongside the transcript, the timeline shows zoomable frame thumbnails
and a live-updating waveform. Both get denser (more thumbnails, more
waveform detail) as you zoom in, rather than just stretching existing
pixels — useful for finding a precise cut point by ear or by eye.

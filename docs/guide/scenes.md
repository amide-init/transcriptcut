# Scenes, Cards & B-roll

A raw podcast recording is one long shot. This page covers the tools that
turn it into something that looks edited: named **scenes**, **title
cards** between them, **transitions**, and **B-roll** cut in over the
conversation. They all live in the **Scenes** and **Media** tabs, and
they're all ordinary edits: undo reverts them, and none of them touch
your original file.

## Scenes

A scene is a stretch of the episode between two split points, usually
one topic. Splitting doesn't change what's exported on its own; it gives
you named sections to work with.

- **Split** at the playhead with the **S** key or the **Split** button
  above the timeline, or hover a sentence in the transcript and click ✂
  to start a new scene there. Splits always land in the gap between two
  words, never inside one.
- Scenes appear as named blocks above the timeline and as small markers
  in the transcript.
- In the **Scenes** tab you can rename a scene, jump to it, cut the whole
  scene, restore it, or merge it into the one before.

### Let the editor suggest scenes

You don't have to split by hand:

- **Suggest scenes** reads the transcript (with your cuts applied) and
  suggests where topics change, with a short title for each. It uses
  `gpt-4o-mini` and only returns sentence numbers and titles; the times
  always come from the transcript.
- **Find** (next to "shot changes") detects camera cuts in the video, such
  as a multicam switch or a screen share starting. Suggestions within 1.5
  seconds of a cut move onto it, so the scene change is also a visual one.
  This runs locally with FFmpeg and costs nothing.
- **From chapters** turns the chapters you generated in the **Publish**
  tab into scenes, without another AI call.

Suggestions are only a proposal. They appear as a list and as dashed
lines on the timeline. Untick any you don't want, edit the titles, and
choose whether to add a numbered title card to each. Then click
**Apply**. Everything you apply is one step, so a single undo removes it
all.

## Title cards

A title card is a full-screen slide between scenes: an intro, "Part 2:
Pricing", a quote, an outro. Add one from a scene's **T** button (the
first scene's is the intro) or with **Add outro card**.

- Four templates: **Title**, **Chapter** (a small label above a big
  title), **Quote** and **Outro**.
- Title and subtitle, 1–10 seconds on screen, preset or custom
  background colors. The text switches between dark and light to stay
  readable, and fades in and out.
- Edits preview live over the player. In playback the video pauses where
  a card plays, shows it, then carries on.
- Cards add time to the episode. Captions, chapters, show-note timestamps
  and transcript exports all account for it.
- If you cut a whole scene, its card goes with it.

## Transitions

Each scene has a **Transition in**:

- **Dip to black** / **Dip to white**: fade out to the color and back in.
- **Crossfade with card**: blend straight into and out of the scene's
  title card (offered once the scene has one).

The first scene has **Fade in** and the outro has **Fade out**, from or
to black or white. Lengths run from 0.5 to 2 seconds, and audio fades
gently along with the picture.

Transitions never change the episode's length, so nothing after them
drifts out of sync. A dip fades each side's own edge, and a crossfade
makes its card slightly longer by the overlap. They're marked on the
timeline with a diamond, and episode fades with a shaded edge.

## B-roll

B-roll is footage or images you cut away to while the conversation keeps
playing: product shots, screen recordings, photos.

1. In the **Media** tab, upload images (PNG, JPG, WEBP) or video clips.
   Files ffmpeg can't read are refused right away.
2. Select words in the transcript, then click **Add** on a file to cover
   exactly those words. With nothing selected, it starts at the playhead.
3. In the list below the library, switch each piece between **Full
   screen** and **Picture in picture**, pick the corner, or remove it.

B-roll follows your cuts: cutting part of its range shortens it, and
cutting all of it removes it. A clip shorter than its slot holds its
last frame. The B-roll's own audio isn't used. B-roll appears in exports
and in Shorts made from that part of the episode. A library file can't
be deleted while B-roll uses it.

## Where things sit in the export

From bottom to top: your footage (with its color preset), title cards and
transitions, B-roll, card text, captions, then the logo. Cards and B-roll
aren't affected by the color preset.

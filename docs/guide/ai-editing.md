# AI-Assisted Editing

## What's actually implemented

AI-assisted editing in transcriptcut means specific, scoped actions you
explicitly trigger — not an open-ended chat interface:

- **Filler-word removal** — flags candidates like "um", "uh", "you know",
  "basically" for one-click removal. Detection is algorithmic, not
  generative. An LLM call is only used to classify **ambiguous single
  words** ("like", "actually", "so", ...) in context, deciding whether a
  given instance is filler or semantically meaningful — it never
  proposes cuts on its own, and it never touches words that aren't
  already flagged as ambiguous candidates.
- **Long-pause removal** — detects long silences and creates cut
  operations, again algorithmically (no LLM involved).
- **Speaker detection** — labels who said what. The model only says who
  spoke when; the words and their timings still come from the transcript.
- **Chapters** and **show notes** — generated for the Publish tab, fully
  editable afterwards.
- **Find highlights** — picks standalone moments for Shorts.

All of these are explicit buttons. Filler words and pauses are flagged
for you to review before anything is cut. Speakers, chapters, show notes
and highlights never cut anything by themselves: you rename, edit, delete
or render them yourself. See the [Podcast Workflow](/guide/podcasting)
guide for where each one lives.

## Models return picks, not timestamps

For chapters and highlights, the model gets a numbered list of sentences
and answers with sentence numbers and text, never with times. The app
then takes the start and end from the sentences' own word timestamps and
checks the rules (chapter spacing, clip length between 15 and 90 seconds,
no overlaps) before saving anything. A chapter or clip can't start
mid-word or point at a time that doesn't exist, however the model
answers. Every response is schema-validated, and invalid output is
discarded rather than applied.

## What was removed, and why

An earlier version of this project had a free-text "Ask AI" command bar —
you could type something like *"remove the first 30 seconds"* or *"cut
the pricing section"*, and a LangGraph pipeline (Director → Editor →
Validator agents) would turn that into structured edit operations. It was
built and verified end to end, then **deliberately removed**: an open
text field that could propose arbitrary edits to a project was decided
against.

The agent architecture and reasoning are kept in
[`claude.md`](https://github.com/amide-init/transcriptcut/blob/main/claude.md)
(sections 5–8) as a record of that design, and could become relevant
again behind a more constrained interface — but nothing in the current
app implements a free-text AI editing command.

## The core agent principle, if this returns

Whether or not a natural-language interface comes back, the project's
rule for AI + media is fixed:

```text
Agents reason. Tools execute.

User → LLM → Edit Operations JSON → Validation → Application logic → FFmpeg
```

An LLM is never allowed to produce or execute raw FFmpeg/shell commands.
It only ever produces structured, typed edit operations, which are
validated (timestamps in range, `start < end`, referenced assets exist,
no impossible combinations) before any FFmpeg process runs.

## Model choice

| Task | Model | Why |
| --- | --- | --- |
| Transcription | `whisper-1` | Word-level timestamps, which transcript editing depends on |
| Speaker detection | `gpt-4o-transcribe-diarize` | Speaker-labeled segments; Whisper still provides the words |
| Filler words, chapters, show notes | `gpt-4o-mini` | Narrow classification and summarizing: a small, low-cost model is enough |
| Find highlights | `gpt-5.6-luna` | Judging what works as a standalone clip across a whole episode needs a stronger reasoning model |

Each sits behind its own service module on the server, so a provider can
be swapped without touching the rest of the app.

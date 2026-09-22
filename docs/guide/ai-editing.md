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

Both surface as explicit buttons in the transcript/timeline panels: run
detection, review the flagged words, then remove them. Nothing is cut
without you reviewing it first.

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

Transcription uses OpenAI Whisper (`whisper-1`) directly — it's not part
of the editing-model routing below, since it's a distinct concern
(speech-to-text vs. structured edit reasoning).

For the ambiguous-word classification call, a small, low-cost model is
used deliberately — this is a narrow classification task on a single
word in context, not a task that benefits from a larger reasoning model.

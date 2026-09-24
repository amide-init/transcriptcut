import { splitIntoSentences } from "@/lib/timeline/sentences";
import { computePlayableRanges, isWordCut, sourceTimeToEditedTime } from "@/lib/timeline/cuts";
import type { CutOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";

/** One sentence of what survives the edit, with both source and edited timing. */
export type EditedSentence = {
  /** Source-timeline start of the first surviving word -- what chapters store. */
  sourceStart: number;
  /** Source-timeline end of the last surviving word -- what clips store. */
  sourceEnd: number;
  /** Edited-timeline start/end -- what the listener hears. */
  start: number;
  end: number;
  text: string;
  speaker?: string;
};

/**
 * The transcript as it will sound after cuts: fully cut sentences dropped,
 * partly cut ones reduced to their surviving words, times mapped onto the
 * edited timeline. Same rules as captions (lib/captions/generate.ts), plus
 * the source start and speaker label, which chapters and transcript export
 * need.
 */
export function buildEditedSentences(transcript: Transcript, cuts: CutOperation[], duration: number): EditedSentence[] {
  const ranges = computePlayableRanges(duration, cuts);
  const sentences: EditedSentence[] = [];
  for (const segment of transcript.segments) {
    for (const sentence of splitIntoSentences(segment)) {
      const words = sentence.words.filter((w) => !isWordCut(w.start, w.end, cuts));
      if (words.length === 0) continue;
      const start = sourceTimeToEditedTime(words[0].start, ranges);
      const end = sourceTimeToEditedTime(words[words.length - 1].end, ranges);
      if (end <= start) continue;
      sentences.push({
        sourceStart: words[0].start,
        sourceEnd: words[words.length - 1].end,
        start,
        end,
        text: words.map((w) => w.text).join(" ").trim(),
        ...(segment.speaker ? { speaker: segment.speaker } : {}),
      });
    }
  }
  return sentences.sort((a, b) => a.start - b.start);
}

/** "1:02:03" past an hour, "02:03" otherwise -- the form YouTube and show notes use. */
export function formatTimestamp(seconds: number, forceHours = false): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 || forceHours ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Plain-text or Markdown transcript of the edited episode, one paragraph per
 * run of sentences from the same speaker, each stamped with its edited time.
 */
export function formatTranscript(sentences: EditedSentence[], format: "txt" | "md", title: string): string {
  const longForm = sentences.length > 0 && sentences[sentences.length - 1].end >= 3600;
  const paragraphs: { start: number; speaker?: string; text: string[] }[] = [];
  for (const s of sentences) {
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.speaker === s.speaker && s.speaker !== undefined) {
      last.text.push(s.text);
    } else if (last && s.speaker === undefined && last.speaker === undefined && last.text.length < 5) {
      last.text.push(s.text);
    } else {
      paragraphs.push({ start: s.start, speaker: s.speaker, text: [s.text] });
    }
  }

  const lines = paragraphs.map((p) => {
    const stamp = formatTimestamp(p.start, longForm);
    const text = p.text.join(" ");
    if (format === "md") {
      return p.speaker ? `**[${stamp}] ${p.speaker}:** ${text}` : `**[${stamp}]** ${text}`;
    }
    return p.speaker ? `[${stamp}] ${p.speaker}: ${text}` : `[${stamp}] ${text}`;
  });

  const heading = format === "md" ? `# ${title}\n\n` : `${title}\n\n`;
  return heading + lines.join("\n\n") + "\n";
}

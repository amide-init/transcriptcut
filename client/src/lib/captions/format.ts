import type { CaptionCue } from "@/lib/captions/generate";
import { ALIGNMENT_BY_POSITION, hexToAssColor, type CaptionStyle } from "@/lib/captions/style";

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

function splitTime(seconds: number): { h: number; m: number; s: number; ms: number } {
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return { h, m, s, ms };
}

function srtTimestamp(seconds: number): string {
  const { h, m, s, ms } = splitTime(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function vttTimestamp(seconds: number): string {
  const { h, m, s, ms } = splitTime(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export function toSrt(cues: CaptionCue[]): string {
  return cues
    .map((cue, i) => `${i + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}`)
    .join("\n\n");
}

export function toVtt(cues: CaptionCue[]): string {
  const body = cues
    .map((cue) => `${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)}\n${cue.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}`;
}

function assTimestamp(seconds: number): string {
  const { h, m, s, ms } = splitTime(seconds);
  // ASS wants centiseconds (2 digits), not milliseconds (3).
  return `${h}:${pad(m)}:${pad(s)}.${pad(Math.floor(ms / 10))}`;
}

/** Strips characters that would break the {\...} override-tag syntax if they appeared in transcript text. */
function escapeAssText(text: string): string {
  return text.replace(/[{}\\]/g, "");
}

/**
 * Builds an .ass subtitle file with per-word libass karaoke (\k) tags, so
 * the word currently being spoken renders in highlightColor and the rest
 * of the cue in textColor -- matching the live preview's word-highlight
 * overlay (claude.md issue #15). Plain toSrt() has no per-word timing, so
 * this is the only way to carry that into the actual rendered video.
 *
 * The style (font/size/colors/position/background) is baked into the
 * file's own [V4+ Styles] line, so callers should NOT also pass
 * force_style for this file -- the inline \k tags set PrimaryColour vs.
 * SecondaryColour per word, and a force_style override would fight that.
 */
export function toAssKaraoke(cues: CaptionCue[], style: CaptionStyle): string {
  const events = cues
    .map((cue) => {
      const karaoke = cue.words
        .map((word, i) => {
          const next = cue.words[i + 1];
          const durationSeconds = (next ? next.start : cue.end) - word.start;
          const centiseconds = Math.max(1, Math.round(durationSeconds * 100));
          return `{\\k${centiseconds}}${escapeAssText(word.text)} `;
        })
        .join("");
      return `Dialogue: 0,${assTimestamp(cue.start)},${assTimestamp(cue.end)},Default,,0,0,0,,${karaoke}`;
    })
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.font},${Math.round(style.fontSize)},${hexToAssColor(style.highlightColor)},${hexToAssColor(style.textColor)},${hexToAssColor(style.outlineColor)},${style.background ? "&H80000000" : "&H00000000"},0,0,0,0,100,100,0,0,${style.background ? 3 : 1},2,0,${ALIGNMENT_BY_POSITION[style.position]},10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

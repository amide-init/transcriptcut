import type { Transcript } from "@/types/transcript";

/**
 * Distinct speaker colors, assigned by order of first appearance so the same
 * transcript always colors the same way. Class names are spelled out in full
 * so Tailwind's scanner keeps them.
 */
const SPEAKER_COLORS = [
  "bg-sky-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-lime-500",
];

/** Speaker names in order of first appearance. */
export function listSpeakers(transcript: Transcript | null): string[] {
  return Array.from(new Set(transcript?.segments.map((s) => s.speaker).filter((s): s is string => !!s)));
}

export function speakerColor(name: string, speakers: string[]): string {
  const index = speakers.indexOf(name);
  return SPEAKER_COLORS[(index === -1 ? 0 : index) % SPEAKER_COLORS.length];
}

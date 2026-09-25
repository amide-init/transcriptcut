import { CARD_BACKGROUNDS } from "@/lib/cards/layout";
import { gapBefore } from "@/lib/timeline/scenes";
import type { CardOperation, EditOperation, SplitOperation, SplitSource } from "@/types/edit-operation";

/**
 * A suggested scene boundary awaiting review (from the server's
 * lib/scenes/suggest.ts, or built from chapters here). `at` is source
 * time; 0 only names the first scene.
 */
export type SceneSuggestion = {
  at: number;
  title: string;
  excerpt: string;
  onShot: boolean;
};

/** An existing split within this of a suggestion is the same boundary. */
const SAME_BOUNDARY_SECONDS = 1;
const TITLE_MAX = 60;

/**
 * Scenes from the episode's chapters -- no AI call: each chapter after the
 * first starts a scene in the silence before its first word.
 */
export function suggestionsFromChapters(
  chapters: { title: string; sourceStart: number }[],
  words: { start: number; end: number }[]
): SceneSuggestion[] {
  return [...chapters]
    .sort((a, b) => a.sourceStart - b.sourceStart)
    .map((chapter, i) => ({
      at: i === 0 ? 0 : gapBefore(chapter.sourceStart, words),
      title: chapter.title.slice(0, TITLE_MAX),
      excerpt: "",
      onShot: false,
    }));
}

/**
 * The change that applies the kept suggestions, meant to be one undo step.
 * A suggestion on (or within a second of) an existing split renames that
 * boundary -- replacing the split -- rather than making a sliver of a
 * scene; at 0 it names the first scene. With cards on, each scene after
 * the first gets a chapter card numbered in order ("Part 2", ...), unless
 * it already has one.
 */
export function operationsForSuggestions(
  suggestions: SceneSuggestion[],
  existing: EditOperation[],
  { withCards, source }: { withCards: boolean; source: SplitSource }
): { added: EditOperation[]; removedIds: string[] } {
  const splits = existing.filter((op): op is SplitOperation => op.type === "split" && op.timestamp > 0);
  const cards = existing.filter((op): op is CardOperation => op.type === "card");
  const now = Date.now();
  const ops: EditOperation[] = [];
  const removedIds: string[] = [];

  [...suggestions]
    .sort((a, b) => a.at - b.at)
    .forEach((suggestion, i) => {
      const createdAt = now + i;
      if (suggestion.at <= 0) {
        ops.push({ id: crypto.randomUUID(), type: "split", timestamp: 0, title: suggestion.title, source, createdAt });
        return;
      }
      const match = splits.find((s) => Math.abs(s.timestamp - suggestion.at) <= SAME_BOUNDARY_SECONDS);
      const at = match ? match.timestamp : suggestion.at;
      if (match && !removedIds.includes(match.id)) removedIds.push(match.id);
      ops.push({ id: crypto.randomUUID(), type: "split", timestamp: at, title: suggestion.title, source, createdAt });
      if (withCards && !cards.some((c) => Math.abs(c.at - at) <= 0.05)) {
        ops.push({
          id: crypto.randomUUID(),
          type: "card",
          at,
          duration: 3,
          template: "chapter",
          title: suggestion.title,
          subtitle: `Part ${i + 1}`,
          background: CARD_BACKGROUNDS[0],
          createdAt,
        });
      }
    });
  return { added: ops, removedIds };
}

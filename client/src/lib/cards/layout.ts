import type { CardOperation } from "@/types/edit-operation";

/**
 * Where each line of a title card goes, as percentages of the frame, so
 * the HTML preview (CardPreview.tsx, in cqh units) and the burned-in ASS
 * (lib/cards/ass.ts, against PlayResX/Y = the output size) lay out the
 * same card the same way at any resolution. Duplicated, not imported,
 * across the client/server boundary -- keep both copies identical.
 *
 * `anchor` says which edge of the text block sits on `yPercent`: a title
 * anchored "above" a line grows upward as it wraps, and a subtitle
 * anchored "below" grows downward, so the two never overlap.
 */
export type CardLine = {
  text: string;
  /** Font size, percent of frame height. */
  sizePercent: number;
  anchor: "above" | "below" | "center";
  yPercent: number;
  bold: boolean;
  italic: boolean;
  /** Secondary lines render slightly faded. */
  secondary: boolean;
};

export const CARD_FONT = "Arial";
/** Text wraps inside this much of the frame width. */
export const CARD_TEXT_WIDTH_PERCENT = 80;
/** Card text fades in and out over this long (the background cuts in). */
export const CARD_TEXT_FADE_SECONDS = 0.25;
export const CARD_SECONDARY_OPACITY = 0.8;

export function layoutCard(card: Pick<CardOperation, "template" | "title" | "subtitle">): CardLine[] {
  const title = card.title.trim();
  const subtitle = card.subtitle?.trim() ?? "";
  const line = (text: string, sizePercent: number, anchor: CardLine["anchor"], yPercent: number, rest: Partial<CardLine> = {}): CardLine => ({
    text,
    sizePercent,
    anchor,
    yPercent,
    bold: false,
    italic: false,
    secondary: false,
    ...rest,
  });

  switch (card.template) {
    case "chapter":
      return subtitle
        ? [
            line(subtitle.toUpperCase(), 3.5, "above", 44, { bold: true, secondary: true }),
            line(title, 8, "below", 46, { bold: true }),
          ]
        : [line(title, 8, "center", 50, { bold: true })];
    case "quote":
      return [
        line(`“${title}”`, 6, subtitle ? "above" : "center", subtitle ? 55 : 50, { italic: true }),
        ...(subtitle ? [line(`— ${subtitle}`, 3.5, "below", 59, { secondary: true })] : []),
      ];
    case "outro":
    case "title":
    default: {
      const size = card.template === "outro" ? 7 : 8;
      return subtitle
        ? [line(title, size, "above", 52, { bold: true }), line(subtitle, 4, "below", 55, { secondary: true })]
        : [line(title, size, "center", 50, { bold: true })];
    }
  }
}

/** Dark text on light backgrounds, white on dark (WCAG relative luminance). */
export function cardTextColor(background: string): string {
  const channel = (i: number) => {
    const c = parseInt(background.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.4 ? "#111111" : "#FFFFFF";
}

/** Opacity of card text `offset` seconds into a card lasting `duration`. */
export function cardTextOpacity(offset: number, duration: number): number {
  const fade = Math.min(CARD_TEXT_FADE_SECONDS, duration / 4);
  return Math.max(0, Math.min(1, offset / fade, (duration - offset) / fade));
}

/** Preset backgrounds offered in the card editor. */
export const CARD_BACKGROUNDS = ["#111418", "#1E3A5F", "#7C2D12", "#14532D", "#F5F0E6", "#FFFFFF"] as const;

/**
 * Burned-in caption styling, applied via libass's `force_style` filter
 * option (see lib/ffmpeg/plan.ts). Fonts are a fixed whitelist rather than
 * free text -- besides matching the "small preset list" scope of the
 * feature, it also means FontName can never carry characters that would
 * need escaping in the ffmpeg filtergraph (spec section 18: sanitize and
 * validate all FFmpeg parameters).
 */
export const CAPTION_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Georgia",
  "Courier New",
  "Impact",
] as const;

export type CaptionFont = (typeof CAPTION_FONTS)[number];

export const CAPTION_POSITIONS = ["top", "middle", "bottom"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export type CaptionStyle = {
  font: CaptionFont;
  /** Points, matching libass's FontSize. */
  fontSize: number;
  /** '#RRGGBB' */
  textColor: string;
  /** '#RRGGBB' */
  outlineColor: string;
  position: CaptionPosition;
  /** Draw an opaque box behind the text instead of just an outline. */
  background: boolean;
  /**
   * Word-by-word "typing" highlight (claude.md issue #15): the word
   * currently being spoken renders in highlightColor, the rest of the cue
   * in textColor. Live-preview only for now -- the export pipeline still
   * burns in plain per-sentence text via SRT, which has no per-word
   * timing/color, so this has no effect on the rendered file yet.
   */
  wordHighlight: boolean;
  /** '#RRGGBB' -- color of the word currently being spoken when wordHighlight is on. */
  highlightColor: string;
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  font: "Arial",
  fontSize: 24,
  textColor: "#FFFFFF",
  outlineColor: "#000000",
  position: "bottom",
  background: false,
  wordHighlight: false,
  highlightColor: "#FF0000",
};

/** One-click starting points for the manual style controls -- pick a theme, then fine-tune from there. */
export const CAPTION_THEMES: { id: string; label: string; style: CaptionStyle }[] = [
  {
    id: "classic",
    label: "Classic",
    style: DEFAULT_CAPTION_STYLE,
  },
  {
    id: "bold-yellow",
    label: "Bold Yellow",
    style: {
      font: "Impact",
      fontSize: 32,
      textColor: "#FFEE00",
      outlineColor: "#000000",
      position: "bottom",
      background: false,
      wordHighlight: false,
      highlightColor: "#FF0000",
    },
  },
  {
    id: "boxed",
    label: "Boxed",
    style: {
      font: "Arial",
      fontSize: 24,
      textColor: "#FFFFFF",
      outlineColor: "#000000",
      position: "bottom",
      background: true,
      wordHighlight: false,
      highlightColor: "#FF0000",
    },
  },
  {
    id: "minimal-top",
    label: "Minimal Top",
    style: {
      font: "Verdana",
      fontSize: 20,
      textColor: "#FFFFFF",
      outlineColor: "#000000",
      position: "top",
      background: false,
      wordHighlight: false,
      highlightColor: "#FF0000",
    },
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    style: {
      font: "Georgia",
      fontSize: 28,
      textColor: "#000000",
      outlineColor: "#FFFFFF",
      position: "bottom",
      background: true,
      wordHighlight: false,
      highlightColor: "#FF0000",
    },
  },
  {
    id: "word-highlight",
    label: "Word Highlight",
    style: {
      font: "Arial",
      fontSize: 24,
      textColor: "#000000",
      outlineColor: "#FFFFFF",
      position: "bottom",
      background: false,
      wordHighlight: true,
      highlightColor: "#FF0000",
    },
  },
];

/** ASS/libass alignment values (numpad layout, center column only). */
const ALIGNMENT_BY_POSITION: Record<CaptionPosition, number> = {
  bottom: 2,
  middle: 5,
  top: 8,
};

/** '#RRGGBB' -> ASS '&HAABBGGRR' (opaque, so alpha is always 00). */
function hexToAssColor(hex: string): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * Builds the comma-separated ASS style string for libass's `force_style`
 * filter option. Every input here is expected to have already been
 * validated (lib/validation/caption-style.ts) -- this function assumes it,
 * it does not re-check.
 */
export function buildForceStyle(style: CaptionStyle): string {
  const parts = [
    `FontName=${style.font}`,
    `FontSize=${Math.round(style.fontSize)}`,
    `PrimaryColour=${hexToAssColor(style.textColor)}`,
    `OutlineColour=${hexToAssColor(style.outlineColor)}`,
    `Alignment=${ALIGNMENT_BY_POSITION[style.position]}`,
    // BorderStyle 3 = opaque box, 1 = outline only (libass default).
    `BorderStyle=${style.background ? 3 : 1}`,
  ];
  if (style.background) {
    parts.push("BackColour=&H80000000");
  }
  return parts.join(",");
}

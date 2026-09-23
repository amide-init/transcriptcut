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
  /**
   * Percent of frame HEIGHT, not raw points -- a raw point value meant
   * something different in the CSS preview (px against the on-screen,
   * often scaled-down player) than in the export (ASS/libass units
   * against an undeclared script resolution), so the same stored number
   * rendered at very different relative sizes (GitHub issue #22). Both
   * renderers now derive an actual size from this one percent: the CSS
   * preview via `cqh` container query units (VideoPlayer.tsx), the export
   * via `buildAssStyleFields` below against the fixed
   * CAPTION_REFERENCE_WIDTH/HEIGHT, which libass then auto-scales to
   * whatever the real output resolution is (PlayResX/Y in
   * lib/captions/format.ts#toAssKaraoke, `original_size` in
   * lib/ffmpeg/plan.ts for the plain-SRT path).
   */
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
   * in textColor. Applied both to the live preview overlay and to the
   * export (as an .ass file with libass karaoke tags -- see
   * lib/captions/format.ts#toAssKaraoke).
   */
  wordHighlight: boolean;
  /** '#RRGGBB' -- color of the word currently being spoken when wordHighlight is on. */
  highlightColor: string;
};

/**
 * Fixed reference frame size that caption font/margin percentages are
 * computed against for export (ASS PlayResX/Y, ffmpeg `original_size`).
 * Arbitrary -- doesn't need to match the actual video's resolution, since
 * libass rescales a PlayRes-authored layout to the real output frame size.
 * 16:9 keeps the math simple; only the height matters for vertical sizing.
 */
export const CAPTION_REFERENCE_WIDTH = 1920;
export const CAPTION_REFERENCE_HEIGHT = 1080;

/** Vertical inset from the top/bottom edge, percent of frame height. */
export const CAPTION_MARGIN_V_PERCENT = 3;

/** Opacity of the background box, shared by the CSS preview and both export paths. */
export const CAPTION_BACKGROUND_OPACITY = 0.7;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  font: "Arial",
  fontSize: 2.2,
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
      fontSize: 3.0,
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
      fontSize: 2.2,
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
      fontSize: 1.9,
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
      fontSize: 2.6,
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
      fontSize: 2.2,
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
export const ALIGNMENT_BY_POSITION: Record<CaptionPosition, number> = {
  bottom: 2,
  middle: 5,
  top: 8,
};

/** '#RRGGBB' -> ASS '&HAABBGGRR' (opaque, so alpha is always 00). */
export function hexToAssColor(hex: string): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/**
 * '#RRGGBB' + a 0-1 opacity fraction -> ASS '&HAABBGGRR'. ASS alpha is
 * inverted from the usual convention (00 = fully opaque, FF = fully
 * transparent), which is easy to get backwards -- this is the one place
 * that conversion happens, so both export paths (force_style and the ASS
 * karaoke file) agree with each other and with the CSS preview's opacity.
 */
function hexToAssColorWithOpacity(hex: string, opacity: number): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const alpha = Math.round((1 - opacity) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

/**
 * Computes the actual ASS/libass field values shared by both export paths
 * -- buildForceStyle below (plain SRT + force_style) and toAssKaraoke
 * (lib/captions/format.ts, word-highlight) -- so there's exactly one place
 * that turns a CaptionStyle into ASS numbers, not two hand-authored copies
 * that can disagree with each other (GitHub issue #22).
 *
 * `referenceHeight` is the frame height (in pixels) that `style.fontSize`'s
 * percent is computed against, and callers must pick the right one for
 * their rendering path -- they are NOT interchangeable:
 * - toAssKaraoke's .ass file declares PlayResX/Y (a real ASS/libass
 *   feature, verified: the same FontSize renders ~4x smaller with
 *   PlayResY=1080 declared than with no PlayRes at all), so libass itself
 *   rescales a CAPTION_REFERENCE_HEIGHT-relative value to the real output
 *   size -- pass CAPTION_REFERENCE_HEIGHT.
 * - force_style has no such scaling: ffmpeg's `subtitles` filter's
 *   `original_size` option does NOT rescale force_style's FontSize/Margin
 *   (verified empirically -- byte-identical output with and without it);
 *   FontSize there is always literal, un-scaled output pixels. So
 *   buildForceStyle needs the render's ACTUAL output video height, probed
 *   via ffmpeg/probe.ts#probeVideoDimensions the same way the logo-size
 *   fix does -- pass that.
 */
export function buildAssStyleFields(style: CaptionStyle, referenceHeight: number) {
  return {
    fontSize: Math.round((style.fontSize / 100) * referenceHeight),
    marginV: Math.round((CAPTION_MARGIN_V_PERCENT / 100) * referenceHeight),
    // A fixed, modest outline -- CSS approximates the same idea with a 1px
    // text-stroke + soft glow, not a pixel-identical match, but this at
    // least keeps the two export paths consistent with each other.
    outline: 2,
    shadow: 0,
    backColour: hexToAssColorWithOpacity("#000000", CAPTION_BACKGROUND_OPACITY),
  };
}

/**
 * Builds the comma-separated ASS style string for libass's `force_style`
 * filter option. Every input here is expected to have already been
 * validated (lib/validation/caption-style.ts) -- this function assumes it,
 * it does not re-check.
 *
 * @param videoHeight The render's actual output video height in pixels
 * (probed -- see buildAssStyleFields's doc comment for why, unlike
 * toAssKaraoke, this can't use a fixed reference height).
 */
export function buildForceStyle(style: CaptionStyle, videoHeight: number): string {
  const fields = buildAssStyleFields(style, videoHeight);
  const parts = [
    `FontName=${style.font}`,
    `FontSize=${fields.fontSize}`,
    `PrimaryColour=${hexToAssColor(style.textColor)}`,
    `OutlineColour=${hexToAssColor(style.outlineColor)}`,
    `Alignment=${ALIGNMENT_BY_POSITION[style.position]}`,
    `Outline=${fields.outline}`,
    `Shadow=${fields.shadow}`,
    `MarginV=${fields.marginV}`,
    // BorderStyle 3 = opaque box, 1 = outline only (libass default).
    `BorderStyle=${style.background ? 3 : 1}`,
  ];
  if (style.background) {
    parts.push(`BackColour=${fields.backColour}`);
  }
  return parts.join(",");
}

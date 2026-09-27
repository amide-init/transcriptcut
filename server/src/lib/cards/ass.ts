import { assTimestamp, escapeAssText } from "@/lib/captions/format";
import { hexToAssColor } from "@/lib/captions/style";
import {
  CARD_FONT,
  CARD_SECONDARY_OPACITY,
  CARD_TEXT_FADE_SECONDS,
  CARD_TEXT_WIDTH_PERCENT,
  cardTextColor,
  layoutCard,
  type CardLine,
} from "@/lib/cards/layout";
import type { CardOperation } from "@/types/edit-operation";

/** Numpad alignment for each anchor: bottom-center, top-center, center. */
const ALIGNMENT: Record<CardLine["anchor"], number> = { above: 2, below: 8, center: 5 };

/**
 * One .ass file with the text of every title card, timed on the program
 * timeline, burned in over the rendered program in a single subtitles pass
 * (the cards' solid backgrounds come from ffmpeg's color source -- see
 * lib/ffmpeg/plan.ts). PlayResX/Y is the output size, so lib/cards/layout.ts's
 * percentages land where the preview puts them.
 *
 * Card text was already refused at the API if it held braces, backslashes
 * or control characters; escapeAssText strips them again here anyway, since
 * a stray brace would be read as an override tag.
 */
export function toCardsAss(
  cards: { start: number; card: CardOperation }[],
  frame: { width: number; height: number }
): string {
  const { width, height } = frame;
  const marginH = Math.round((width * (100 - CARD_TEXT_WIDTH_PERCENT)) / 200);
  const secondaryAlpha = Math.round((1 - CARD_SECONDARY_OPACITY) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

  const events = cards.flatMap(({ start, card }) => {
    const color = hexToAssColor(cardTextColor(card.background)).replace("&H00", "&H");
    const fadeMs = Math.round(Math.min(CARD_TEXT_FADE_SECONDS, card.duration / 4) * 1000);
    return layoutCard(card).map((line) => {
      const x = Math.round(width / 2);
      const y = Math.round((line.yPercent / 100) * height);
      const size = Math.round((line.sizePercent / 100) * height);
      const tags = [
        `\\an${ALIGNMENT[line.anchor]}`,
        `\\pos(${x},${y})`,
        `\\fs${size}`,
        `\\b${line.bold ? 1 : 0}`,
        `\\i${line.italic ? 1 : 0}`,
        `\\c${color}&`,
        ...(line.secondary ? [`\\alpha&H${secondaryAlpha}&`] : []),
        `\\fad(${fadeMs},${fadeMs})`,
      ].join("");
      return `Dialogue: 0,${assTimestamp(start)},${assTimestamp(start + card.duration)},Card,,0,0,0,,{${tags}}${escapeAssText(line.text)}`;
    });
  });

  return `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Card,${CARD_FONT},${Math.round(height * 0.08)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,${marginH},${marginH},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}

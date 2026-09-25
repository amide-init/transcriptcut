import type { CSSProperties } from "react";
import {
  CARD_FONT,
  CARD_SECONDARY_OPACITY,
  CARD_TEXT_WIDTH_PERCENT,
  cardTextColor,
  cardTextOpacity,
  layoutCard,
  type CardLine,
} from "@/lib/cards/layout";
import type { CardOperation } from "@/types/edit-operation";

/**
 * A title card over the player, laid out from the same percentages the
 * export burns in (lib/cards/layout.ts): sizes in `cqh` against the player's
 * aspect-matched container, like the caption preview. `elapsed` drives the
 * text fade; omit it for a static preview (the card editor).
 */
export function CardPreview({ card, elapsed }: { card: CardOperation; elapsed?: number }) {
  const color = cardTextColor(card.background);
  const opacity = elapsed === undefined ? 1 : cardTextOpacity(elapsed, card.duration);

  const position = (line: CardLine): CSSProperties => {
    switch (line.anchor) {
      case "above":
        return { bottom: `${100 - line.yPercent}%` };
      case "below":
        return { top: `${line.yPercent}%` };
      default:
        return { top: `${line.yPercent}%`, transform: "translateY(-50%)" };
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: card.background }}>
      {layoutCard(card).map((line, i) => (
        <div
          key={i}
          className="absolute text-center leading-[1.15]"
          style={{
            ...position(line),
            left: `${(100 - CARD_TEXT_WIDTH_PERCENT) / 2}%`,
            width: `${CARD_TEXT_WIDTH_PERCENT}%`,
            fontFamily: CARD_FONT,
            fontSize: `${line.sizePercent}cqh`,
            fontWeight: line.bold ? 700 : 400,
            fontStyle: line.italic ? "italic" : "normal",
            color,
            opacity: opacity * (line.secondary ? CARD_SECONDARY_OPACITY : 1),
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}

import { describe, expect, it } from "vitest";
import {
  buildAssStyleFields,
  buildForceStyle,
  CAPTION_MARGIN_V_PERCENT,
  CAPTION_REFERENCE_HEIGHT,
  DEFAULT_CAPTION_STYLE,
  hexToAssColor,
} from "@/lib/captions/style";

describe("hexToAssColor", () => {
  it("converts #RRGGBB to ASS's &HAABBGGRR (byte-swapped, opaque)", () => {
    expect(hexToAssColor("#FF0000")).toBe("&H000000FF");
    expect(hexToAssColor("#00FF00")).toBe("&H0000FF00");
    expect(hexToAssColor("#0000FF")).toBe("&H00FF0000");
  });
});

describe("buildAssStyleFields", () => {
  it("computes FontSize as a percent of the given reference height", () => {
    const fields = buildAssStyleFields({ ...DEFAULT_CAPTION_STYLE, fontSize: 2.2 }, 1080);
    expect(fields.fontSize).toBe(Math.round((2.2 / 100) * 1080));
  });

  it("computes MarginV from CAPTION_MARGIN_V_PERCENT of the reference height", () => {
    const fields = buildAssStyleFields(DEFAULT_CAPTION_STYLE, 1080);
    expect(fields.marginV).toBe(Math.round((CAPTION_MARGIN_V_PERCENT / 100) * 1080));
  });

  it("scales with a different reference height (e.g. the render's actual probed output height)", () => {
    const fields576 = buildAssStyleFields(DEFAULT_CAPTION_STYLE, 576);
    const fields1080 = buildAssStyleFields(DEFAULT_CAPTION_STYLE, CAPTION_REFERENCE_HEIGHT);
    expect(fields576.fontSize).toBeLessThan(fields1080.fontSize);
  });

  it("computes a background alpha corresponding to 70% opacity", () => {
    const fields = buildAssStyleFields(DEFAULT_CAPTION_STYLE, 1080);
    // ASS alpha is inverted (00 = opaque); 70% opaque -> 30% transparent -> ~0x4D.
    expect(fields.backColour).toBe("&H4D000000");
  });
});

describe("buildForceStyle", () => {
  it("includes FontName, computed FontSize, colors, and alignment", () => {
    const style = buildForceStyle({ ...DEFAULT_CAPTION_STYLE, font: "Georgia", fontSize: 2.2 }, 1080);
    expect(style).toContain("FontName=Georgia");
    expect(style).toContain(`FontSize=${Math.round((2.2 / 100) * 1080)}`);
    expect(style).toContain("Alignment=2"); // "bottom" per ALIGNMENT_BY_POSITION
  });

  it("only includes BackColour when background is enabled", () => {
    const withoutBg = buildForceStyle({ ...DEFAULT_CAPTION_STYLE, background: false }, 1080);
    const withBg = buildForceStyle({ ...DEFAULT_CAPTION_STYLE, background: true }, 1080);
    expect(withoutBg).not.toContain("BackColour");
    expect(withBg).toContain("BackColour");
    expect(withBg).toContain("BorderStyle=3");
    expect(withoutBg).toContain("BorderStyle=1");
  });
});

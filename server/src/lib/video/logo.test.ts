import { describe, expect, it } from "vitest";
import { DEFAULT_LOGO_POSITION, logoPositionToOverlayXY, toLogoPosition } from "@/lib/video/logo";

describe("toLogoPosition", () => {
  it("passes through a valid position", () => {
    expect(toLogoPosition("top-left")).toBe("top-left");
  });

  it("falls back to the default for an invalid/legacy value", () => {
    expect(toLogoPosition("nonsense")).toBe(DEFAULT_LOGO_POSITION);
  });
});

describe("logoPositionToOverlayXY", () => {
  it("anchors bottom-right using W/H filtergraph variables, not literal pixels", () => {
    const { x, y } = logoPositionToOverlayXY("bottom-right", 3, 4);
    expect(x).toBe("(W-w-W*0.0300)");
    expect(y).toBe("(H-h-H*0.0400)");
  });

  it("anchors top-left", () => {
    const { x, y } = logoPositionToOverlayXY("top-left", 3, 4);
    expect(x).toBe("(W*0.0300)");
    expect(y).toBe("(H*0.0400)");
  });
});

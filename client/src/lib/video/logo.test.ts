import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGO_POSITION,
  logoPositionToCss,
  logoPositionToOverlayXY,
  toLogoPosition,
} from "@/lib/video/logo";

describe("toLogoPosition", () => {
  it("passes through a valid position", () => {
    expect(toLogoPosition("top-left")).toBe("top-left");
  });

  it("falls back to the default for an invalid/legacy value", () => {
    expect(toLogoPosition("nonsense")).toBe(DEFAULT_LOGO_POSITION);
  });
});

describe("logoPositionToCss", () => {
  it("anchors bottom-right using percent (frame-relative, not px)", () => {
    const style = logoPositionToCss("bottom-right", 3, 4, 100);
    expect(style).toMatchObject({ position: "absolute", bottom: "4%", right: "3%" });
    expect(style.top).toBeUndefined();
    expect(style.left).toBeUndefined();
  });

  it("anchors top-left", () => {
    const style = logoPositionToCss("top-left", 3, 4, 100);
    expect(style).toMatchObject({ top: "4%", left: "3%" });
  });

  it("converts opacity 0-100 to CSS 0-1", () => {
    expect(logoPositionToCss("top-left", 0, 0, 51).opacity).toBe(0.51);
  });

  it("defaults to fully opaque when opacity is omitted", () => {
    expect(logoPositionToCss("top-left", 0, 0).opacity).toBe(1);
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

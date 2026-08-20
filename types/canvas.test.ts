import { describe, it, expect } from "vitest";
import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_TEXT_COLOR,
  NODE_COLORS,
} from "./canvas";

describe("canvas type identifiers", () => {
  it("pins the canvasNode/canvasEdge type identifiers used for future custom rendering registration", () => {
    expect(CANVAS_NODE_TYPE).toBe("canvasNode");
    expect(CANVAS_EDGE_TYPE).toBe("canvasEdge");
  });
});

describe("NODE_COLORS", () => {
  it("contains exactly 8 fill/text color pairs", () => {
    expect(NODE_COLORS).toHaveLength(8);
  });

  it("has a first (default) pair matching DEFAULT_NODE_COLOR/DEFAULT_NODE_TEXT_COLOR", () => {
    expect(NODE_COLORS[0]).toEqual({ color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR });
  });

  it("matches ui-context.md's documented Node Color Palette table, in order", () => {
    expect(NODE_COLORS).toEqual([
      { color: "#1F1F1F", textColor: "#EDEDED" },
      { color: "#10233D", textColor: "#52A8FF" },
      { color: "#2E1938", textColor: "#BF7AF0" },
      { color: "#331B00", textColor: "#FF990A" },
      { color: "#3C1618", textColor: "#FF6166" },
      { color: "#3A1726", textColor: "#F75F8F" },
      { color: "#0F2E18", textColor: "#62C073" },
      { color: "#062822", textColor: "#0AC7B4" },
    ]);
  });

  it("gives every pair a distinct fill color", () => {
    const colors = new Set(NODE_COLORS.map((pair) => pair.color));
    expect(colors.size).toBe(NODE_COLORS.length);
  });
});

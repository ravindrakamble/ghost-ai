import { describe, it, expect } from "vitest";
import { CANVAS_EDGE_TYPE, CANVAS_NODE_TYPE } from "./canvas";

describe("canvas type identifiers", () => {
  it("pins the canvasNode/canvasEdge type identifiers used for future custom rendering registration", () => {
    expect(CANVAS_NODE_TYPE).toBe("canvasNode");
    expect(CANVAS_EDGE_TYPE).toBe("canvasEdge");
  });
});

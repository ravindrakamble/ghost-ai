import { describe, it, expect } from "vitest";
import { isAiStatusMessage } from "./tasks";
import type { AiStatusMessage, AiStatusStage } from "./tasks";

describe("AiStatusStage / AiStatusMessage shape", () => {
  it("accepts exactly the four spec-23-matching stage values", () => {
    const stages: AiStatusStage[] = ["start", "processing", "complete", "error"];
    for (const stage of stages) {
      const message: AiStatusMessage = { stage };
      expect(message.stage).toBe(stage);
    }
  });

  it("allows text to be omitted (optional field)", () => {
    const message: AiStatusMessage = { stage: "start" };
    expect(message.text).toBeUndefined();
  });
});

describe("isAiStatusMessage", () => {
  it("accepts a message with a required stage and no text", () => {
    expect(isAiStatusMessage({ stage: "start" })).toBe(true);
  });

  it("accepts a message with stage and text (spec 23's actual broadcast shape)", () => {
    expect(isAiStatusMessage({ stage: "processing", text: "Interpreting your prompt…" })).toBe(true);
  });

  it("accepts every valid stage value", () => {
    for (const stage of ["start", "processing", "complete", "error"]) {
      expect(isAiStatusMessage({ stage })).toBe(true);
    }
  });

  it("rejects a missing stage", () => {
    expect(isAiStatusMessage({ text: "hello" })).toBe(false);
  });

  it("rejects an invalid/unrecognized stage value", () => {
    expect(isAiStatusMessage({ stage: "bogus" })).toBe(false);
  });

  it("rejects a non-string stage", () => {
    expect(isAiStatusMessage({ stage: 1 })).toBe(false);
  });

  it("rejects a non-string text field", () => {
    expect(isAiStatusMessage({ stage: "start", text: 123 })).toBe(false);
  });

  it("rejects null", () => {
    expect(isAiStatusMessage(null)).toBe(false);
  });

  it("rejects a non-object (string) payload", () => {
    expect(isAiStatusMessage("start")).toBe(false);
  });

  it("rejects an array payload", () => {
    expect(isAiStatusMessage(["start"])).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isAiStatusMessage(undefined)).toBe(false);
  });
});

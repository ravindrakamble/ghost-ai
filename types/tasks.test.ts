import { describe, it, expect } from "vitest";
import { AiChatMessageSchema, isAiStatusMessage } from "./tasks";
import type { AiChatMessage, AiStatusMessage, AiStatusStage } from "./tasks";

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

describe("AiChatMessageSchema (spec 25)", () => {
  const valid = {
    id: "chat-1",
    sender: "Ada",
    role: "user" as const,
    content: "Design an inventory system",
    timestamp: 1700000000000,
  };

  it("accepts a well-formed message with role 'user'", () => {
    const result = AiChatMessageSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      const message: AiChatMessage = result.data;
      expect(message).toEqual(valid);
    }
  });

  it("accepts a well-formed message with role 'assistant' (schema-supported, unreachable through this spec's own send path)", () => {
    const result = AiChatMessageSchema.safeParse({ ...valid, role: "assistant" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing id", () => {
    const { id, ...rest } = valid;
    void id;
    expect(AiChatMessageSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(AiChatMessageSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });

  it("rejects a missing sender", () => {
    const { sender, ...rest } = valid;
    void sender;
    expect(AiChatMessageSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty sender", () => {
    expect(AiChatMessageSchema.safeParse({ ...valid, sender: "" }).success).toBe(false);
  });

  it("rejects a missing role", () => {
    const { role, ...rest } = valid;
    void role;
    expect(AiChatMessageSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unrecognized role value", () => {
    expect(AiChatMessageSchema.safeParse({ ...valid, role: "system" }).success).toBe(false);
  });

  it("rejects a missing content", () => {
    const { content, ...rest } = valid;
    void content;
    expect(AiChatMessageSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty content", () => {
    expect(AiChatMessageSchema.safeParse({ ...valid, content: "" }).success).toBe(false);
  });

  it("rejects a missing timestamp", () => {
    const { timestamp, ...rest } = valid;
    void timestamp;
    expect(AiChatMessageSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-number timestamp", () => {
    expect(AiChatMessageSchema.safeParse({ ...valid, timestamp: "1700000000000" }).success).toBe(false);
  });

  it("rejects a non-finite timestamp", () => {
    expect(AiChatMessageSchema.safeParse({ ...valid, timestamp: Infinity }).success).toBe(false);
  });

  it("rejects a wholly foreign/non-object payload", () => {
    expect(AiChatMessageSchema.safeParse("not a message").success).toBe(false);
    expect(AiChatMessageSchema.safeParse(null).success).toBe(false);
    expect(AiChatMessageSchema.safeParse(undefined).success).toBe(false);
    expect(AiChatMessageSchema.safeParse([]).success).toBe(false);
  });

  it("rejects an ai-status-feed-shaped payload (stays structurally independent — acceptance criterion 6)", () => {
    expect(AiChatMessageSchema.safeParse({ stage: "processing", text: "Designing…" }).success).toBe(false);
  });
});

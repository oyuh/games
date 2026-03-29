import { describe, it, expect } from "vitest";
import {
  sanitizeText,
  sanitizeId,
  normalized,
  isOneWord,
  isClueTooSimilar,
} from "../zero/mutators/helpers";

// ───────────────────────────────────────────────────────────
// sanitizeText
// ───────────────────────────────────────────────────────────
describe("sanitizeText", () => {
  it("passes through normal text", () => {
    expect(sanitizeText("Hello world")).toBe("Hello world");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("strips basic HTML tags", () => {
    expect(sanitizeText("<b>bold</b>")).toBe("bold");
    expect(sanitizeText("<i>italic</i>")).toBe("italic");
  });

  it("strips <script> tags", () => {
    expect(sanitizeText('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it("strips nested/complex HTML", () => {
    expect(sanitizeText('<div class="evil"><img src=x onerror=alert(1)>text</div>')).toBe("text");
  });

  it("strips event handler attributes in tags", () => {
    const input = '<a onmouseover="steal()">click me</a>';
    expect(sanitizeText(input)).toBe("click me");
  });

  it("removes control characters", () => {
    expect(sanitizeText("hello\x00world")).toBe("helloworld");
    expect(sanitizeText("abc\x07def")).toBe("abcdef");
    expect(sanitizeText("\x01\x02\x03ok")).toBe("ok");
  });

  it("preserves tabs and newlines (normal whitespace)", () => {
    expect(sanitizeText("hello\nworld")).toBe("hello\nworld");
    expect(sanitizeText("hello\tworld")).toBe("hello\tworld");
  });

  it("handles empty string", () => {
    expect(sanitizeText("")).toBe("");
  });

  it("handles string with only tags", () => {
    expect(sanitizeText("<script></script>")).toBe("");
  });

  it("handles string with only whitespace", () => {
    expect(sanitizeText("   ")).toBe("");
  });

  it("strips SVG-based XSS", () => {
    expect(sanitizeText('<svg onload="alert(1)"/>')).toBe("");
  });

  it("strips iframe injection", () => {
    expect(sanitizeText('<iframe src="evil.com"></iframe>')).toBe("");
  });

  it("strips <img> with onerror", () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe("");
  });

  it("handles multiple injections in one string", () => {
    expect(sanitizeText('Hi <script>bad</script> there <b>bold</b> <img src=x>'))
      .toBe("Hi bad there bold");
  });

  it("preserves unicode/emoji in normal text", () => {
    expect(sanitizeText("Hello 🌍 world")).toBe("Hello 🌍 world");
  });

  it("preserves accented characters", () => {
    expect(sanitizeText("café résumé")).toBe("café résumé");
  });

  it("handles SQL-like payloads (not stripped, just sanitized of HTML)", () => {
    // SQL injection is handled at the DB layer (parameterized queries)
    // sanitizeText only handles HTML/control chars
    expect(sanitizeText("'; DROP TABLE users; --")).toBe("'; DROP TABLE users; --");
  });
});

// ───────────────────────────────────────────────────────────
// sanitizeId
// ───────────────────────────────────────────────────────────
describe("sanitizeId", () => {
  it("passes through a normal ID", () => {
    expect(sanitizeId("abc123")).toBe("abc123");
  });

  it("trims whitespace from IDs", () => {
    expect(sanitizeId("  abc  ")).toBe("abc");
  });

  it("throws on empty string", () => {
    expect(() => sanitizeId("")).toThrow("Invalid ID");
  });

  it("throws on whitespace-only string", () => {
    expect(() => sanitizeId("   ")).toThrow("Invalid ID");
  });

  it("throws on oversized IDs (>64 chars)", () => {
    const longId = "a".repeat(65);
    expect(() => sanitizeId(longId)).toThrow("Invalid ID");
  });

  it("accepts exactly 64 char IDs", () => {
    const id64 = "a".repeat(64);
    expect(sanitizeId(id64)).toBe(id64);
  });

  it("rejects extremely long payloads", () => {
    const megaId = "x".repeat(10_000);
    expect(() => sanitizeId(megaId)).toThrow("Invalid ID");
  });
});

// ───────────────────────────────────────────────────────────
// normalized
// ───────────────────────────────────────────────────────────
describe("normalized", () => {
  it("lowercases and trims", () => {
    expect(normalized("  HELLO  ")).toBe("hello");
  });

  it("handles already normalized input", () => {
    expect(normalized("hello")).toBe("hello");
  });
});

// ───────────────────────────────────────────────────────────
// isOneWord
// ───────────────────────────────────────────────────────────
describe("isOneWord", () => {
  it("returns true for a single word", () => {
    expect(isOneWord("hello")).toBe(true);
  });

  it("returns true for single word with whitespace padding", () => {
    expect(isOneWord("  hello  ")).toBe(true);
  });

  it("returns false for multiple words", () => {
    expect(isOneWord("hello world")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isOneWord("")).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────
// isClueTooSimilar
// ───────────────────────────────────────────────────────────
describe("isClueTooSimilar", () => {
  it("returns true for exact match (case-insensitive)", () => {
    expect(isClueTooSimilar("Cat", "cat")).toBe(true);
  });

  it("returns true if clue starts with the word", () => {
    expect(isClueTooSimilar("cats", "cat")).toBe(true);
  });

  it("returns true if word starts with the clue", () => {
    expect(isClueTooSimilar("cat", "cats")).toBe(true);
  });

  it("returns false for unrelated words", () => {
    expect(isClueTooSimilar("dog", "cat")).toBe(false);
  });

  it("handles trims and case insensitivity", () => {
    expect(isClueTooSimilar("  CAT  ", "cat")).toBe(true);
  });
});

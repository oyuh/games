import { describe, it, expect } from "vitest";
import {
  sanitizeText,
  sanitizeId,
  normalized,
  isOneWord,
  isClueTooSimilar,
} from "../zero/mutators/helpers";

describe("sanitizeText", () => {
  it.each([
    ["passes normal text through", "Hello world", "Hello world"],
    ["trims whitespace", "  hello  ", "hello"],
    ["strips tags but keeps their text", '<script>alert("xss")</script>', 'alert("xss")'],
    ["strips tags with attributes", '<div class="evil"><img src=x onerror=alert(1)>text</div>', "text"],
    ["strips self-closing tags", '<svg onload="alert(1)"/>', ""],
    ["strips paired tags with no text", '<iframe src="evil.com"></iframe>', ""],
    ["strips several injections in one string", "Hi <script>bad</script> there <b>bold</b> <img src=x>", "Hi bad there bold"],
    ["removes control characters", "\x01\x02\x03ok", "ok"],
    ["removes a NUL mid-string", "hello\x00world", "helloworld"],
    ["keeps newlines", "hello\nworld", "hello\nworld"],
    ["keeps tabs", "hello\ttab", "hello\ttab"],
    ["keeps emoji and accents", "café 🌍 résumé", "café 🌍 résumé"],
    // SQL injection is the DB layer's job (bound parameters), not this one's.
    ["leaves SQL-looking text alone", "'; DROP TABLE users; --", "'; DROP TABLE users; --"],
    ["returns empty for whitespace only", "   ", ""],
  ])("%s", (_name, input, expected) => {
    expect(sanitizeText(input)).toBe(expected);
  });
});

describe("sanitizeId", () => {
  it("trims and passes through a normal ID", () => {
    expect(sanitizeId("  abc123  ")).toBe("abc123");
  });

  it("throws on empty or whitespace-only IDs", () => {
    expect(() => sanitizeId("")).toThrow("Invalid ID");
    expect(() => sanitizeId("   ")).toThrow("Invalid ID");
  });

  it("accepts 64 characters and rejects 65", () => {
    expect(sanitizeId("a".repeat(64))).toBe("a".repeat(64));
    expect(() => sanitizeId("a".repeat(65))).toThrow("Invalid ID");
  });
});

describe("normalized", () => {
  it("lowercases and trims", () => {
    expect(normalized("  HELLO  ")).toBe("hello");
  });
});

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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateState, verifyState } from "../server/utils/slack-state";

describe("slack-state", () => {
  it("generateState returns a UUID-like string", () => {
    const state = generateState();
    expect(state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("verifyState succeeds for a fresh state", () => {
    const state = generateState();
    expect(verifyState(state)).toBe(true);
  });

  it("verifyState fails for an unknown state", () => {
    expect(verifyState("unknown-state-value")).toBe(false);
  });

  it("verifyState is single-use (consumed on verify)", () => {
    const state = generateState();
    expect(verifyState(state)).toBe(true);
    expect(verifyState(state)).toBe(false);
  });

  it("verifyState fails after TTL expires", () => {
    vi.useFakeTimers();
    try {
      const state = generateState();
      // Advance 11 minutes (TTL is 10 minutes)
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(verifyState(state)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

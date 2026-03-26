import { describe, it, expect } from "vitest";
import { resolveEmoji } from "../server/utils/emoji";
import { upsertCustomEmoji } from "../server/utils/db";

describe("resolveEmoji", () => {
  const teamId = "T-resolve";

  it("resolves a standard emoji to unicode", () => {
    const result = resolveEmoji(teamId, "thumbsup");
    expect(result.unicode).toBeDefined();
    expect(result.url).toBeUndefined();
  });

  it("resolves a Slack alias to unicode", () => {
    const result = resolveEmoji(teamId, "face_with_hand_over_mouth");
    expect(result.unicode).toBeDefined();
  });

  it("resolves emoji with skin tone modifier", () => {
    const result = resolveEmoji(teamId, "thumbsup::skin-tone-3");
    expect(result.unicode).toBeDefined();
    // Should contain the skin tone modifier
    expect(result.unicode!.length).toBeGreaterThan(
      resolveEmoji(teamId, "thumbsup").unicode!.length
    );
  });

  it("resolves a custom emoji to URL", () => {
    upsertCustomEmoji(teamId, "custom-test", "https://example.com/custom.png");

    const result = resolveEmoji(teamId, "custom-test");
    expect(result.url).toBe("https://example.com/custom.png");
    expect(result.unicode).toBeUndefined();
  });

  it("custom emoji takes priority over standard", () => {
    // Override a standard emoji name with a custom one
    upsertCustomEmoji(teamId, "heart", "https://example.com/custom-heart.png");

    const result = resolveEmoji(teamId, "heart");
    expect(result.url).toBe("https://example.com/custom-heart.png");
    expect(result.unicode).toBeUndefined();
  });

  it("returns empty object for unknown emoji", () => {
    const result = resolveEmoji(teamId, "totally_fake_emoji_xyz");
    expect(result.unicode).toBeUndefined();
    expect(result.url).toBeUndefined();
  });

  it("isolates custom emoji between teams", () => {
    upsertCustomEmoji("T-iso-A", "logo", "https://a.com/logo.png");

    const resultA = resolveEmoji("T-iso-A", "logo");
    const resultB = resolveEmoji("T-iso-B", "logo");

    expect(resultA.url).toBe("https://a.com/logo.png");
    expect(resultB.url).toBeUndefined();
  });
});

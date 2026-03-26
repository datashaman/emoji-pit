import { describe, it, expect } from "vitest";
import {
  stmtInsertReaction,
  stmtDeleteOneReaction,
  loadHistory,
  stmtDeleteTeamReactions,
  saveInstallation,
  getInstallation,
  deleteInstallation,
  getAllInstallations,
  saveSession,
  getSession,
  deleteSession,
  getBuckets,
  saveBuckets,
  getUserBuckets,
  saveUserBuckets,
  upsertCustomEmoji,
  getCustomEmojiMap,
  removeCustomEmoji,
  clearCustomEmoji,
} from "../server/utils/db";

describe("reactions", () => {
  const teamId = "T-react";

  it("inserts and loads reactions", () => {
    stmtInsertReaction.run(teamId, "U1", "fire", "🔥", null);
    stmtInsertReaction.run(teamId, "U1", "heart", "❤️", null);

    const history = loadHistory(teamId);
    expect(history).toHaveLength(2);
    expect(history[0].emoji).toBe("fire");
    expect(history[1].emoji).toBe("heart");
  });

  it("loads user-scoped reactions", () => {
    stmtInsertReaction.run(teamId, "U2", "rocket", "🚀", null);

    const u1History = loadHistory(teamId, "U1");
    const u2History = loadHistory(teamId, "U2");
    expect(u1History.every((r) => r.user_id === "U1")).toBe(true);
    expect(u2History.every((r) => r.user_id === "U2")).toBe(true);
  });

  it("deletes one reaction by team and emoji", () => {
    const before = loadHistory(teamId);
    const fireCount = before.filter((r) => r.emoji === "fire").length;

    stmtDeleteOneReaction.run(teamId, "fire");

    const after = loadHistory(teamId);
    const afterFireCount = after.filter((r) => r.emoji === "fire").length;
    expect(afterFireCount).toBe(fireCount - 1);
  });

  it("deletes all team reactions", () => {
    stmtDeleteTeamReactions.run(teamId);
    expect(loadHistory(teamId)).toHaveLength(0);
  });
});

describe("installations", () => {
  const inst = {
    team_id: "T-inst",
    team_name: "Test Team",
    bot_token: "xoxb-test",
    bot_user_id: "B1",
    installer_id: "U1",
    scope: "reactions:read",
  };

  it("saves and retrieves an installation", () => {
    saveInstallation(inst);
    const got = getInstallation("T-inst");
    expect(got).toBeDefined();
    expect(got!.team_name).toBe("Test Team");
    expect(got!.bot_token).toBe("xoxb-test");
  });

  it("lists all installations", () => {
    const all = getAllInstallations();
    expect(all.some((i) => i.team_id === "T-inst")).toBe(true);
  });

  it("deletes an installation", () => {
    deleteInstallation("T-inst");
    expect(getInstallation("T-inst")).toBeUndefined();
  });
});

describe("sessions", () => {
  it("saves and retrieves a session", () => {
    saveSession({
      token: "tok-1",
      team_id: "T1",
      user_id: "U1",
      user_name: "Alice",
      is_admin: 1,
    });

    const s = getSession("tok-1");
    expect(s).toBeDefined();
    expect(s!.user_name).toBe("Alice");
    expect(s!.is_admin).toBe(1);
  });

  it("returns undefined for unknown token", () => {
    expect(getSession("nonexistent")).toBeUndefined();
  });

  it("deletes a session", () => {
    deleteSession("tok-1");
    expect(getSession("tok-1")).toBeUndefined();
  });
});

describe("buckets", () => {
  const teamId = "T-buck";

  it("saves and retrieves team buckets in order", () => {
    saveBuckets(teamId, [
      { label: "Love", position: 0, emojis: '["heart"]' },
      { label: "Hype", position: 1, emojis: '["fire","rocket"]' },
    ]);

    const buckets = getBuckets(teamId);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].label).toBe("Love");
    expect(buckets[1].label).toBe("Hype");
    expect(JSON.parse(buckets[1].emojis)).toEqual(["fire", "rocket"]);
  });

  it("replaces buckets on re-save", () => {
    saveBuckets(teamId, [
      { label: "Only", position: 0, emojis: "[]" },
    ]);
    expect(getBuckets(teamId)).toHaveLength(1);
  });
});

describe("user buckets", () => {
  it("saves and retrieves user-specific buckets", () => {
    saveUserBuckets("T-ub", "U1", [
      { label: "Mine", position: 0, emojis: '["tada"]' },
    ]);

    const buckets = getUserBuckets("T-ub", "U1");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toBe("Mine");

    // Different user has no overrides
    expect(getUserBuckets("T-ub", "U2")).toHaveLength(0);
  });
});

describe("custom emoji", () => {
  const teamId = "T-emoji";

  it("upserts and retrieves custom emoji", () => {
    upsertCustomEmoji(teamId, "parrot", "https://example.com/parrot.gif");
    upsertCustomEmoji(teamId, "shipit", "https://example.com/shipit.png");

    const map = getCustomEmojiMap(teamId);
    expect(map["parrot"]).toBe("https://example.com/parrot.gif");
    expect(map["shipit"]).toBe("https://example.com/shipit.png");
  });

  it("upsert overwrites existing", () => {
    upsertCustomEmoji(teamId, "parrot", "https://example.com/parrot-v2.gif");
    expect(getCustomEmojiMap(teamId)["parrot"]).toBe("https://example.com/parrot-v2.gif");
  });

  it("removes a single custom emoji", () => {
    removeCustomEmoji(teamId, "parrot");
    const map = getCustomEmojiMap(teamId);
    expect(map["parrot"]).toBeUndefined();
    expect(map["shipit"]).toBeDefined();
  });

  it("clears all custom emoji for a team", () => {
    clearCustomEmoji(teamId);
    expect(Object.keys(getCustomEmojiMap(teamId))).toHaveLength(0);
  });

  it("isolates emoji between teams", () => {
    upsertCustomEmoji("T-A", "logo", "https://a.com/logo.png");
    upsertCustomEmoji("T-B", "logo", "https://b.com/logo.png");

    expect(getCustomEmojiMap("T-A")["logo"]).toBe("https://a.com/logo.png");
    expect(getCustomEmojiMap("T-B")["logo"]).toBe("https://b.com/logo.png");
  });
});

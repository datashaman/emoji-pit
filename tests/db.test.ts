import { describe, it, expect, beforeAll } from "vitest";
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
  getSessionByToken,
  deleteSession,
  getBuckets,
  saveBuckets,
  getUserBuckets,
  saveUserBuckets,
  upsertCustomEmoji,
  getCustomEmojiMap,
  removeCustomEmoji,
  clearCustomEmoji,
  createTvToken,
  getTvTokenTeam,
  listTvTokens,
  deleteTvToken,
  stmtHeatmap,
  stmtTopReactions,
  stmtTopChannels,
  stmtWeeklyTrend,
  stmtDeleteOldReactions,
  db,
} from "../server/utils/db";

describe("reactions", () => {
  const teamId = "T-react";

  it("inserts and loads reactions", () => {
    stmtInsertReaction.run(teamId, "U1", "fire", "🔥", null, "C1");
    stmtInsertReaction.run(teamId, "U1", "heart", "❤️", null, "C1");

    const history = loadHistory(teamId);
    expect(history).toHaveLength(2);
    expect(history[0].emoji).toBe("fire");
    expect(history[1].emoji).toBe("heart");
  });

  it("inserts reaction with channel", () => {
    stmtInsertReaction.run(teamId, "U1", "tada", "🎉", null, "C2");
    const history = loadHistory(teamId);
    const tada = history.find((r) => r.emoji === "tada");
    expect(tada).toBeDefined();
    expect(tada!.channel).toBe("C2");
  });

  it("inserts reaction without channel", () => {
    stmtInsertReaction.run(teamId, "U1", "zap", "⚡", null, null);
    const history = loadHistory(teamId);
    const zap = history.find((r) => r.emoji === "zap");
    expect(zap).toBeDefined();
    expect(zap!.channel).toBeNull();
  });

  it("loads user-scoped reactions", () => {
    stmtInsertReaction.run(teamId, "U2", "rocket", "🚀", null, "C1");

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

    const s = getSessionByToken("tok-1");
    expect(s).toBeDefined();
    expect(s!.user_name).toBe("Alice");
    expect(s!.is_admin).toBe(1);
  });

  it("returns undefined for unknown token", () => {
    expect(getSessionByToken("nonexistent")).toBeUndefined();
  });

  it("deletes a session", () => {
    deleteSession("tok-1");
    expect(getSessionByToken("tok-1")).toBeUndefined();
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

describe("tv tokens", () => {
  const teamId = "T-tv";

  it("creates and retrieves a TV token", () => {
    const token = createTvToken(teamId, "Office TV", "U-admin");
    expect(token.token).toBeTruthy();
    expect(token.team_id).toBe(teamId);
    expect(token.label).toBe("Office TV");
    expect(token.created_by).toBe("U-admin");

    const retrieved = getTvTokenTeam(token.token);
    expect(retrieved).toBeDefined();
    expect(retrieved!.team_id).toBe(teamId);
  });

  it("lists tokens for a team", () => {
    createTvToken(teamId, "Lobby Screen", "U-admin");
    const tokens = listTvTokens(teamId);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.some((t) => t.label === "Office TV")).toBe(true);
    expect(tokens.some((t) => t.label === "Lobby Screen")).toBe(true);
  });

  it("returns undefined for unknown token", () => {
    expect(getTvTokenTeam("nonexistent-token")).toBeUndefined();
  });

  it("deletes a TV token", () => {
    const token = createTvToken(teamId, "Temp", "U-admin");
    deleteTvToken(token.token, teamId);
    expect(getTvTokenTeam(token.token)).toBeUndefined();
  });

  it("does not delete token from wrong team", () => {
    const token = createTvToken(teamId, "Protected", "U-admin");
    deleteTvToken(token.token, "T-wrong");
    expect(getTvTokenTeam(token.token)).toBeDefined();
  });
});

describe("analytics queries", () => {
  const teamId = "T-analytics";
  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  // Seed data: reactions over the past 3 days across 2 channels
  beforeAll(() => {
    // Clear any existing data
    db.prepare("DELETE FROM reactions WHERE team_id = ?").run(teamId);

    // Day 0 (today): 5 reactions
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(teamId, "U1", "fire", "🔥", "C1", now - 3600 * i);
    }
    db.prepare(
      "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(teamId, "U1", "heart", "❤️", "C2", now - 1800);
    db.prepare(
      "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(teamId, "U2", "fire", "🔥", "C1", now - 7200);

    // Day -1 (yesterday): 3 reactions
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(teamId, "U1", "rocket", "🚀", "C1", now - oneDay - 3600 * i);
    }

    // Day -2: 2 reactions (one with null channel for testing)
    db.prepare(
      "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(teamId, "U2", "tada", "🎉", null, now - 2 * oneDay);
    db.prepare(
      "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(teamId, "U2", "fire", "🔥", "C2", now - 2 * oneDay);
  });

  it("heatmap returns hourly counts", () => {
    const rows = stmtHeatmap.all(teamId, now - oneDay) as { hour: number; count: number }[];
    expect(rows.length).toBeGreaterThan(0);
    // All rows should have valid hours
    for (const row of rows) {
      expect(row.hour).toBeGreaterThanOrEqual(0);
      expect(row.hour).toBeLessThan(24);
      expect(row.count).toBeGreaterThan(0);
    }
  });

  it("top reactions returns emoji counts sorted by count desc", () => {
    const since = now - 7 * oneDay;
    const rows = stmtTopReactions.all(teamId, since) as { emoji: string; count: number }[];
    expect(rows.length).toBeGreaterThan(0);
    // Fire should be the top emoji (5 total across all days)
    expect(rows[0].emoji).toBe("fire");
    // Should be sorted descending
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].count).toBeLessThanOrEqual(rows[i - 1].count);
    }
  });

  it("top channels excludes null channels", () => {
    const since = now - 7 * oneDay;
    const rows = stmtTopChannels.all(teamId, since) as { channel: string; count: number }[];
    for (const row of rows) {
      expect(row.channel).not.toBeNull();
    }
  });

  it("top channels returns channel counts", () => {
    const since = now - 7 * oneDay;
    const rows = stmtTopChannels.all(teamId, since) as { channel: string; count: number }[];
    expect(rows.length).toBeGreaterThan(0);
    // C1 should have the most reactions
    expect(rows[0].channel).toBe("C1");
  });

  it("weekly trend returns daily counts", () => {
    const since = now - 7 * oneDay;
    const rows = stmtWeeklyTrend.all(teamId, since) as { date: string; count: number }[];
    expect(rows.length).toBeGreaterThan(0);
    // Each row should have a valid date format
    for (const row of rows) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.count).toBeGreaterThan(0);
    }
    // Should be sorted ascending
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date >= rows[i - 1].date).toBe(true);
    }
  });
});

describe("data retention", () => {
  it("deletes reactions older than 90 days", () => {
    const teamId = "T-retention";
    const now = Math.floor(Date.now() / 1000);
    const ninetyOneDaysAgo = now - 91 * 86400;
    const eightNineDaysAgo = now - 89 * 86400;

    // Insert an old reaction and a recent one
    db.prepare(
      "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(teamId, "U1", "old", null, null, ninetyOneDaysAgo);
    db.prepare(
      "INSERT INTO reactions (team_id, user_id, emoji, unicode, channel, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(teamId, "U1", "recent", null, null, eightNineDaysAgo);

    const result = stmtDeleteOldReactions.run();
    expect(result.changes).toBeGreaterThanOrEqual(1);

    const remaining = db.prepare(
      "SELECT emoji FROM reactions WHERE team_id = ?"
    ).all(teamId) as { emoji: string }[];
    expect(remaining.some((r) => r.emoji === "old")).toBe(false);
    expect(remaining.some((r) => r.emoji === "recent")).toBe(true);
  });
});

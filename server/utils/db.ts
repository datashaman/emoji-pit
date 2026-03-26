import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────
export interface ReactionRecord {
  emoji: string;
  unicode?: string;
  url?: string;
  team_id: string;
  user_id: string;
}

export interface Installation {
  team_id: string;
  team_name: string;
  bot_token: string;
  bot_user_id: string;
  installer_id: string;
  scope: string;
}

export interface BucketRecord {
  id: number;
  team_id: string;
  label: string;
  position: number;
  emojis: string; // JSON array
}

export interface SessionRecord {
  token: string;
  team_id: string;
  user_id: string;
  user_name: string;
  is_admin: number;
}

// ── Database init ────────────────────────────────────────────────────────────
const DATA_DIR =
  process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : process.cwd());
const DB_PATH = path.join(DATA_DIR, "emoji-pit.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS installations (
    team_id       TEXT PRIMARY KEY,
    team_name     TEXT NOT NULL,
    bot_token     TEXT NOT NULL,
    bot_user_id   TEXT NOT NULL,
    installer_id  TEXT NOT NULL,
    scope         TEXT NOT NULL,
    installed_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    unicode     TEXT,
    url         TEXT,
    created_at  INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_team ON reactions(team_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_team_user ON reactions(team_id, user_id);

  CREATE TABLE IF NOT EXISTS buckets (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id   TEXT NOT NULL,
    label     TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    emojis    TEXT NOT NULL DEFAULT '[]',
    UNIQUE(team_id, label)
  );
  CREATE INDEX IF NOT EXISTS idx_buckets_team ON buckets(team_id);

  CREATE TABLE IF NOT EXISTS user_buckets (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id   TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    label     TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    emojis    TEXT NOT NULL DEFAULT '[]',
    UNIQUE(team_id, user_id, label)
  );
  CREATE INDEX IF NOT EXISTS idx_user_buckets_team_user ON user_buckets(team_id, user_id);

  CREATE TABLE IF NOT EXISTS custom_emoji (
    team_id   TEXT NOT NULL,
    name      TEXT NOT NULL,
    url       TEXT NOT NULL,
    PRIMARY KEY (team_id, name)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    team_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    is_admin    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

// ── Migration: handle old reactions table without team_id/user_id ─────────
const columns = db
  .prepare("PRAGMA table_info(reactions)")
  .all() as { name: string }[];
const hasTeamId = columns.some((c) => c.name === "team_id");
if (!hasTeamId && columns.length > 0) {
  // Old table exists without team_id — migrate
  db.exec(`
    ALTER TABLE reactions RENAME TO reactions_old;
    CREATE TABLE reactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      emoji       TEXT NOT NULL,
      unicode     TEXT,
      url         TEXT,
      created_at  INTEGER DEFAULT (unixepoch())
    );
    INSERT INTO reactions (emoji, unicode, url, created_at, team_id, user_id)
      SELECT emoji, unicode, url, created_at, 'legacy', 'unknown' FROM reactions_old;
    DROP TABLE reactions_old;
    CREATE INDEX IF NOT EXISTS idx_reactions_team ON reactions(team_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_team_user ON reactions(team_id, user_id);
  `);
  console.log("[db] migrated reactions table to include team_id/user_id");
}

// ── Reactions ────────────────────────────────────────────────────────────────
export const stmtInsertReaction = db.prepare(
  "INSERT INTO reactions (team_id, user_id, emoji, unicode, url) VALUES (?, ?, ?, ?, ?)"
);
export const stmtDeleteOneReaction = db.prepare(
  "DELETE FROM reactions WHERE id = (SELECT id FROM reactions WHERE team_id = ? AND emoji = ? LIMIT 1)"
);
export const stmtSelectTeamReactions = db.prepare(
  "SELECT emoji, unicode, url, user_id FROM reactions WHERE team_id = ? ORDER BY id"
);
export const stmtSelectUserReactions = db.prepare(
  "SELECT emoji, unicode, url, user_id FROM reactions WHERE team_id = ? AND user_id = ? ORDER BY id"
);
export const stmtDeleteTeamReactions = db.prepare(
  "DELETE FROM reactions WHERE team_id = ?"
);
export const stmtCountTeam = db.prepare(
  "SELECT COUNT(*) as count FROM reactions WHERE team_id = ?"
);
export const stmtCountByEmojiTeam = db.prepare(
  "SELECT emoji, COUNT(*) as count FROM reactions WHERE team_id = ? GROUP BY emoji ORDER BY count DESC"
);

export function loadHistory(
  teamId: string,
  userId?: string
): ReactionRecord[] {
  if (userId) {
    return stmtSelectUserReactions.all(teamId, userId) as ReactionRecord[];
  }
  return stmtSelectTeamReactions.all(teamId) as ReactionRecord[];
}

// ── Installations ────────────────────────────────────────────────────────────
const stmtUpsertInstallation = db.prepare(`
  INSERT OR REPLACE INTO installations (team_id, team_name, bot_token, bot_user_id, installer_id, scope)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const stmtGetInstallation = db.prepare(
  "SELECT * FROM installations WHERE team_id = ?"
);
const stmtDeleteInstallation = db.prepare(
  "DELETE FROM installations WHERE team_id = ?"
);
const stmtAllInstallations = db.prepare("SELECT * FROM installations");

export function saveInstallation(inst: Installation): void {
  stmtUpsertInstallation.run(
    inst.team_id,
    inst.team_name,
    inst.bot_token,
    inst.bot_user_id,
    inst.installer_id,
    inst.scope
  );
}

export function getInstallation(teamId: string): Installation | undefined {
  return stmtGetInstallation.get(teamId) as Installation | undefined;
}

export function deleteInstallation(teamId: string): void {
  stmtDeleteInstallation.run(teamId);
}

export function getAllInstallations(): Installation[] {
  return stmtAllInstallations.all() as Installation[];
}

// ── Sessions ─────────────────────────────────────────────────────────────────
const stmtUpsertSession = db.prepare(`
  INSERT OR REPLACE INTO sessions (token, team_id, user_id, user_name, is_admin)
  VALUES (?, ?, ?, ?, ?)
`);
const stmtGetSession = db.prepare("SELECT * FROM sessions WHERE token = ?");
const stmtDeleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");

export function saveSession(session: SessionRecord): void {
  stmtUpsertSession.run(
    session.token,
    session.team_id,
    session.user_id,
    session.user_name,
    session.is_admin
  );
}

export function getSession(token: string): SessionRecord | undefined {
  return stmtGetSession.get(token) as SessionRecord | undefined;
}

export function deleteSession(token: string): void {
  stmtDeleteSession.run(token);
}

// ── Buckets ──────────────────────────────────────────────────────────────────
const stmtGetBuckets = db.prepare(
  "SELECT * FROM buckets WHERE team_id = ? ORDER BY position"
);
const stmtDeleteBuckets = db.prepare("DELETE FROM buckets WHERE team_id = ?");
const stmtInsertBucket = db.prepare(
  "INSERT INTO buckets (team_id, label, position, emojis) VALUES (?, ?, ?, ?)"
);

export function getBuckets(teamId: string): BucketRecord[] {
  return stmtGetBuckets.all(teamId) as BucketRecord[];
}

export const saveBuckets = db.transaction(
  (teamId: string, buckets: { label: string; position: number; emojis: string }[]) => {
    stmtDeleteBuckets.run(teamId);
    for (const b of buckets) {
      stmtInsertBucket.run(teamId, b.label, b.position, b.emojis);
    }
  }
);

// ── User Buckets ─────────────────────────────────────────────────────────────
const stmtGetUserBuckets = db.prepare(
  "SELECT * FROM user_buckets WHERE team_id = ? AND user_id = ? ORDER BY position"
);
const stmtDeleteUserBuckets = db.prepare(
  "DELETE FROM user_buckets WHERE team_id = ? AND user_id = ?"
);
const stmtInsertUserBucket = db.prepare(
  "INSERT INTO user_buckets (team_id, user_id, label, position, emojis) VALUES (?, ?, ?, ?, ?)"
);

export function getUserBuckets(
  teamId: string,
  userId: string
): BucketRecord[] {
  return stmtGetUserBuckets.all(teamId, userId) as BucketRecord[];
}

export const saveUserBuckets = db.transaction(
  (
    teamId: string,
    userId: string,
    buckets: { label: string; position: number; emojis: string }[]
  ) => {
    stmtDeleteUserBuckets.run(teamId, userId);
    for (const b of buckets) {
      stmtInsertUserBucket.run(teamId, userId, b.label, b.position, b.emojis);
    }
  }
);

// ── Custom Emoji ─────────────────────────────────────────────────────────────
const stmtGetCustomEmoji = db.prepare(
  "SELECT name, url FROM custom_emoji WHERE team_id = ?"
);
const stmtUpsertCustomEmoji = db.prepare(
  "INSERT OR REPLACE INTO custom_emoji (team_id, name, url) VALUES (?, ?, ?)"
);
const stmtDeleteCustomEmojiOne = db.prepare(
  "DELETE FROM custom_emoji WHERE team_id = ? AND name = ?"
);
const stmtDeleteCustomEmojiTeam = db.prepare(
  "DELETE FROM custom_emoji WHERE team_id = ?"
);

export function getCustomEmojiMap(
  teamId: string
): Record<string, string> {
  const rows = stmtGetCustomEmoji.all(teamId) as { name: string; url: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.name] = r.url;
  return map;
}

export function upsertCustomEmoji(
  teamId: string,
  name: string,
  url: string
): void {
  stmtUpsertCustomEmoji.run(teamId, name, url);
}

export function removeCustomEmoji(teamId: string, name: string): void {
  stmtDeleteCustomEmojiOne.run(teamId, name);
}

export function clearCustomEmoji(teamId: string): void {
  stmtDeleteCustomEmojiTeam.run(teamId);
}

console.log(`[db] opened ${DB_PATH}`);

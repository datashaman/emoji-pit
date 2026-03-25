import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface ReactionRecord {
  emoji: string;
  unicode?: string;
  url?: string;
}

const DATA_DIR = fs.existsSync("/data") ? "/data" : process.cwd();
const DB_PATH = path.join(DATA_DIR, "emoji-pit.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emoji TEXT NOT NULL,
    unicode TEXT,
    url TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

export const stmtInsert = db.prepare(
  "INSERT INTO reactions (emoji, unicode, url) VALUES (?, ?, ?)"
);
export const stmtDeleteOne = db.prepare(
  "DELETE FROM reactions WHERE id = (SELECT id FROM reactions WHERE emoji = ? LIMIT 1)"
);
export const stmtSelectAll = db.prepare(
  "SELECT emoji, unicode, url FROM reactions ORDER BY id"
);
export const stmtDeleteAll = db.prepare("DELETE FROM reactions");
export const stmtCount = db.prepare(
  "SELECT COUNT(*) as count FROM reactions"
);
export const stmtCountByEmoji = db.prepare(
  "SELECT emoji, COUNT(*) as count FROM reactions GROUP BY emoji ORDER BY count DESC"
);

export function loadHistory(): ReactionRecord[] {
  return stmtSelectAll.all() as ReactionRecord[];
}

console.log(
  `[db] opened ${DB_PATH} (${(stmtCount.get() as { count: number }).count} reactions)`
);

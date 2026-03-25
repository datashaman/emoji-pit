import "dotenv/config";
import bolt from "@slack/bolt";
const { App } = bolt;
import { WebSocket, WebSocketServer } from "ws";
import { nameToEmoji } from "gemoji";
import Database from "better-sqlite3";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ── Emoji resolution ─────────────────────────────────────────────────────────
// Maps custom workspace emoji names to their image URLs
const customEmoji: Record<string, string> = {};

async function loadCustomEmoji(): Promise<void> {
  try {
    const result = await app.client.emoji.list();
    if (result.ok && result.emoji) {
      for (const [name, value] of Object.entries(result.emoji)) {
        if (typeof value === "string" && !value.startsWith("alias:")) {
          customEmoji[name] = value;
        }
      }
      console.log(`[emoji] loaded ${Object.keys(customEmoji).length} custom emoji`);
    }
  } catch (err) {
    console.warn("[emoji] failed to load custom emoji (add emoji:read scope):", (err as Error).message);
  }
}

// Slack skin tone suffix → Unicode modifier
const SKIN_TONES: Record<string, string> = {
  "skin-tone-2": "\u{1F3FB}",
  "skin-tone-3": "\u{1F3FC}",
  "skin-tone-4": "\u{1F3FD}",
  "skin-tone-5": "\u{1F3FE}",
  "skin-tone-6": "\u{1F3FF}",
};

function resolveEmoji(name: string): { unicode?: string; url?: string } {
  // Check custom workspace emoji first
  if (customEmoji[name]) return { url: customEmoji[name] };

  // Handle Slack skin tone format: "emoji_name::skin-tone-N"
  let baseName = name;
  let skinTone = "";
  const skinMatch = name.match(/^(.+?)::?(skin-tone-\d)$/);
  if (skinMatch) {
    baseName = skinMatch[1];
    skinTone = SKIN_TONES[skinMatch[2]] || "";
  }

  // Check custom emoji for base name too
  if (customEmoji[baseName]) return { url: customEmoji[baseName] };

  const unicode = nameToEmoji[baseName];
  if (unicode) return { unicode: unicode + skinTone };

  return {};
}

// ── Reaction history (persisted to SQLite) ────────────────────────────────────
interface ReactionRecord {
  emoji: string;
  unicode?: string;
  url?: string;
}

const DATA_DIR = fs.existsSync("/data") ? "/data" : __dirname;
const DB_PATH = path.join(DATA_DIR, "emoji-pit.db");
const db = new Database(DB_PATH);
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

const stmtInsert = db.prepare("INSERT INTO reactions (emoji, unicode, url) VALUES (?, ?, ?)");
const stmtDeleteOne = db.prepare("DELETE FROM reactions WHERE id = (SELECT id FROM reactions WHERE emoji = ? LIMIT 1)");
const stmtSelectAll = db.prepare("SELECT emoji, unicode, url FROM reactions ORDER BY id");
const stmtDeleteAll = db.prepare("DELETE FROM reactions");
const stmtCount = db.prepare("SELECT COUNT(*) as count FROM reactions");
const stmtCountByEmoji = db.prepare("SELECT emoji, COUNT(*) as count FROM reactions GROUP BY emoji ORDER BY count DESC");

function loadHistory(): ReactionRecord[] {
  const rows = stmtSelectAll.all() as ReactionRecord[];
  console.log(`[history] loaded ${rows.length} reactions from SQLite`);
  return rows;
}

console.log(`[db] opened ${DB_PATH} (${(stmtCount.get() as { count: number }).count} reactions)`);

// ── HTTP server (serves the chart UI + WebSocket upgrade) ────────────────────
const httpServer = http.createServer((req, res) => {
  console.log(`[http] ${req.method} ${req.url}`);
  if (req.url === "/" || req.url === "/index.html") {
    const file = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(file);
  } else if (req.url === "/reset" && req.method === "POST") {
    stmtDeleteAll.run();
    broadcast({ type: "reset" });
    console.log("[reset] history cleared");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// ── WebSocket server (broadcasts emoji events to all connected browsers) ─────
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[ws] client connected (${clients.size} total)`);

  // Send reaction history for replay
  const history = loadHistory();
  if (history.length > 0) {
    ws.send(JSON.stringify({ type: "history", reactions: history }));
    console.log(`[ws] sent ${history.length} historical reactions`);
  }

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
  ws.on("error", (err) => {
    console.error(`[ws] client error:`, err.message);
  });
});

function broadcast(data: Record<string, unknown>): void {
  const msg = JSON.stringify(data);
  let sent = 0;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) { client.send(msg); sent++; }
  }
  console.log(`[broadcast] → ${sent}/${clients.size} clients`);
}

// ── Slack event listeners ────────────────────────────────────────────────────
app.event("reaction_added", async ({ event }) => {
  const resolved = resolveEmoji(event.reaction);
  console.log(`[slack] reaction_added: :${event.reaction}: by ${event.user} in ${event.item.channel}`);

  stmtInsert.run(event.reaction, resolved.unicode ?? null, resolved.url ?? null);

  broadcast({
    type: "reaction",
    emoji: event.reaction,
    ...resolved,
    user: event.user,
    channel: event.item.channel,
    ts: Date.now(),
  });
});

app.event("emoji_changed", async ({ event }) => {
  const e = event as unknown as Record<string, unknown>;
  const subtype = e.subtype as string;

  if (subtype === "add") {
    const name = e.name as string;
    const value = e.value as string;
    if (!value.startsWith("alias:")) {
      customEmoji[name] = value;
      console.log(`[slack] emoji_changed/add: :${name}:`);
      broadcast({ type: "emoji_added", emoji: name, url: value });
    }
  } else if (subtype === "remove") {
    const names = e.names as string[];
    for (const name of names) {
      delete customEmoji[name];
      console.log(`[slack] emoji_changed/remove: :${name}:`);
    }
    broadcast({ type: "emoji_removed", names });
  } else if (subtype === "rename") {
    const oldName = e.old_name as string;
    const newName = e.new_name as string;
    const value = e.value as string;
    delete customEmoji[oldName];
    if (!value.startsWith("alias:")) {
      customEmoji[newName] = value;
    }
    console.log(`[slack] emoji_changed/rename: :${oldName}: → :${newName}:`);
    broadcast({ type: "emoji_renamed", oldName, newName, url: value });
  }
});

app.event("reaction_removed", async ({ event }) => {
  const resolved = resolveEmoji(event.reaction);
  console.log(`[slack] reaction_removed: :${event.reaction}: by ${event.user} in ${event.item.channel}`);

  stmtDeleteOne.run(event.reaction);

  broadcast({
    type: "reaction_removed",
    emoji: event.reaction,
    ...resolved,
    user: event.user,
    channel: event.item.channel,
    ts: Date.now(),
  });
});

// ── App Home ──────────────────────────────────────────────────────────────────
const DASHBOARD_URL = process.env.DASHBOARD_URL || `http://localhost:${PORT}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStatsBlocks(): any[] {
  const totalReactions = (stmtCount.get() as { count: number }).count;

  // Top 10 emoji from DB
  const emojiRows = stmtCountByEmoji.all() as { emoji: string; count: number }[];
  const top = emojiRows.slice(0, 10).map(r => [r.emoji, r.count] as [string, number]);
  const counts: Record<string, number> = {};
  for (const r of emojiRows) counts[r.emoji] = r.count;

  // Build top emoji list
  const chartLines = top.map(([name, count], i) => {
    const displayName = name.replace(/::?skin-tone-\d$/, "");
    return `${i + 1}. :${displayName}:  \u00d7 *${count}*`;
  });

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Emoji Pit", emoji: true },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Total reactions:* ${totalReactions}\n*Unique emoji:* ${Object.keys(counts).length}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Open Dashboard" },
        url: DASHBOARD_URL,
        action_id: "open_dashboard",
      },
    },
  ];

  if (chartLines.length > 0) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Top emoji*\n" + chartLines.join("\n"),
        },
      },
    );
  }

  blocks.push(
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Last updated: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`,
        },
      ],
    },
  );

  return blocks;
}

async function publishHome(userId: string): Promise<void> {
  try {
    await app.client.views.publish({
      user_id: userId,
      view: {
        type: "home",
        blocks: buildStatsBlocks(),
      },
    });
    console.log(`[home] published for ${userId}`);
  } catch (err) {
    console.error("[home] failed to publish:", (err as Error).message);
  }
}

// Acknowledge the dashboard button click (Slack requires it)
app.action("open_dashboard", async ({ ack }) => {
  await ack();
});

// Track users who have opened the home tab so we can update them
const homeUsers = new Set<string>();

// Publish home when user opens it
app.event("app_home_opened", async ({ event }) => {
  homeUsers.add(event.user);
  await publishHome(event.user);
});

// Refresh all home tabs periodically (every 30s if there are reactions)
let lastHistoryCount = (stmtCount.get() as { count: number }).count;
setInterval(async () => {
  const currentCount = (stmtCount.get() as { count: number }).count;
  if (currentCount !== lastHistoryCount && homeUsers.size > 0) {
    lastHistoryCount = currentCount;
    for (const userId of homeUsers) {
      await publishHome(userId);
    }
  }
}, 30000);

// ── Start ─────────────────────────────────────────────────────────────────────
console.log("[init] connecting to Slack...");
await app.start();
console.log("[init] Slack connected (Socket Mode)");
await loadCustomEmoji();
httpServer.listen(PORT, () => {
  console.log(`[init] HTTP + WebSocket server → http://localhost:${PORT}`);
});

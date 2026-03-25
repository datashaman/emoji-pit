import "dotenv/config";
import bolt from "@slack/bolt";
const { App } = bolt;
import { WebSocket, WebSocketServer } from "ws";
import { nameToEmoji } from "gemoji";
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

// ── Reaction history (persisted to disk, replayed to new clients) ─────────────
interface ReactionRecord {
  emoji: string;
  unicode?: string;
  url?: string;
}

const HISTORY_FILE = path.join(__dirname, "reactions.json");

function loadHistory(): ReactionRecord[] {
  try {
    const data = fs.readFileSync(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      console.log(`[history] loaded ${parsed.length} reactions from disk`);
      return parsed;
    }
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
  }
  return [];
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveHistory(): void {
  // Debounce writes — at most once per second
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(reactionHistory));
  }, 1000);
}

const reactionHistory: ReactionRecord[] = loadHistory();

// ── HTTP server (serves the chart UI + WebSocket upgrade) ────────────────────
const httpServer = http.createServer((req, res) => {
  console.log(`[http] ${req.method} ${req.url}`);
  if (req.url === "/" || req.url === "/index.html") {
    const file = fs.readFileSync(path.join(__dirname, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(file);
  } else if (req.url === "/reset" && req.method === "POST") {
    reactionHistory.length = 0;
    fs.writeFileSync(HISTORY_FILE, "[]");
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
  if (reactionHistory.length > 0) {
    ws.send(JSON.stringify({ type: "history", reactions: reactionHistory }));
    console.log(`[ws] sent ${reactionHistory.length} historical reactions`);
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

  reactionHistory.push({ emoji: event.reaction, ...resolved });
  saveHistory();

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

  // Remove first matching reaction from history
  const idx = reactionHistory.findIndex(r => r.emoji === event.reaction);
  if (idx !== -1) { reactionHistory.splice(idx, 1); saveHistory(); }

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
  const totalReactions = reactionHistory.length;

  // Count emoji occurrences
  const counts: Record<string, number> = {};
  for (const r of reactionHistory) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  }

  // Top 10 emoji
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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
let lastHistoryLength = reactionHistory.length;
setInterval(async () => {
  if (reactionHistory.length !== lastHistoryLength && homeUsers.size > 0) {
    lastHistoryLength = reactionHistory.length;
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

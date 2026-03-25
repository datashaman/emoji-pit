import bolt from "@slack/bolt";
import { bus } from "../utils/bus";
import {
  stmtInsert,
  stmtDeleteOne,
  stmtCount,
  stmtCountByEmoji,
} from "../utils/db";
import {
  resolveEmoji,
  loadCustomEmoji,
  setCustomEmoji,
  deleteCustomEmoji,
} from "../utils/emoji";

const { App } = bolt;

export default defineNitroPlugin(async () => {
  if (
    !process.env.SLACK_BOT_TOKEN ||
    !process.env.SLACK_APP_TOKEN ||
    !process.env.SLACK_SIGNING_SECRET
  ) {
    console.warn(
      "[slack] missing credentials — Slack integration disabled. Set SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, and SLACK_APP_TOKEN."
    );
    return;
  }

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
  });

  // ── Reaction events ──────────────────────────────────────────────────────────
  app.event("reaction_added", async ({ event }) => {
    const resolved = resolveEmoji(event.reaction);
    console.log(
      `[slack] reaction_added: :${event.reaction}: by ${event.user} in ${event.item.channel}`
    );

    stmtInsert.run(
      event.reaction,
      resolved.unicode ?? null,
      resolved.url ?? null
    );

    bus.emit("broadcast", {
      type: "reaction",
      emoji: event.reaction,
      ...resolved,
      user: event.user,
      channel: event.item.channel,
      ts: Date.now(),
    });
  });

  app.event("reaction_removed", async ({ event }) => {
    const resolved = resolveEmoji(event.reaction);
    console.log(
      `[slack] reaction_removed: :${event.reaction}: by ${event.user} in ${event.item.channel}`
    );

    stmtDeleteOne.run(event.reaction);

    bus.emit("broadcast", {
      type: "reaction_removed",
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
        setCustomEmoji(name, value);
        console.log(`[slack] emoji_changed/add: :${name}:`);
        bus.emit("broadcast", { type: "emoji_added", emoji: name, url: value });
      }
    } else if (subtype === "remove") {
      const names = e.names as string[];
      for (const name of names) {
        deleteCustomEmoji(name);
        console.log(`[slack] emoji_changed/remove: :${name}:`);
      }
      bus.emit("broadcast", { type: "emoji_removed", names });
    } else if (subtype === "rename") {
      const oldName = e.old_name as string;
      const newName = e.new_name as string;
      const value = e.value as string;
      deleteCustomEmoji(oldName);
      if (!value.startsWith("alias:")) {
        setCustomEmoji(newName, value);
      }
      console.log(
        `[slack] emoji_changed/rename: :${oldName}: → :${newName}:`
      );
      bus.emit("broadcast", {
        type: "emoji_renamed",
        oldName,
        newName,
        url: value,
      });
    }
  });

  // ── App Home ─────────────────────────────────────────────────────────────────
  const PORT = Number(process.env.PORT) || 3000;
  const DASHBOARD_URL =
    process.env.DASHBOARD_URL || `http://localhost:${PORT}`;

  function buildStatsBlocks(): Record<string, unknown>[] {
    const totalReactions = (stmtCount.get() as { count: number }).count;
    const emojiRows = stmtCountByEmoji.all() as {
      emoji: string;
      count: number;
    }[];
    const top = emojiRows
      .slice(0, 10)
      .map((r) => [r.emoji, r.count] as [string, number]);
    const counts: Record<string, number> = {};
    for (const r of emojiRows) counts[r.emoji] = r.count;

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
        }
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
      }
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

  app.action("open_dashboard", async ({ ack }) => {
    await ack();
  });

  const homeUsers = new Set<string>();

  app.event("app_home_opened", async ({ event }) => {
    homeUsers.add(event.user);
    await publishHome(event.user);
  });

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

  // ── Start ────────────────────────────────────────────────────────────────────
  console.log("[init] connecting to Slack...");
  await app.start();
  console.log("[init] Slack connected (Socket Mode)");
  await loadCustomEmoji(app);
});

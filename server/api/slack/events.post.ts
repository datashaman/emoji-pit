import { WebClient } from "@slack/web-api";
import { verifySlackSignature } from "../../utils/slack-verify";
import { bus } from "../../utils/bus";
import {
  stmtInsertReaction,
  stmtDeleteOneReaction,
  stmtCountTeam,
  stmtCountByEmojiTeam,
  getInstallation,
  getBuckets,
} from "../../utils/db";
import {
  resolveEmoji,
  setCustomEmoji,
  deleteCustomEmoji,
} from "../../utils/emoji";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({ statusCode: 400, message: "Empty body" });
  }

  const signature = getHeader(event, "x-slack-signature") || "";
  const timestamp = getHeader(event, "x-slack-request-timestamp") || "";

  if (!verifySlackSignature(config.slackSigningSecret, signature, timestamp, rawBody)) {
    throw createError({ statusCode: 401, message: "Invalid signature" });
  }

  const body = JSON.parse(rawBody);

  // URL verification challenge
  if (body.type === "url_verification") {
    return { challenge: body.challenge };
  }

  if (body.type !== "event_callback") {
    return { ok: true };
  }

  const teamId = body.team_id as string;
  const slackEvent = body.event;

  if (!slackEvent) return { ok: true };

  const installation = getInstallation(teamId);
  if (!installation) {
    console.warn(`[events] no installation for team ${teamId}`);
    return { ok: true };
  }

  // ── reaction_added ─────────────────────────────────────────────────────────
  if (slackEvent.type === "reaction_added") {
    const resolved = resolveEmoji(teamId, slackEvent.reaction);
    console.log(
      `[slack] reaction_added: :${slackEvent.reaction}: by ${slackEvent.user} in ${slackEvent.item.channel}`
    );

    stmtInsertReaction.run(
      teamId,
      slackEvent.user,
      slackEvent.reaction,
      resolved.unicode ?? null,
      resolved.url ?? null
    );

    bus.emit("broadcast", {
      type: "reaction",
      team_id: teamId,
      emoji: slackEvent.reaction,
      ...resolved,
      user: slackEvent.user,
      channel: slackEvent.item.channel,
      ts: Date.now(),
    });
  }

  // ── reaction_removed ───────────────────────────────────────────────────────
  else if (slackEvent.type === "reaction_removed") {
    const resolved = resolveEmoji(teamId, slackEvent.reaction);
    console.log(
      `[slack] reaction_removed: :${slackEvent.reaction}: by ${slackEvent.user} in ${slackEvent.item.channel}`
    );

    stmtDeleteOneReaction.run(teamId, slackEvent.reaction);

    bus.emit("broadcast", {
      type: "reaction_removed",
      team_id: teamId,
      emoji: slackEvent.reaction,
      ...resolved,
      user: slackEvent.user,
      channel: slackEvent.item.channel,
      ts: Date.now(),
    });
  }

  // ── emoji_changed ──────────────────────────────────────────────────────────
  else if (slackEvent.type === "emoji_changed") {
    const subtype = slackEvent.subtype;
    if (subtype === "add") {
      const name = slackEvent.name;
      const value = slackEvent.value;
      if (!value.startsWith("alias:")) {
        setCustomEmoji(teamId, name, value);
        console.log(`[slack] emoji_changed/add: :${name}:`);
        bus.emit("broadcast", {
          type: "emoji_added",
          team_id: teamId,
          emoji: name,
          url: value,
        });
      }
    } else if (subtype === "remove") {
      const names = slackEvent.names;
      for (const name of names) {
        deleteCustomEmoji(teamId, name);
        console.log(`[slack] emoji_changed/remove: :${name}:`);
      }
      bus.emit("broadcast", {
        type: "emoji_removed",
        team_id: teamId,
        names,
      });
    } else if (subtype === "rename") {
      const oldName = slackEvent.old_name;
      const newName = slackEvent.new_name;
      const value = slackEvent.value;
      deleteCustomEmoji(teamId, oldName);
      if (!value.startsWith("alias:")) {
        setCustomEmoji(teamId, newName, value);
      }
      console.log(`[slack] emoji_changed/rename: :${oldName}: → :${newName}:`);
      bus.emit("broadcast", {
        type: "emoji_renamed",
        team_id: teamId,
        oldName,
        newName,
        url: value,
      });
    }
  }

  // ── app_home_opened ────────────────────────────────────────────────────────
  else if (slackEvent.type === "app_home_opened") {
    const userId = slackEvent.user;
    try {
      const PORT = Number(process.env.PORT) || 3000;
      const DASHBOARD_URL =
        process.env.DASHBOARD_URL || `http://localhost:${PORT}`;

      const totalReactions = (
        stmtCountTeam.get(teamId) as { count: number }
      ).count;
      const emojiRows = stmtCountByEmojiTeam.all(teamId) as {
        emoji: string;
        count: number;
      }[];
      const top = emojiRows.slice(0, 10);
      const uniqueCount = emojiRows.length;

      const chartLines = top.map(
        (r, i) =>
          `${i + 1}. :${r.emoji.replace(/::?skin-tone-\d$/, "")}:  \u00d7 *${r.count}*`
      );

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
            text: `*Total reactions:* ${totalReactions}\n*Unique emoji:* ${uniqueCount}`,
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

      // Bucket config summary
      const buckets = getBuckets(teamId);
      if (buckets.length > 0) {
        const bucketLines = buckets.map((b) => {
          const emojis = JSON.parse(b.emojis) as string[];
          const preview = emojis.slice(0, 5).map((e) => `:${e}:`).join(" ");
          const more = emojis.length > 5 ? ` +${emojis.length - 5} more` : "";
          return `*${b.label}*: ${preview || "(catch-all)"}${more}`;
        });
        blocks.push(
          { type: "divider" },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Emoji Buckets*\n" + bucketLines.join("\n"),
            },
            accessory: {
              type: "button",
              text: { type: "plain_text", text: "Edit Buckets" },
              url: `${DASHBOARD_URL}/settings`,
              action_id: "open_settings",
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

      const client = new WebClient(installation.bot_token);
      await client.views.publish({
        user_id: userId,
        view: { type: "home", blocks },
      });
      console.log(`[home] published for ${userId} (team ${teamId})`);
    } catch (err) {
      console.error("[home] failed:", (err as Error).message);
    }
  }

  return { ok: true };
});

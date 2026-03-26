import { requireSession } from "../../../utils/session-auth";
import { stmtTopChannels, getInstallation } from "../../../utils/db";
import { getUserChannelIds, getPublicChannelIds } from "../../../utils/channel-cache";

export default defineEventHandler(async (event) => {
  const session = requireSession(event);
  const teamId = getRouterParam(event, "teamId");

  if (!teamId || session.team_id !== teamId) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  const query = getQuery(event);
  const days = Math.min(Math.max(parseInt(String(query.days)) || 7, 1), 7);

  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = stmtTopChannels.all(teamId, since) as { channel: string; count: number }[];

  // Get installation for bot token
  const installation = getInstallation(teamId);
  if (!installation) {
    return { channels: [], scope_warning: true };
  }

  // Filter by channel membership
  let allowedChannels: Set<string>;
  const isTvMode = session.user_id === "tv";

  try {
    if (isTvMode) {
      allowedChannels = await getPublicChannelIds(installation.bot_token);
    } else {
      allowedChannels = await getUserChannelIds(session.user_id, installation.bot_token);
    }
  } catch {
    // If we can't get channel list, return unfiltered with warning
    return {
      channels: rows.slice(0, 5),
      scope_warning: true,
    };
  }

  // If empty set returned (missing_scope), signal re-auth needed
  if (allowedChannels.size === 0) {
    return { channels: [], scope_warning: true };
  }

  const filtered = rows
    .filter((r) => allowedChannels.has(r.channel))
    .slice(0, 5);

  return { channels: filtered };
});

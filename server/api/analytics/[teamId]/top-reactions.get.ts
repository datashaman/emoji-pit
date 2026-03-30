import { requireSession } from "../../../utils/session-auth";
import { stmtTopReactions } from "../../../utils/db";
import { resolveEmoji } from "../../../utils/emoji";

export default defineEventHandler((event) => {
  const session = requireSession(event);
  const teamId = getRouterParam(event, "teamId");

  if (!teamId || session.team_id !== teamId) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  const query = getQuery(event);
  const days = Math.min(Math.max(parseInt(String(query.days)) || 7, 1), 7);

  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = stmtTopReactions.all(teamId, since) as { emoji: string; count: number }[];

  const reactions = rows.map((r) => ({
    ...r,
    ...resolveEmoji(teamId, r.emoji),
  }));

  return { reactions };
});

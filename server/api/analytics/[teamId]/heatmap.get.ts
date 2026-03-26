import { requireSession } from "../../../utils/session-auth";
import { db } from "../../../utils/db";

export default defineEventHandler((event) => {
  const session = requireSession(event);
  const teamId = getRouterParam(event, "teamId");

  if (!teamId || session.team_id !== teamId) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  const query = getQuery(event);
  const dateStr = (query.date as string) || new Date().toISOString().slice(0, 10);

  // Parse date to get start/end of day Unix timestamps (UTC)
  const startOfDay = Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
  const endOfDay = startOfDay + 86400;

  const rows = db.prepare(`
    SELECT CAST(strftime('%H', created_at, 'unixepoch') AS INTEGER) as hour,
           COUNT(*) as count
    FROM reactions
    WHERE team_id = ? AND created_at >= ? AND created_at < ?
    GROUP BY hour
  `).all(teamId, startOfDay, endOfDay) as { hour: number; count: number }[];

  // Build full 24-hour array
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: 0,
  }));
  for (const row of rows) {
    if (row.hour >= 0 && row.hour < 24) {
      hours[row.hour].count = row.count;
    }
  }

  return { hours };
});

import { getSession, getUserBuckets } from "../../utils/db";

export default defineEventHandler((event) => {
  const token = getCookie(event, "session");
  if (!token) {
    throw createError({ statusCode: 401, message: "Not authenticated" });
  }
  const session = getSession(token);
  if (!session) {
    throw createError({ statusCode: 401, message: "Invalid session" });
  }

  const buckets = getUserBuckets(session.team_id, session.user_id);

  return buckets.map((b) => ({
    id: b.id,
    label: b.label,
    position: b.position,
    emojis: JSON.parse(b.emojis),
  }));
});

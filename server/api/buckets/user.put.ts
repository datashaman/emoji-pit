import { getSession, saveUserBuckets } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const token = getCookie(event, "session");
  if (!token) {
    throw createError({ statusCode: 401, message: "Not authenticated" });
  }
  const session = getSession(token);
  if (!session) {
    throw createError({ statusCode: 401, message: "Invalid session" });
  }

  const body = await readBody(event);
  if (!Array.isArray(body)) {
    throw createError({ statusCode: 400, message: "Body must be an array of buckets" });
  }

  const buckets = body.map((b: { label: string; emojis: string[] }, i: number) => ({
    label: b.label,
    position: i,
    emojis: JSON.stringify(b.emojis || []),
  }));

  saveUserBuckets(session.team_id, session.user_id, buckets);

  return { ok: true };
});

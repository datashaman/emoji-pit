import { getSession, saveBuckets, getInstallation } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, "teamId");
  if (!teamId) {
    throw createError({ statusCode: 400, message: "Missing teamId" });
  }

  const token = getCookie(event, "session");
  if (!token) {
    throw createError({ statusCode: 401, message: "Not authenticated" });
  }
  const session = getSession(token);
  if (!session || session.team_id !== teamId) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  if (!session.is_admin) {
    throw createError({ statusCode: 403, message: "Admin only" });
  }

  if (!getInstallation(teamId)) {
    throw createError({ statusCode: 404, message: "Team not found" });
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

  saveBuckets(teamId, buckets);

  return { ok: true };
});

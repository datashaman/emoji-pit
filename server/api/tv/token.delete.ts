import { requireAdmin } from "../../utils/session-auth";
import { deleteTvToken } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const session = requireAdmin(event);
  const body = await readBody(event);
  const token = body?.token as string;

  if (!token) {
    throw createError({ statusCode: 400, message: "Token required" });
  }

  deleteTvToken(token, session.team_id);
  return { ok: true };
});

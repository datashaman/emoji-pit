import { bus } from "../utils/bus";
import { getSession, stmtDeleteTeamReactions } from "../utils/db";

export default defineEventHandler((event) => {
  const token = getCookie(event, "session");
  if (!token) {
    throw createError({ statusCode: 401, message: "Not authenticated" });
  }

  const session = getSession(token);
  if (!session) {
    throw createError({ statusCode: 401, message: "Invalid session" });
  }

  if (!session.is_admin) {
    throw createError({ statusCode: 403, message: "Admin only" });
  }

  stmtDeleteTeamReactions.run(session.team_id);
  bus.emit("broadcast", { type: "reset", team_id: session.team_id });
  console.log(`[reset] history cleared for team ${session.team_id}`);
  return { ok: true };
});

import { requireAdmin } from "../../utils/session-auth";
import { createTvToken } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const session = requireAdmin(event);
  const body = await readBody(event);
  const label = (body?.label as string) || "TV Display";

  const token = createTvToken(session.team_id, label, session.user_id);

  return {
    token: token.token,
    label: token.label,
    created_at: token.created_at,
  };
});

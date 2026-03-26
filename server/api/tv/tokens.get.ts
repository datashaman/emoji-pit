import { requireAdmin } from "../../utils/session-auth";
import { listTvTokens } from "../../utils/db";

export default defineEventHandler((event) => {
  const session = requireAdmin(event);
  const tokens = listTvTokens(session.team_id);

  // Mask tokens in list view — only show last 8 chars
  return tokens.map((t) => ({
    token: t.token,
    token_preview: "..." + t.token.slice(-8),
    team_id: t.team_id,
    label: t.label,
    created_by: t.created_by,
    created_at: t.created_at,
  }));
});

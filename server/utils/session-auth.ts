import type { H3Event } from "h3";
import { getSessionByToken, getTvTokenTeam, type SessionRecord } from "./db";

/**
 * Extract and validate session from cookie or TV bearer token.
 * Throws 401 if not authenticated.
 */
export function requireSession(event: H3Event): SessionRecord {
  // Check cookie-based session first
  const token = getCookie(event, "session");
  if (token) {
    const session = getSessionByToken(token);
    if (session) return session;
  }

  // Check Authorization: Bearer <tv_token> header
  const auth = getHeader(event, "authorization");
  if (auth?.startsWith("Bearer ")) {
    const tvToken = auth.slice(7);
    const tvRecord = getTvTokenTeam(tvToken);
    if (tvRecord) {
      // Synthetic read-only session for TV mode
      return {
        token: tvToken,
        team_id: tvRecord.team_id,
        user_id: "tv",
        user_name: "TV Mode",
        is_admin: 0,
      };
    }
  }

  throw createError({ statusCode: 401, message: "Not authenticated" });
}

/**
 * Require an authenticated admin session.
 * Throws 401 if not authenticated, 403 if not admin.
 */
export function requireAdmin(event: H3Event): SessionRecord {
  const session = requireSession(event);
  if (!session.is_admin) {
    throw createError({ statusCode: 403, message: "Admin only" });
  }
  return session;
}

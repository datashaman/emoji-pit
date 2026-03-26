import { getSession } from "../../utils/db";

export default defineEventHandler((event) => {
  const token = getCookie(event, "session");
  if (!token) {
    return { authenticated: false };
  }

  const session = getSession(token);
  if (!session) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    team_id: session.team_id,
    user_id: session.user_id,
    user_name: session.user_name,
    is_admin: !!session.is_admin,
  };
});

import { WebClient } from "@slack/web-api";
import { verifyState } from "../../utils/slack-state";
import { getInstallation, saveSession } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  const code = query.code as string;
  const state = query.state as string;

  if (!code || !state || !verifyState(state)) {
    throw createError({ statusCode: 400, message: "Invalid OAuth state" });
  }

  const client = new WebClient();
  const result = await client.oauth.v2.access({
    client_id: config.slackClientId,
    client_secret: config.slackClientSecret,
    code,
    redirect_uri: `${config.public.baseUrl}/api/auth/callback`,
  });

  if (!result.ok || !result.authed_user) {
    throw createError({ statusCode: 400, message: "Sign in failed" });
  }

  const authedUser = result.authed_user as {
    id: string;
    access_token?: string;
  };
  const teamId = (result.team as { id: string })?.id;

  if (!teamId) {
    throw createError({ statusCode: 400, message: "No team in response" });
  }

  // Check that this team has an active installation
  const installation = getInstallation(teamId);
  if (!installation) {
    throw createError({
      statusCode: 403,
      message: "Emoji Pit is not installed in this workspace. Ask a workspace admin to install it first.",
    });
  }

  const userId = authedUser.id;

  // Determine admin status
  const isAdmin = userId === installation.installer_id ? 1 : 0;

  // Get user's display name
  let userName = userId;
  try {
    const botClient = new WebClient(installation.bot_token);
    const userInfo = await botClient.users.info({ user: userId });
    if (userInfo.ok && userInfo.user) {
      userName =
        userInfo.user.profile?.display_name ||
        userInfo.user.real_name ||
        userId;
    }
  } catch {
    // Keep the fallback
  }

  const token = crypto.randomUUID();
  saveSession({
    token,
    team_id: teamId,
    user_id: userId,
    user_name: userName,
    is_admin: isAdmin,
  });

  setCookie(event, "session", token, {
    httpOnly: true,
    secure: config.public.baseUrl.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
  });

  return sendRedirect(event, "/");
});

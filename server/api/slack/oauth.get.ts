import { WebClient } from "@slack/web-api";
import { verifyState } from "../../utils/slack-state";
import { saveInstallation, getInstallation, saveSession } from "../../utils/db";
import { loadCustomEmoji } from "../../utils/emoji";

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
    redirect_uri: `${config.public.baseUrl}/api/slack/oauth`,
  });

  if (!result.ok || !result.team || !result.authed_user) {
    throw createError({ statusCode: 400, message: "OAuth failed" });
  }

  const teamId = result.team.id!;
  const teamName = result.team.name || teamId;
  const botToken = result.access_token!;
  const botUserId = result.bot_user_id!;
  const installerId = result.authed_user.id!;
  const scope = result.scope || "";

  saveInstallation({
    team_id: teamId,
    team_name: teamName,
    bot_token: botToken,
    bot_user_id: botUserId,
    installer_id: installerId,
    scope,
  });

  console.log(`[oauth] installed for ${teamName} (${teamId}) by ${installerId}`);

  // Load custom emoji for this workspace
  await loadCustomEmoji(teamId, botToken);

  // Create a session for the installer
  const token = crypto.randomUUID();
  const installation = getInstallation(teamId)!;
  saveSession({
    token,
    team_id: teamId,
    user_id: installerId,
    user_name: installerId, // We'll get the real name below
    is_admin: 1,
  });

  // Try to get the user's real name
  try {
    const botClient = new WebClient(botToken);
    const userInfo = await botClient.users.info({ user: installerId });
    if (userInfo.ok && userInfo.user) {
      saveSession({
        token,
        team_id: teamId,
        user_id: installerId,
        user_name:
          userInfo.user.profile?.display_name ||
          userInfo.user.real_name ||
          installerId,
        is_admin: 1,
      });
    }
  } catch {
    // Keep the fallback name
  }

  setCookie(event, "session", token, {
    httpOnly: true,
    secure: config.public.baseUrl.startsWith("https"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
  });

  return sendRedirect(event, "/");
});

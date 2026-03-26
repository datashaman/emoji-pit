import { generateState } from "../../utils/slack-state";

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const state = generateState();

  const params = new URLSearchParams({
    client_id: config.slackClientId,
    user_scope: "identity.basic",
    redirect_uri: `${config.public.baseUrl}/api/auth/callback`,
    state,
  });

  return sendRedirect(
    event,
    `https://slack.com/oauth/v2/authorize?${params}`
  );
});

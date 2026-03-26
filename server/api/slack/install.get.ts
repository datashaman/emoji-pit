import { generateState } from "../../utils/slack-state";

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const state = generateState();

  const params = new URLSearchParams({
    client_id: config.slackClientId,
    scope: "reactions:read,emoji:read,chat:write,channels:history,users:read",
    redirect_uri: `${config.public.baseUrl}/api/slack/oauth`,
    state,
  });

  return sendRedirect(event, `https://slack.com/oauth/v2/authorize?${params}`);
});

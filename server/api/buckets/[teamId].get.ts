import { getSession, getBuckets, saveBuckets, getInstallation } from "../../utils/db";

const DEFAULT_BUCKETS = [
  { label: "Love", position: 0, emojis: JSON.stringify(["heart","hearts","heart_eyes","sparkling_heart","two_hearts","revolving_hearts","heartpulse","orange_heart","yellow_heart","green_heart","blue_heart","purple_heart"]) },
  { label: "Celebrate", position: 1, emojis: JSON.stringify(["tada","confetti_ball","partying_face","balloon","fireworks","sparkles","star","star2","dizzy","trophy"]) },
  { label: "Hype", position: 2, emojis: JSON.stringify(["fire","rocket","zap","muscle","raised_hands","clap","100","boom","exploding_head"]) },
  { label: "Agree", position: 3, emojis: JSON.stringify(["thumbsup","+1","white_check_mark","heavy_check_mark","ok_hand","handshake","pray"]) },
  { label: "Funny", position: 4, emojis: JSON.stringify(["joy","rofl","sweat_smile","laughing","grinning","smile","slightly_smiling_face","lol"]) },
  { label: "Thinking", position: 5, emojis: JSON.stringify(["thinking_face","eyes","face_with_monocle","nerd_face","brain","question","grey_question"]) },
  { label: "Negative", position: 6, emojis: JSON.stringify(["thumbsdown","-1","disappointed","cry","sob","rage","face_with_symbols_on_mouth","no_entry","x"]) },
  { label: "Other", position: 7, emojis: JSON.stringify([]) },
];

export default defineEventHandler((event) => {
  const teamId = getRouterParam(event, "teamId");
  if (!teamId) {
    throw createError({ statusCode: 400, message: "Missing teamId" });
  }

  // Verify session belongs to this team
  const token = getCookie(event, "session");
  if (!token) {
    throw createError({ statusCode: 401, message: "Not authenticated" });
  }
  const session = getSession(token);
  if (!session || session.team_id !== teamId) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  // Check team exists
  if (!getInstallation(teamId)) {
    throw createError({ statusCode: 404, message: "Team not found" });
  }

  let buckets = getBuckets(teamId);

  // Seed defaults if none exist
  if (buckets.length === 0) {
    saveBuckets(teamId, DEFAULT_BUCKETS);
    buckets = getBuckets(teamId);
  }

  return buckets.map((b) => ({
    id: b.id,
    label: b.label,
    position: b.position,
    emojis: JSON.parse(b.emojis),
  }));
});

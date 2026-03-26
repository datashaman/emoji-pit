import { gemoji } from "gemoji";
import { getCustomEmojiMap } from "../../utils/db";
import { requireSession } from "../../utils/session-auth";

interface EmojiEntry {
  name: string;
  emoji?: string;
  url?: string;
  category: string;
  tags?: string[];
}

export default defineEventHandler((event) => {
  const session = requireSession(event);
  const teamId = getRouterParam(event, "teamId");
  if (!teamId || teamId !== session.team_id) {
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  const customMap = getCustomEmojiMap(teamId);

  const standard: EmojiEntry[] = gemoji.map((g) => ({
    name: g.names[0],
    emoji: g.emoji,
    category: g.category,
    tags: g.tags,
  }));

  const custom: EmojiEntry[] = Object.entries(customMap).map(([name, url]) => ({
    name,
    url,
    category: "Custom",
  }));

  return { standard, custom };
});

import { WebClient } from "@slack/web-api";

interface CacheEntry {
  channels: Set<string>;
  expiresAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Get channels the user is a member of (cached for 5 minutes).
 * Returns channel IDs, not names.
 */
export async function getUserChannelIds(
  userId: string,
  botToken: string
): Promise<Set<string>> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.channels;
  }

  const client = new WebClient(botToken);
  const channels = new Set<string>();

  try {
    let cursor: string | undefined;
    do {
      const res = await client.users.conversations({
        user: userId,
        types: "public_channel,private_channel",
        limit: 200,
        cursor,
      });
      for (const ch of res.channels ?? []) {
        if (ch.id) channels.add(ch.id);
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch (err) {
    const slackErr = err as { data?: { error?: string } };
    if (slackErr.data?.error === "missing_scope") {
      // Workspace hasn't re-authorized with channels:read
      // Return empty set — caller will show re-auth prompt
      console.warn("[channel-cache] missing_scope for user", userId);
      return new Set();
    }
    throw err;
  }

  cache.set(userId, { channels, expiresAt: now + CACHE_TTL });
  return channels;
}

/**
 * Get public channel IDs (for TV mode — no user context).
 */
export async function getPublicChannelIds(
  botToken: string
): Promise<Set<string>> {
  const cacheKey = `__tv__${botToken.slice(-8)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.channels;
  }

  const client = new WebClient(botToken);
  const channels = new Set<string>();

  try {
    let cursor: string | undefined;
    do {
      const res = await client.conversations.list({
        types: "public_channel",
        limit: 200,
        cursor,
      });
      for (const ch of res.channels ?? []) {
        if (ch.id) channels.add(ch.id);
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch (err) {
    const slackErr = err as { data?: { error?: string } };
    if (slackErr.data?.error === "missing_scope") {
      console.warn("[channel-cache] missing_scope for public channels");
      return new Set();
    }
    throw err;
  }

  cache.set(cacheKey, { channels, expiresAt: now + CACHE_TTL });
  return channels;
}

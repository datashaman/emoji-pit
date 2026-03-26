<template>
  <!-- Loading -->
  <div v-if="authState === 'loading'" class="console">
    <div class="console-header">
      <div class="brand"><h1>Emoji Pit</h1></div>
    </div>
    <div class="pulse-body"><p>Loading...</p></div>
    <div class="model-label">EP-1000 &bull; Culture Pulse</div>
  </div>

  <!-- Not authenticated -->
  <div v-else-if="authState === 'unauthenticated'" class="console">
    <div class="console-header">
      <div class="brand"><h1>Emoji Pit</h1></div>
    </div>
    <div class="pulse-body">
      <p>Please <a href="/api/auth/login">sign in</a> to view analytics.</p>
    </div>
    <div class="model-label">EP-1000 &bull; Culture Pulse</div>
  </div>

  <!-- Authenticated -->
  <div v-else class="console">
    <div class="console-header">
      <div class="brand">
        <h1>Emoji Pit</h1>
      </div>
      <div class="header-right">
        <span v-if="!isTvMode" class="user-badge">{{ session?.user_name }}</span>
      </div>
    </div>

    <!-- Tab bar -->
    <div v-if="!isTvMode" class="tab-bar">
      <NuxtLink to="/" class="tab">Pit</NuxtLink>
      <NuxtLink to="/pulse" class="tab active">Pulse</NuxtLink>
    </div>

    <!-- Analytics grid -->
    <div class="pulse-body">
      <div class="pulse-grid">
        <PulseHeatmap :hours="heatmapData" />
        <PulseTopReactions :reactions="topReactionsData" />
        <PulseTopChannels
          :channels="topChannelsData"
          :scope-warning="!isTvMode && channelScopeWarning"
        />
        <PulseWeeklyTrend :days="weeklyTrendData" />
      </div>

      <PulseVaabzBanner />
    </div>

    <!-- TV mode badge -->
    <div v-if="isTvMode" class="tv-badge">Powered by vaabz</div>

    <div class="model-label">EP-1000 &bull; Culture Pulse</div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const isTvMode = computed(() => route.query.tv === "1");
const tvToken = computed(() => (route.query.token as string) || "");

const authState = ref<"loading" | "unauthenticated" | "authenticated">("loading");
const session = ref<{ team_id: string; user_id: string; user_name: string } | null>(null);

// Analytics data
const heatmapData = ref<{ hour: number; count: number }[]>(
  Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
);
const topReactionsData = ref<{ emoji: string; count: number }[]>([]);
const topChannelsData = ref<{ channel: string; count: number }[]>([]);
const channelScopeWarning = ref(false);
const weeklyTrendData = ref<{ date: string; count: number }[]>([]);

// Polling interval for TV mode
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  // Auth check
  if (isTvMode.value && tvToken.value) {
    // TV mode — use bearer token
    try {
      // Verify token works by fetching analytics
      session.value = { team_id: "", user_id: "tv", user_name: "TV Mode" };
      authState.value = "authenticated";
      // We'll get the team_id from the first successful API call
    } catch {
      authState.value = "unauthenticated";
      return;
    }
  } else {
    // Normal session auth
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.authenticated) {
        session.value = data;
        authState.value = "authenticated";
      } else {
        authState.value = "unauthenticated";
        return;
      }
    } catch {
      authState.value = "unauthenticated";
      return;
    }
  }

  await fetchAllAnalytics();

  // TV mode: poll every 60 seconds
  if (isTvMode.value) {
    pollTimer = setInterval(fetchAllAnalytics, 60_000);
  }
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

function getHeaders(): Record<string, string> {
  if (isTvMode.value && tvToken.value) {
    return { Authorization: `Bearer ${tvToken.value}` };
  }
  return {};
}

async function fetchAllAnalytics() {
  const teamId = session.value?.team_id;
  const headers = getHeaders();

  // For TV mode, we need to discover team_id from the first call
  // Use a simple approach: try fetching trend (lightweight) to get team context
  if (isTvMode.value && !teamId) {
    // TV token knows its own team — the server extracts it
    // We need the teamId for URL construction though
    // Solution: add a simple endpoint or extract from token response
    // For now, use a dedicated TV info endpoint pattern
    try {
      const res = await fetch("/api/tv/tokens", { headers });
      if (res.status === 401) {
        authState.value = "unauthenticated";
        return;
      }
    } catch {
      // Token auth not valid for listing — that's OK, the analytics endpoints
      // will work with bearer auth and the server extracts team_id from token
    }
  }

  // The teamId in the URL must match the token's team_id
  // For TV mode, we extract it from the session-auth on server side
  // But we need it for URL construction...
  // Let's add a simple info endpoint. For now, we'll try all team analytics
  // endpoints and rely on the server's auth to validate.

  // For regular session auth, we have the team_id
  const tid = session.value?.team_id;
  if (!tid && !isTvMode.value) return;

  // For TV mode without known team_id, try fetching from a me-equivalent
  if (!tid && isTvMode.value) {
    try {
      const res = await fetch("/api/auth/me", { headers });
      const data = await res.json();
      if (data.team_id) {
        session.value = { ...session.value!, team_id: data.team_id };
      } else {
        // The TV bearer token doesn't work with /api/auth/me (cookie-based)
        // We need a TV-specific team discovery mechanism
        // For MVP: require team_id in URL query param for TV mode
        const urlTeamId = route.query.team as string;
        if (urlTeamId) {
          session.value = { ...session.value!, team_id: urlTeamId };
        } else {
          console.warn("[pulse] TV mode requires team query param");
          return;
        }
      }
    } catch {
      const urlTeamId = route.query.team as string;
      if (urlTeamId) {
        session.value = { ...session.value!, team_id: urlTeamId };
      } else {
        return;
      }
    }
  }

  const finalTeamId = session.value?.team_id;
  if (!finalTeamId) return;

  const base = `/api/analytics/${finalTeamId}`;

  try {
    const [heatmap, reactions, channels, trend] = await Promise.all([
      fetch(`${base}/heatmap`, { headers }).then((r) => r.json()),
      fetch(`${base}/top-reactions?days=7`, { headers }).then((r) => r.json()),
      fetch(`${base}/channels?days=7`, { headers }).then((r) => r.json()),
      fetch(`${base}/trend?days=7`, { headers }).then((r) => r.json()),
    ]);

    heatmapData.value = heatmap.hours || [];
    topReactionsData.value = reactions.reactions || [];
    topChannelsData.value = channels.channels || [];
    channelScopeWarning.value = channels.scope_warning || false;
    weeklyTrendData.value = trend.days || [];
  } catch (err) {
    console.error("[pulse] Failed to fetch analytics:", err);
  }
}
</script>

<style scoped>
.pulse-body {
  padding: 16px 0;
}

.pulse-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 768px) {
  .pulse-grid {
    grid-template-columns: 1fr;
  }
}

.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.tab {
  font-family: 'Press Start 2P', monospace;
  font-size: 9px;
  background: var(--shell-dark);
  color: var(--text-label);
  border: none;
  border-radius: 8px 8px 0 0;
  padding: 10px 20px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-decoration: none;
}

.tab.active {
  background: var(--stat-bg);
  color: var(--text-lcd);
  border: 1px solid var(--stat-border);
  border-bottom: none;
}

.tab:hover:not(.active) {
  color: var(--text-lcd);
}

.tv-badge {
  position: fixed;
  bottom: 12px;
  right: 16px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  color: var(--text-dim);
  opacity: 0.5;
}

.user-badge {
  font-size: 11px;
  color: var(--text-label);
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  border-radius: 12px;
  padding: 4px 10px;
}
</style>

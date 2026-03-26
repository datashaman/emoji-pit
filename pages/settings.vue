<template>
  <div class="console">
    <div class="console-header">
      <div class="brand">
        <a href="/" class="back-link">&larr;</a>
        <h1>Settings</h1>
      </div>
      <div class="header-right">
        <span v-if="session" class="user-badge">{{ session.user_name }}</span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="settings-body">
      <p>Loading...</p>
    </div>

    <!-- Not authenticated -->
    <div v-else-if="!session" class="settings-body">
      <p>Please <a href="/api/auth/login">sign in</a> first.</p>
    </div>

    <!-- Settings -->
    <div v-else class="settings-body">
      <!-- Tab bar -->
      <div class="tab-bar">
        <button
          class="tab"
          :class="{ active: tab === 'user' }"
          @click="tab = 'user'"
        >My Buckets</button>
        <button
          v-if="session.is_admin"
          class="tab"
          :class="{ active: tab === 'team' }"
          @click="tab = 'team'"
        >Workspace Defaults</button>
        <button
          v-if="session.is_admin"
          class="tab"
          :class="{ active: tab === 'tv' }"
          @click="tab = 'tv'"
        >TV Mode</button>
      </div>

      <!-- TV Mode panel -->
      <div v-if="tab === 'tv'" class="tv-panel">
        <p class="tv-description">
          Generate a shareable link to display Emoji Pit on a TV or ambient screen.
          No login required &mdash; anyone with the link can view.
        </p>

        <div class="tv-tokens-list">
          <div v-for="t in tvTokens" :key="t.token" class="tv-token-card">
            <div class="tv-token-info">
              <span class="tv-token-label">{{ t.label }}</span>
              <span class="tv-token-preview">{{ t.token_preview }}</span>
            </div>
            <div class="tv-token-actions">
              <button class="btn-pill btn-sm" @click="copyTvUrl(t.token)">Copy URL</button>
              <button class="btn-pill btn-sm btn-danger-outline" @click="revokeTvToken(t.token)">Revoke</button>
            </div>
          </div>
        </div>

        <div class="settings-actions">
          <input
            v-model="tvLabel"
            class="tv-label-input"
            placeholder="Display name (e.g. Office TV)"
          />
          <button class="btn-pill btn-primary" @click="generateTvToken" :disabled="generatingTv">
            {{ generatingTv ? 'Generating...' : 'Generate Link' }}
          </button>
        </div>

        <div v-if="newTvUrl" class="tv-new-url">
          <p class="tv-url-label">New TV URL (copy now &mdash; the full token won't be shown again):</p>
          <code class="tv-url">{{ newTvUrl }}</code>
        </div>

        <p v-if="message" class="settings-message" :class="{ error: isError }">{{ message }}</p>
      </div>

      <!-- Bucket editor -->
      <div v-show="tab !== 'tv'" class="bucket-list">
        <div
          v-for="(bucket, idx) in activeBuckets"
          :key="idx"
          class="bucket-card"
        >
          <div class="bucket-header">
            <input
              v-model="bucket.label"
              class="bucket-label-input"
              placeholder="Bucket name"
            />
            <div class="bucket-actions">
              <button
                v-if="idx > 0"
                class="btn-icon"
                title="Move up"
                @click="moveBucket(idx, -1)"
              >&uarr;</button>
              <button
                v-if="idx < activeBuckets.length - 1"
                class="btn-icon"
                title="Move down"
                @click="moveBucket(idx, 1)"
              >&darr;</button>
              <button
                class="btn-icon btn-danger"
                title="Remove bucket"
                @click="removeBucket(idx)"
              >&times;</button>
            </div>
          </div>
          <div class="emoji-tags">
            <span
              v-for="(emoji, ei) in bucket.emojis"
              :key="ei"
              class="emoji-tag"
            >
              :{{ emoji }}:
              <button class="tag-remove" @click="removeEmoji(idx, ei)">&times;</button>
            </span>
            <input
              class="emoji-add-input"
              placeholder="+ add emoji"
              @keydown.enter="addEmoji(idx, $event)"
            />
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn-pill" @click="addBucket">+ Add Bucket</button>
        <button class="btn-pill btn-primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button v-if="tab === 'user' && userBuckets.length > 0" class="btn-pill btn-secondary" @click="resetToDefaults">
          Reset to Workspace Defaults
        </button>
      </div>

      <p v-if="message" class="settings-message" :class="{ error: isError }">{{ message }}</p>
    </div>

    <div class="model-label">EP-1000 &bull; Bucket Configuration</div>
  </div>
</template>

<script setup lang="ts">
interface Session {
  authenticated: boolean;
  team_id: string;
  user_id: string;
  user_name: string;
  is_admin: boolean;
}

interface Bucket {
  label: string;
  emojis: string[];
}

const loading = ref(true);
const session = ref<Session | null>(null);
const tab = ref<'user' | 'team' | 'tv'>('user');
const teamBuckets = ref<Bucket[]>([]);
const userBuckets = ref<Bucket[]>([]);
const saving = ref(false);
const message = ref('');
const isError = ref(false);

const activeBuckets = computed(() =>
  tab.value === 'team' ? teamBuckets.value : userBuckets.value
);

onMounted(async () => {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated) {
      loading.value = false;
      return;
    }
    session.value = data;

    const [teamRes, userRes] = await Promise.all([
      fetch(`/api/buckets/${data.team_id}`),
      fetch('/api/buckets/user'),
    ]);

    teamBuckets.value = await teamRes.json();
    userBuckets.value = await userRes.json();

    // If user has no overrides, start with a copy of team defaults
    if (userBuckets.value.length === 0) {
      userBuckets.value = JSON.parse(JSON.stringify(teamBuckets.value));
    }

    // Load TV tokens for admins
    if (data.is_admin) {
      await loadTvTokens();
    }
  } catch {
    message.value = 'Failed to load settings';
    isError.value = true;
  }
  loading.value = false;
});

function addBucket() {
  activeBuckets.value.push({ label: '', emojis: [] });
}

function removeBucket(idx: number) {
  activeBuckets.value.splice(idx, 1);
}

function moveBucket(idx: number, dir: number) {
  const arr = activeBuckets.value;
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
}

function addEmoji(bucketIdx: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const name = input.value.trim().replace(/^:/, '').replace(/:$/, '');
  if (!name) return;
  activeBuckets.value[bucketIdx].emojis.push(name);
  input.value = '';
}

function removeEmoji(bucketIdx: number, emojiIdx: number) {
  activeBuckets.value[bucketIdx].emojis.splice(emojiIdx, 1);
}

async function save() {
  if (!session.value) return;
  saving.value = true;
  message.value = '';

  try {
    const url = tab.value === 'team'
      ? `/api/buckets/${session.value.team_id}`
      : '/api/buckets/user';

    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activeBuckets.value),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    message.value = 'Saved!';
    isError.value = false;
  } catch (err) {
    message.value = (err as Error).message;
    isError.value = true;
  }
  saving.value = false;
}

// ── TV Token management ──────────────────────────────────────────────────
interface TvToken {
  token: string;
  token_preview: string;
  label: string;
  created_at: number;
}

const tvTokens = ref<TvToken[]>([]);
const tvLabel = ref('');
const generatingTv = ref(false);
const newTvUrl = ref('');

async function loadTvTokens() {
  try {
    const res = await fetch('/api/tv/tokens');
    if (res.ok) {
      tvTokens.value = await res.json();
    }
  } catch { /* ignore */ }
}

async function generateTvToken() {
  generatingTv.value = true;
  message.value = '';
  newTvUrl.value = '';
  try {
    const res = await fetch('/api/tv/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: tvLabel.value || 'TV Display' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const baseUrl = window.location.origin;
    newTvUrl.value = `${baseUrl}/pulse?tv=1&token=${data.token}&team=${session.value?.team_id}`;
    tvLabel.value = '';
    await loadTvTokens();
    message.value = 'Token generated!';
    isError.value = false;
  } catch (err) {
    message.value = (err as Error).message;
    isError.value = true;
  }
  generatingTv.value = false;
}

async function revokeTvToken(token: string) {
  if (!confirm('Revoke this TV token? The link will stop working.')) return;
  try {
    await fetch('/api/tv/token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    await loadTvTokens();
    message.value = 'Token revoked';
    isError.value = false;
  } catch (err) {
    message.value = (err as Error).message;
    isError.value = true;
  }
}

function copyTvUrl(token: string) {
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/pulse?tv=1&token=${token}&team=${session.value?.team_id}`;
  navigator.clipboard.writeText(url).then(() => {
    message.value = 'URL copied!';
    isError.value = false;
  });
}

async function resetToDefaults() {
  if (!session.value) return;
  if (!confirm('Reset your buckets to workspace defaults?')) return;

  saving.value = true;
  try {
    await fetch('/api/buckets/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });
    userBuckets.value = JSON.parse(JSON.stringify(teamBuckets.value));
    message.value = 'Reset to defaults!';
    isError.value = false;
  } catch (err) {
    message.value = (err as Error).message;
    isError.value = true;
  }
  saving.value = false;
}
</script>

<style scoped>
.back-link {
  color: var(--text-label);
  text-decoration: none;
  font-size: 24px;
  line-height: 1;
}

.back-link:hover {
  color: var(--text-lcd);
}

.settings-body {
  padding: 20px 0;
}

.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
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
}

.tab.active {
  background: var(--stat-bg);
  color: var(--text-lcd);
  border: 1px solid var(--stat-border);
  border-bottom: none;
}

.bucket-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bucket-card {
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  border-radius: 8px;
  padding: 12px;
}

.bucket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.bucket-label-input {
  font-family: 'Press Start 2P', monospace;
  font-size: 11px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--stat-border);
  color: var(--text-lcd);
  padding: 4px 0;
  width: 200px;
  outline: none;
}

.bucket-label-input:focus {
  border-bottom-color: var(--text-lcd);
}

.bucket-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  font-family: 'Share Tech Mono', monospace;
  font-size: 16px;
  background: none;
  border: 1px solid var(--stat-border);
  color: var(--text-label);
  border-radius: 4px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.btn-icon:hover {
  color: var(--text-lcd);
  border-color: var(--text-lcd);
}

.btn-danger:hover {
  color: var(--led-red);
  border-color: var(--led-red);
}

.emoji-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.emoji-tag {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  background: var(--shell-dark);
  color: var(--text-label);
  border-radius: 12px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-remove {
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  background: none;
  border: none;
  color: var(--text-label);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.tag-remove:hover {
  color: var(--led-red);
}

.emoji-add-input {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  background: transparent;
  border: 1px dashed var(--stat-border);
  color: var(--text-lcd);
  border-radius: 12px;
  padding: 4px 10px;
  width: 120px;
  outline: none;
}

.emoji-add-input:focus {
  border-color: var(--text-lcd);
}

.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.btn-primary {
  background: #4A154B !important;
  color: #fff !important;
}

.btn-primary:hover {
  background: #611f69 !important;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--shell-edge) !important;
}

.settings-message {
  margin-top: 12px;
  font-size: 13px;
  color: var(--led-green);
}

.settings-message.error {
  color: var(--led-red);
}

.user-badge {
  font-size: 11px;
  color: var(--text-label);
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  border-radius: 12px;
  padding: 4px 10px;
}

/* ── TV Mode styles ─────────────────────────────────────────── */
.tv-panel {
  padding-top: 12px;
}

.tv-description {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px;
  color: var(--text-label);
  margin-bottom: 16px;
  line-height: 1.5;
}

.tv-tokens-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.tv-token-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  border-radius: 8px;
  padding: 10px 14px;
}

.tv-token-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tv-token-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px;
  color: var(--text-lcd);
}

.tv-token-preview {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
}

.tv-token-actions {
  display: flex;
  gap: 6px;
}

.btn-sm {
  font-size: 8px !important;
  padding: 6px 12px !important;
}

.btn-danger-outline {
  color: var(--led-red) !important;
  border-color: var(--led-red) !important;
}

.btn-danger-outline:hover {
  background: var(--led-red) !important;
  color: #fff !important;
}

.tv-label-input {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  color: var(--text-lcd);
  border-radius: 6px;
  padding: 8px 12px;
  outline: none;
  width: 200px;
}

.tv-label-input:focus {
  border-color: var(--text-lcd);
}

.tv-new-url {
  margin-top: 12px;
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  border-radius: 8px;
  padding: 12px;
}

.tv-url-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-label);
  margin-bottom: 6px;
}

.tv-url {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-lcd);
  word-break: break-all;
  display: block;
}
</style>

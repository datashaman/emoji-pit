<template>
  <div class="pulse-card">
    <h3 class="pulse-card-title">Top Reactions (7 days)</h3>
    <div v-if="reactions.length === 0" class="pulse-empty">
      Reactions will appear here after your first day.
    </div>
    <div v-else class="bar-chart">
      <div
        v-for="r in reactions"
        :key="r.emoji"
        class="bar-row"
      >
        <span class="bar-label">
          <img v-if="r.url" :src="r.url" :alt="r.emoji" class="bar-emoji-img" />
          <img v-else-if="r.unicode" :src="twemojiUrl(r.unicode)" :alt="r.emoji" class="bar-emoji-img" />
          <span v-else>:{{ r.emoji }}:</span>
        </span>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: barWidth(r.count) }"
          ></div>
        </div>
        <span class="bar-count">{{ r.count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ReactionData {
  emoji: string;
  count: number;
  unicode?: string;
  url?: string;
}

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";

function twemojiUrl(unicode: string): string {
  const codepoints = [...unicode]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f");
  return TWEMOJI_BASE + codepoints.join("-") + ".svg";
}

const props = defineProps<{
  reactions: ReactionData[];
}>();

const maxCount = computed(() => Math.max(...props.reactions.map((r) => r.count), 1));

function barWidth(count: number): string {
  return Math.round((count / maxCount.value) * 100) + "%";
}
</script>

<style scoped>
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.bar-row {
  display: grid;
  grid-template-columns: 100px 1fr 50px;
  align-items: center;
  gap: 8px;
}

.bar-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  color: var(--text-lcd);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.bar-emoji-img {
  width: 20px;
  height: 20px;
  vertical-align: middle;
}

.bar-track {
  height: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: var(--text-lcd);
  border-radius: 3px;
  opacity: 0.7;
  transition: width 0.3s ease;
}

.bar-count {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  color: var(--text-dim);
  text-align: right;
}
</style>

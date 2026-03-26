<template>
  <div class="pulse-card">
    <h3 class="pulse-card-title">Active Channels (7 days)</h3>
    <div v-if="scopeWarning" class="pulse-empty">
      <a href="/api/slack/install" class="reauth-link">Re-authorize</a> to see channel data.
    </div>
    <div v-else-if="channels.length === 0" class="pulse-empty">
      Channel data collected from deployment. Activity will appear as your team reacts.
    </div>
    <div v-else class="bar-chart">
      <div
        v-for="c in channels"
        :key="c.channel"
        class="bar-row"
      >
        <span class="bar-label">#{{ c.channel }}</span>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: barWidth(c.count) }"
          ></div>
        </div>
        <span class="bar-count">{{ c.count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ChannelData {
  channel: string;
  count: number;
}

const props = defineProps<{
  channels: ChannelData[];
  scopeWarning?: boolean;
}>();

const maxCount = computed(() => Math.max(...props.channels.map((c) => c.count), 1));

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
  grid-template-columns: 120px 1fr 50px;
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

.reauth-link {
  color: var(--text-lcd);
  text-decoration: underline;
}
</style>

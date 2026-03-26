<template>
  <div class="pulse-card">
    <h3 class="pulse-card-title">Activity Today</h3>
    <div v-if="isEmpty" class="pulse-empty">
      No reactions yet today &mdash; emoji will appear here as your team reacts.
    </div>
    <div v-else class="heatmap-grid">
      <div
        v-for="h in hours"
        :key="h.hour"
        class="heatmap-cell"
        :style="{ opacity: cellOpacity(h.count) }"
        :title="`${formatHour(h.hour)}: ${h.count} reactions`"
      >
        <span class="heatmap-count">{{ h.count || '' }}</span>
      </div>
    </div>
    <div v-if="!isEmpty" class="heatmap-labels">
      <span v-for="h in [0, 6, 12, 18]" :key="h" class="heatmap-label">
        {{ formatHour(h) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface HourData {
  hour: number;
  count: number;
}

const props = defineProps<{
  hours: HourData[];
}>();

const maxCount = computed(() => Math.max(...props.hours.map((h) => h.count), 1));
const isEmpty = computed(() => props.hours.every((h) => h.count === 0));

function cellOpacity(count: number): number {
  if (count === 0) return 0.1;
  return 0.2 + (count / maxCount.value) * 0.8;
}

function formatHour(hour: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "a" : "p";
  return `${h}${ampm}`;
}
</script>

<style scoped>
.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 2px;
  margin-top: 8px;
}

.heatmap-cell {
  aspect-ratio: 1;
  background: var(--text-lcd);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
}

.heatmap-count {
  font-family: 'Share Tech Mono', monospace;
  font-size: 9px;
  color: var(--screen-bg);
}

.heatmap-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  padding: 0 2px;
}

.heatmap-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  color: var(--text-dim);
}
</style>

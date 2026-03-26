<template>
  <div class="pulse-card">
    <h3 class="pulse-card-title">Weekly Trend</h3>
    <div v-if="isEmpty" class="pulse-empty">
      <div class="placeholder-bars">
        <div v-for="i in 7" :key="i" class="placeholder-bar"></div>
      </div>
      <span class="placeholder-label">Collecting data...</span>
    </div>
    <div v-else class="sparkline-container">
      <svg :viewBox="`0 0 ${width} ${height}`" class="sparkline-svg">
        <!-- Area fill -->
        <polygon
          :points="areaPoints"
          class="sparkline-area"
        />
        <!-- Line -->
        <polyline
          :points="linePoints"
          class="sparkline-line"
        />
        <!-- Dots -->
        <circle
          v-for="(p, i) in points"
          :key="i"
          :cx="p.x"
          :cy="p.y"
          r="3"
          class="sparkline-dot"
        />
      </svg>
      <div class="sparkline-labels">
        <span v-for="d in days" :key="d.date" class="sparkline-label">
          {{ formatDate(d.date) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface DayData {
  date: string;
  count: number;
}

const props = defineProps<{
  days: DayData[];
}>();

const width = 280;
const height = 80;
const padding = 10;

const isEmpty = computed(() => props.days.length === 0);
const maxCount = computed(() => Math.max(...props.days.map((d) => d.count), 1));

const points = computed(() => {
  if (props.days.length === 0) return [];
  const xStep = (width - padding * 2) / Math.max(props.days.length - 1, 1);
  return props.days.map((d, i) => ({
    x: padding + i * xStep,
    y: padding + (1 - d.count / maxCount.value) * (height - padding * 2),
  }));
});

const linePoints = computed(() =>
  points.value.map((p) => `${p.x},${p.y}`).join(" ")
);

const areaPoints = computed(() => {
  if (points.value.length === 0) return "";
  const base = height - padding;
  const first = `${points.value[0].x},${base}`;
  const last = `${points.value[points.value.length - 1].x},${base}`;
  return `${first} ${linePoints.value} ${last}`;
});

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[d.getUTCDay()];
}
</script>

<style scoped>
.sparkline-container {
  margin-top: 8px;
}

.sparkline-svg {
  width: 100%;
  height: auto;
}

.sparkline-line {
  fill: none;
  stroke: var(--text-lcd);
  stroke-width: 2;
  stroke-linejoin: round;
}

.sparkline-area {
  fill: var(--text-lcd);
  opacity: 0.15;
}

.sparkline-dot {
  fill: var(--text-lcd);
}

.sparkline-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}

.sparkline-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  color: var(--text-dim);
}

.placeholder-bars {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  height: 60px;
  margin-top: 8px;
}

.placeholder-bar {
  flex: 1;
  background: var(--stat-border);
  border-radius: 2px;
  height: 30%;
}

.placeholder-bar:nth-child(2) { height: 50%; }
.placeholder-bar:nth-child(3) { height: 40%; }
.placeholder-bar:nth-child(4) { height: 70%; }
.placeholder-bar:nth-child(5) { height: 45%; }
.placeholder-bar:nth-child(6) { height: 60%; }
.placeholder-bar:nth-child(7) { height: 35%; }

.placeholder-label {
  display: block;
  text-align: center;
  margin-top: 8px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
}
</style>

<template>
  <div class="page-tabs">
    <NuxtLink
      v-for="t in tabs"
      :key="t.to"
      :to="t.to"
      class="page-tab"
      :class="{ active: isActive(t.to) }"
    >{{ t.label }}</NuxtLink>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  tabs: { to: string; label: string }[];
}>();

const route = useRoute();

function isActive(to: string): boolean {
  return route.path === to || (to !== '/' && route.path.startsWith(to));
}
</script>

<style scoped>
.page-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.page-tab {
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

.page-tab.active {
  background: var(--stat-bg);
  color: var(--text-lcd);
  border: 1px solid var(--stat-border);
  border-bottom: none;
}

.page-tab:hover:not(.active) {
  color: var(--text-lcd);
}
</style>

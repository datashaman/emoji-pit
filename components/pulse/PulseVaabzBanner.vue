<template>
  <div class="vaabz-banner">
    <span class="vaabz-text">
      What do these patterns mean?
      <strong>vaabz</strong> turns reaction data into sentiment insights, team health scores, and recognition trends.
    </span>
    <a href="https://vaabz.com" target="_blank" rel="noopener" class="vaabz-cta">
      Learn more &rarr;
    </a>
  </div>
</template>

<style scoped>
.vaabz-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--stat-bg);
  border: 1px solid var(--stat-border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 16px;
}

.vaabz-text {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  color: var(--text-label);
  flex: 1;
}

.vaabz-text strong {
  color: var(--text-lcd);
}

.vaabz-cta {
  font-family: 'Press Start 2P', monospace;
  font-size: 9px;
  color: var(--text-lcd);
  text-decoration: none;
  border: 1px solid var(--text-lcd);
  border-radius: 6px;
  padding: 8px 14px;
  white-space: nowrap;
  transition: background 0.2s, color 0.2s;
}

.vaabz-cta:hover {
  background: var(--text-lcd);
  color: var(--screen-bg);
}
</style>

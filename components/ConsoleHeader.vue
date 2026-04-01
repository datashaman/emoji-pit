<template>
  <div class="console-header">
    <div class="brand">
      <slot name="brand-prefix" />
      <h1>Emoji Pit</h1>
    </div>
    <div class="header-right">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>

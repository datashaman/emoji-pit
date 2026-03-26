<template>
  <div class="emoji-picker" ref="pickerRef">
    <button class="picker-trigger" @click="open = !open" type="button">+ add emoji</button>
    <div v-if="open" class="picker-dropdown">
      <input
        ref="searchInput"
        v-model="search"
        class="picker-search"
        placeholder="Search emoji..."
        @keydown.escape="open = false"
      />
      <div class="picker-grid">
        <template v-if="search">
          <button
            v-for="e in filtered"
            :key="e.name"
            class="picker-emoji"
            :title="`:${e.name}:`"
            type="button"
            @click="select(e)"
          >
            <img v-if="e.url" :src="e.url" :alt="e.name" class="picker-emoji-img" />
            <img v-else-if="e.emoji" :src="twemojiUrl(e.emoji)" :alt="e.emoji" class="picker-emoji-img" />
          </button>
        </template>
        <template v-else>
          <div v-for="cat in visibleCategories" :key="cat" class="picker-category">
            <div class="picker-category-label">{{ cat }}</div>
            <div class="picker-category-grid">
              <button
                v-for="e in emojiByCategory[cat]"
                :key="e.name"
                class="picker-emoji"
                :title="`:${e.name}:`"
                type="button"
                @click="select(e)"
              >
                <img v-if="e.url" :src="e.url" :alt="e.name" class="picker-emoji-img" />
                <img v-else-if="e.emoji" :src="twemojiUrl(e.emoji)" :alt="e.emoji" class="picker-emoji-img" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface EmojiEntry {
  name: string;
  emoji?: string;
  url?: string;
  category: string;
  tags?: string[];
}

const props = defineProps<{
  emojis: { standard: EmojiEntry[]; custom: EmojiEntry[] };
  exclude?: string[];
}>();

const emit = defineEmits<{
  select: [name: string];
}>();

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";

function twemojiUrl(unicode: string): string {
  const codepoints = [...unicode]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f");
  return TWEMOJI_BASE + codepoints.join("-") + ".svg";
}

const open = ref(false);
const search = ref("");
const pickerRef = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();

const allEmoji = computed(() => {
  const excluded = new Set(props.exclude ?? []);
  return [...props.emojis.custom, ...props.emojis.standard].filter(
    (e) => !excluded.has(e.name)
  );
});

const CATEGORY_ORDER = [
  "Custom",
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
];

const emojiByCategory = computed(() => {
  const map: Record<string, EmojiEntry[]> = {};
  for (const e of allEmoji.value) {
    (map[e.category] ??= []).push(e);
  }
  return map;
});

const visibleCategories = computed(() =>
  CATEGORY_ORDER.filter((c) => emojiByCategory.value[c]?.length)
);

const filtered = computed(() => {
  if (!search.value) return [];
  const q = search.value.toLowerCase();
  return allEmoji.value
    .filter(
      (e) =>
        e.name.includes(q) ||
        e.tags?.some((t) => t.includes(q))
    )
    .slice(0, 60);
});

function select(e: EmojiEntry) {
  emit("select", e.name);
  open.value = false;
  search.value = "";
}

watch(open, (val) => {
  if (val) {
    nextTick(() => searchInput.value?.focus());
  }
});

function handleClickOutside(event: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("click", handleClickOutside));
onUnmounted(() => document.removeEventListener("click", handleClickOutside));
</script>

<style scoped>
.emoji-picker {
  position: relative;
  display: inline-block;
}

.picker-trigger {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  background: transparent;
  border: 1px dashed var(--stat-border);
  color: var(--text-dim);
  border-radius: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.picker-trigger:hover {
  border-color: var(--text-lcd);
  color: var(--text-lcd);
}

.picker-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 320px;
  max-height: 360px;
  background: var(--shell);
  border: 1px solid var(--stat-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.picker-search {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px;
  background: var(--stat-bg);
  border: none;
  border-bottom: 1px solid var(--stat-border);
  color: var(--text-lcd);
  padding: 10px 12px;
  outline: none;
  border-radius: 8px 8px 0 0;
}

.picker-grid {
  overflow-y: auto;
  flex: 1;
  padding: 8px;
}

.picker-category-label {
  font-family: 'Press Start 2P', monospace;
  font-size: 7px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 6px 4px 4px;
}

.picker-category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.picker-emoji {
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
}

.picker-emoji:hover {
  background: var(--stat-bg);
}

.picker-emoji-img {
  width: 22px;
  height: 22px;
}
</style>

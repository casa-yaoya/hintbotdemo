<script setup lang="ts">
interface SubtitleEntry {
  id: string
  timestamp: string
  text: string
}

interface Props {
  subtitles: SubtitleEntry[]
}

defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)
</script>

<template>
  <div class="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
    <div
      ref="containerRef"
      class="space-y-1"
    >
      <div
        v-for="subtitle in subtitles"
        :key="subtitle.id"
        class="text-xs"
      >
        <span class="mr-2 font-mono text-slate-400">{{ subtitle.timestamp }}</span>
        <span class="text-slate-700">{{ subtitle.text }}</span>
      </div>
      <div
        v-if="subtitles.length === 0"
        class="py-4 text-center text-xs text-slate-400"
      >
        会話を開始すると字幕が表示されます
      </div>
    </div>
  </div>
</template>

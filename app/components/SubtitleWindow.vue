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
  <div class="subtitle-window flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
    <div class="border-b border-slate-100 px-4 py-2">
      <h4 class="text-sm font-medium text-slate-600">
        字幕
      </h4>
    </div>
    <div
      ref="containerRef"
      class="flex-1 overflow-y-auto p-3"
    >
      <div class="space-y-2">
        <div
          v-for="subtitle in subtitles"
          :key="subtitle.id"
          class="text-sm"
        >
          <span class="mr-2 font-mono text-xs text-slate-400">{{ subtitle.timestamp }}</span>
          <span class="text-slate-700">{{ subtitle.text }}</span>
        </div>
        <div
          v-if="subtitles.length === 0"
          class="py-4 text-center text-sm text-slate-400"
        >
          会話を開始すると字幕が表示されます
        </div>
      </div>
    </div>
  </div>
</template>

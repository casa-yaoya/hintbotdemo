<script setup lang="ts">
import type { AudioMetadata } from '~/composables/useRealtimeAPI'

interface LogEntry {
  timestamp: string
  type: 'step' | 'hint' | 'transcript'
  message: string
  matchedPhrase?: string // 検出されたフレーズ（あれば）
}

interface Props {
  metadata: AudioMetadata
  isActive: boolean
  logs: LogEntry[]
}

const props = defineProps<Props>()

const volumePercent = computed(() => Math.round(props.metadata.volume * 100))
const volumeDb = computed(() => props.metadata.volumeDb.toFixed(1))

const silenceDurationSec = computed(() => {
  return (props.metadata.silenceDuration / 1000).toFixed(1)
})

const logContainer = ref<HTMLElement | null>(null)

watch(() => props.logs.length, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = 0
    }
  })
})

// 文字起こしログのみ抽出
const transcriptLogs = computed(() => {
  return props.logs.filter(log => log.type === 'transcript').slice(0, 5)
})
</script>

<template>
  <div class="metadata-panel flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <!-- ボリュームと沈黙時間 -->
    <div class="mb-3 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm text-slate-500">ボリューム</span>
        <div class="flex items-center gap-2">
          <div class="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full bg-primary-500 transition-all duration-100"
              :style="{ width: `${volumePercent}%` }"
            />
          </div>
          <span class="min-w-[4rem] text-right text-xs text-slate-600">{{ volumeDb }} dB</span>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-sm text-slate-500">沈黙時間</span>
        <span class="text-sm text-slate-700">{{ silenceDurationSec }} 秒</span>
      </div>
    </div>

    <!-- 文字起こし履歴 -->
    <div class="mb-3 border-t border-slate-100 pt-3">
      <h4 class="mb-2 text-sm font-medium text-slate-600">
        文字起こし（直近5件）
      </h4>
      <div class="max-h-[100px] space-y-1 overflow-y-auto">
        <div
          v-for="(log, index) in transcriptLogs"
          :key="index"
          class="rounded bg-slate-50 p-1.5 text-xs"
        >
          <div class="flex items-start gap-2">
            <span class="shrink-0 font-mono text-slate-400">{{ log.timestamp }}</span>
            <span class="flex-1 text-slate-700">{{ log.message }}</span>
          </div>
          <div
            v-if="log.matchedPhrase"
            class="mt-1 flex items-center gap-1"
          >
            <UIcon name="lucide:check-circle" class="h-3 w-3 text-green-500" />
            <span class="text-green-600">「{{ log.matchedPhrase }}」検出</span>
          </div>
        </div>
        <div
          v-if="transcriptLogs.length === 0"
          class="text-xs text-slate-400"
        >
          文字起こしなし
        </div>
      </div>
    </div>

    <!-- ログエリア -->
    <div class="flex-1 border-t border-slate-100 pt-3">
      <h4 class="mb-2 text-sm font-medium text-slate-600">
        システムログ
      </h4>
      <div
        ref="logContainer"
        class="h-[100px] space-y-1 overflow-y-auto"
      >
        <div
          v-for="(log, index) in logs.filter(l => l.type !== 'transcript')"
          :key="index"
          class="flex items-start gap-2 text-xs"
        >
          <span class="shrink-0 font-mono text-slate-400">{{ log.timestamp }}</span>
          <span
            :class="log.type === 'hint' ? 'text-amber-600' : 'text-blue-600'"
          >
            {{ log.message }}
          </span>
        </div>
        <div
          v-if="logs.filter(l => l.type !== 'transcript').length === 0"
          class="text-xs text-slate-400"
        >
          ログなし
        </div>
      </div>
    </div>
  </div>
</template>

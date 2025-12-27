<script setup lang="ts">
import type { AudioMetadata } from '~/composables/useRealtimeAPI'

interface Props {
  metadata: AudioMetadata
  isActive: boolean
}

const props = defineProps<Props>()

const volumePercent = computed(() => Math.round(props.metadata.volume * 100))
const volumeDb = computed(() => props.metadata.volumeDb.toFixed(1))

const silenceDurationSec = computed(() => {
  return (props.metadata.silenceDuration / 1000).toFixed(1)
})

function formatTime(timestamp?: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="metadata-panel rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 class="mb-3 text-sm font-semibold text-slate-700">
      オーディオメタデータ
    </h3>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm text-slate-500">状態</span>
        <UBadge
          :color="isActive ? 'success' : 'neutral'"
          variant="subtle"
        >
          {{ isActive ? 'アクティブ' : '停止中' }}
        </UBadge>
      </div>

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
        <span class="text-sm text-slate-500">音声検出</span>
        <UBadge
          :color="metadata.isSpeechDetected ? 'warning' : 'neutral'"
          variant="subtle"
        >
          {{ metadata.isSpeechDetected ? '検出中' : '無音' }}
        </UBadge>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-sm text-slate-500">沈黙時間</span>
        <span class="text-sm text-slate-700">{{ silenceDurationSec }} 秒</span>
      </div>

      <div
        v-if="metadata.phraseDetections.length > 0"
        class="border-t border-slate-100 pt-3"
      >
        <h4 class="mb-2 text-sm font-medium text-slate-600">
          フレーズ検出
        </h4>
        <div class="space-y-2">
          <div
            v-for="detection in metadata.phraseDetections"
            :key="detection.phrase"
            class="flex flex-col gap-1 rounded-lg bg-slate-50 p-2"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UBadge
                  :color="detection.matchType === 'exact' ? 'info' : 'warning'"
                  variant="subtle"
                  size="xs"
                >
                  {{ detection.matchType === 'exact' ? '完全' : '意味' }}
                </UBadge>
                <span class="text-sm text-slate-700">{{ detection.phrase }}</span>
              </div>
              <UIcon
                v-if="detection.detected"
                name="lucide:check-circle"
                class="h-4 w-4 text-green-500"
              />
              <UIcon
                v-else
                name="lucide:circle"
                class="h-4 w-4 text-slate-300"
              />
            </div>
            <div
              v-if="detection.detected && detection.detectedExpression"
              class="text-xs text-slate-500"
            >
              発話: 「{{ detection.detectedExpression }}」
              <span v-if="detection.detectedAt" class="ml-2">
                ({{ formatTime(detection.detectedAt) }})
              </span>
            </div>
            <div
              v-else-if="detection.detected && detection.detectedAt"
              class="text-xs text-slate-500"
            >
              検出時刻: {{ formatTime(detection.detectedAt) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'

interface LogEntry {
  timestamp: string
  type: 'step' | 'hint' | 'transcript'
  message: string
  matchedPhrase?: string
}

interface SubtitleEntry {
  id: string
  timestamp: string
  text: string
}

interface CurrentStatus {
  index: number
  name: string | null
  changedAt: number | null
}

interface AudioMetadata {
  volume: number
  volumeDb: number
}

defineProps<{
  subtitles: SubtitleEntry[]
  logs: LogEntry[]
  configs: PhraseConfig[]
  currentStatus: CurrentStatus
  audioMetadata: AudioMetadata
  isConnected: boolean
}>()

const emit = defineEmits<{
  'update:configs': [configs: PhraseConfig[]]
}>()

const isExpanded = ref(true)

function handleUpdateConfigs(newConfigs: PhraseConfig[]) {
  emit('update:configs', newConfigs)
}
</script>

<template>
  <div class="relative bg-white">
    <!-- 折りたたみボタン -->
    <div class="flex justify-center">
      <button
        class="z-10 -mb-3 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white shadow-sm transition-all hover:bg-slate-50"
        @click="isExpanded = !isExpanded"
      >
        <UIcon
          :name="isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
          class="h-4 w-4 text-slate-500"
        />
      </button>
    </div>

    <!-- 詳細コンテンツ -->
    <div
      class="overflow-hidden transition-all duration-300"
      :class="isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'"
    >
      <!-- 字幕・ステータス・ログ（3列横並び） -->
      <div class="grid grid-cols-3 gap-4 border-b border-slate-200 bg-white p-4">
        <!-- 字幕ウィンドウ -->
        <div class="flex flex-col">
          <h3 class="mb-2 text-sm font-medium text-slate-600">字幕</h3>
          <div class="flex-1">
            <SubtitleWindow :subtitles="subtitles" />
          </div>
        </div>

        <!-- ステータスウィンドウ -->
        <div class="flex flex-col">
          <h3 class="mb-2 text-sm font-medium text-slate-600">現在のステータス</h3>
          <div class="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="space-y-2 text-sm">
              <!-- 現在の会話ステータス -->
              <div class="flex items-center justify-between">
                <span class="text-slate-500">会話ステータス</span>
                <span
                  class="font-medium"
                  :class="currentStatus.index === -1 ? 'text-slate-400' : 'text-primary-600'"
                >
                  {{ currentStatus.index === -1 ? '待機中' : `${currentStatus.index + 1}. ${currentStatus.name}` }}
                </span>
              </div>
              <!-- ステータス進行バー -->
              <div class="flex items-center gap-1">
                <template v-for="(config, idx) in configs.filter(c => c.enabled)" :key="config.id">
                  <div
                    class="h-2 flex-1 rounded-full transition-all duration-300"
                    :class="idx <= currentStatus.index ? 'bg-primary-500' : 'bg-slate-200'"
                  />
                </template>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500">ボリューム</span>
                <div class="flex items-center gap-2">
                  <div class="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                    <div
                      class="h-full rounded-full bg-primary-500 transition-all duration-100"
                      :style="{ width: `${Math.round(audioMetadata.volume * 100)}%` }"
                    />
                  </div>
                  <span class="min-w-[3rem] text-right text-xs text-slate-600">{{ audioMetadata.volumeDb.toFixed(1) }} dB</span>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500">状態</span>
                <span :class="isConnected ? 'text-green-600' : 'text-slate-400'">
                  {{ isConnected ? '接続中' : '未接続' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ログウィンドウ -->
        <div class="flex flex-col">
          <h3 class="mb-2 text-sm font-medium text-slate-600">ログ</h3>
          <div class="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div class="space-y-1">
              <div
                v-for="(log, index) in logs.filter(l => l.type !== 'transcript').slice(0, 20)"
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
      </div>

      <!-- 検出対象リスト（フローステータスとスポットステータス） -->
      <div class="grid grid-cols-2 gap-4 p-4">
        <!-- フローステータス -->
        <div>
          <HintConfigTable
            :configs="configs"
            status-type="flow"
            title="フローステータス"
            @update:configs="handleUpdateConfigs"
          />
        </div>
        <!-- スポットステータス -->
        <div>
          <HintConfigTable
            :configs="configs"
            status-type="spot"
            title="スポットステータス"
            @update:configs="handleUpdateConfigs"
          />
        </div>
      </div>
    </div>
  </div>
</template>

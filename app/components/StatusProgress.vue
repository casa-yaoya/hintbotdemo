<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'

interface Props {
  configs: PhraseConfig[]
  topicName: string | null // 現在のトピック名（null: 未確定）
  detectedTopics: Set<string> // 過去に判定されたことのあるトピック名
  phraseName: string | null // 現在発火中のフレーズ名
}

const props = defineProps<Props>()

// トピック判定のみ抽出
const topicConfigs = computed(() =>
  props.configs.filter(c => c.enabled && c.detectionType === 'topic'),
)

// フレーズ判定のみ抽出
const phraseConfigs = computed(() =>
  props.configs.filter(c => c.enabled && c.detectionType === 'phrase'),
)
</script>

<template>
  <ClientOnly>
    <div class="flex h-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2">
      <!-- ヘッダー -->
      <div class="mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
        <UIcon name="lucide:list-ordered" class="h-3.5 w-3.5 text-slate-500" />
        <span class="text-xs font-medium text-slate-600">トピック進行</span>
      </div>

      <!-- トピック判定 -->
      <div class="flex flex-col gap-0.5 overflow-y-auto">
        <!-- トピック一覧 -->
        <div
          v-for="(config, idx) in topicConfigs"
          :key="config.id"
          class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-all"
          :class="[
            config.phrase === topicName
              ? 'animate-pulse border-green-500 bg-green-50 text-green-700'
              : detectedTopics.has(config.phrase)
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-slate-50 text-slate-500',
          ]"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            :class="[
              config.phrase === topicName
                ? 'bg-green-500 text-white'
                : detectedTopics.has(config.phrase)
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-300 text-slate-600',
            ]"
          >{{ idx + 1 }}</span>
          <span class="truncate">{{ config.phrase }}</span>
        </div>
        <div
          v-if="topicConfigs.length === 0"
          class="py-2 text-center text-xs text-slate-400"
        >
          トピックなし
        </div>
      </div>

      <!-- 区切り線（フレーズ判定がある場合のみ） -->
      <div
        v-if="phraseConfigs.length > 0"
        class="my-2 border-t border-dashed border-slate-200"
      />

      <!-- フレーズ判定（発火中のもののみ表示） -->
      <div
        v-if="phraseConfigs.length > 0"
        class="flex flex-col gap-0.5"
      >
        <div class="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">PHRASE</div>
        <div
          v-if="phraseName"
          class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-all animate-pulse border-amber-500 bg-amber-50 text-amber-700"
        >
          <UIcon name="lucide:zap" class="h-3 w-3 shrink-0" />
          <span class="truncate">{{ phraseName }}</span>
        </div>
        <div
          v-else
          class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-xs text-slate-400"
        >
          待機中
        </div>
      </div>
    </div>
    <template #fallback>
      <div class="flex h-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-2">
        <div class="mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
          <div class="h-3.5 w-3.5 rounded bg-slate-200" />
          <span class="text-xs font-medium text-slate-600">トピック進行</span>
        </div>
        <div class="animate-pulse space-y-1">
          <div class="h-6 rounded bg-slate-200" />
          <div class="h-6 rounded bg-slate-200" />
          <div class="h-6 rounded bg-slate-200" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>

<style scoped>
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.animate-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
</style>

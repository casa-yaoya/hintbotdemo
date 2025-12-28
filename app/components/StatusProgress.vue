<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'

interface Props {
  configs: PhraseConfig[]
  currentIndex: number // 現在のフローステータスインデックス（-1: 未開始、0から順にステータス）
  detectedIndices: Set<number> // 過去に判定されたことのあるフローステータスのインデックス
  spotName: string | null // 現在発火中のスポットステータス名
}

const props = defineProps<Props>()

// フローステータスのみ抽出
const flowConfigs = computed(() =>
  props.configs.filter(c => c.enabled && c.statusType === 'flow'),
)

// スポットステータスのみ抽出
const spotConfigs = computed(() =>
  props.configs.filter(c => c.enabled && c.statusType === 'spot'),
)
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- フローステータス -->
    <div class="flex flex-col gap-0.5">
      <div
        v-for="(config, idx) in flowConfigs"
        :key="config.id"
        class="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-all"
        :class="[
          idx === currentIndex
            ? 'animate-pulse border-green-500 bg-green-50 text-green-700'
            : detectedIndices.has(idx)
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-700',
        ]"
      >
        <span class="font-mono text-[10px]">{{ idx + 1 }}</span>
        <span class="truncate">{{ config.phrase }}</span>
      </div>
      <div
        v-if="flowConfigs.length === 0"
        class="text-xs text-slate-400"
      >
        フローなし
      </div>
    </div>

    <!-- 区切り線（スポットステータスがある場合のみ） -->
    <div
      v-if="spotConfigs.length > 0"
      class="my-1 border-t border-dashed border-slate-300"
    />

    <!-- スポットステータス（発火中のもののみ表示） -->
    <div
      v-if="spotConfigs.length > 0"
      class="flex flex-col gap-0.5"
    >
      <div
        v-if="spotName"
        class="flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] transition-all animate-pulse border-amber-500 bg-amber-50 text-amber-700"
      >
        <UIcon name="lucide:zap" class="h-3 w-3 shrink-0" />
        <span class="truncate">{{ spotName }}</span>
      </div>
      <div
        v-else
        class="text-[10px] text-slate-400"
      >
        -
      </div>
    </div>
  </div>
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

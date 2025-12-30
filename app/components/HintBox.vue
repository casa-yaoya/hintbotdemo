<script setup lang="ts">
import type { HintStatus } from '~/composables/useRealtimeAPI'

interface Props {
  hintText: string
  hintStatus: HintStatus
  statusName?: string | null
  isSpeaking: boolean
  isListening: boolean
  layout?: 'default' | 'horizontal'
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'default',
  statusName: null,
})

const displayText = computed(() => {
  if (props.hintText) {
    return props.hintText
  }
  if (props.isListening) {
    return 'listening...'
  }
  return ''
})

const isProvisional = computed(() => props.hintStatus === 'provisional')
const isConfirmed = computed(() => props.hintStatus === 'confirmed')
const hasHint = computed(() => props.hintStatus !== 'none' && props.hintText)
</script>

<template>
  <div
    class="hint-box relative flex w-full items-center justify-center rounded-xl transition-all duration-300"
    :class="[
      layout === 'horizontal' ? 'h-28 px-6 py-4' : 'h-full min-h-[200px] rounded-2xl p-6',
      isConfirmed
        ? 'bg-primary-100 shadow-lg shadow-primary-200'
        : isProvisional
          ? 'bg-amber-50 shadow-md shadow-amber-100'
          : 'bg-violet-50',
      isSpeaking ? 'ring-2 ring-primary-400 ring-offset-2' : '',
    ]"
  >
    <!-- 発話中インジケーター -->
    <div
      v-if="isSpeaking"
      :class="layout === 'horizontal' ? 'absolute -top-1 -right-1' : 'absolute -top-2 -right-2'"
    >
      <span class="relative flex h-3 w-3">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
        <span class="relative inline-flex h-3 w-3 rounded-full bg-primary-500" />
      </span>
    </div>

    <!-- 仮判定インジケーター -->
    <div
      v-if="isProvisional && layout !== 'horizontal'"
      class="absolute top-2 left-2"
    >
      <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        判定中...
      </span>
    </div>

    <!-- 確定インジケーター（ステータス名付き） -->
    <div
      v-if="isConfirmed && layout !== 'horizontal'"
      class="absolute top-2 left-2"
    >
      <span class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
        <UIcon name="lucide:check" class="h-3 w-3" />
        {{ statusName || '確定' }}
      </span>
    </div>

    <!-- 横長レイアウト用のインラインインジケーター -->
    <span
      v-if="isProvisional && layout === 'horizontal'"
      class="mr-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
    >
      <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      判定中
    </span>
    <span
      v-if="isConfirmed && layout === 'horizontal'"
      class="mr-2 inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700"
    >
      <UIcon name="lucide:check" class="h-3 w-3" />
      {{ statusName || '確定' }}
    </span>

    <p
      class="transition-opacity duration-200 whitespace-pre-line"
      :class="[
        layout === 'horizontal' ? 'text-base' : 'text-center text-sm leading-relaxed',
        isConfirmed ? 'font-medium text-primary-800' : '',
        isProvisional ? 'font-medium text-amber-700 opacity-80' : '',
        !hasHint ? 'italic text-slate-400' : '',
        'line-clamp-5',
      ]"
    >
      {{ displayText }}
    </p>
  </div>
</template>

<style scoped>
.hint-box {
  backdrop-filter: blur(8px);
}
</style>

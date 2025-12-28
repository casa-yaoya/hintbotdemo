<script setup lang="ts">
import type { HintStatus } from '~/composables/useRealtimeAPI'

interface Props {
  hintText: string
  hintStatus: HintStatus
  isSpeaking: boolean
  isListening: boolean
}

const props = defineProps<Props>()

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
    class="hint-box relative flex h-full min-h-[200px] w-full items-center justify-center rounded-2xl border-2 p-6 transition-all duration-300"
    :class="[
      isConfirmed
        ? 'border-primary-500 bg-primary-50 shadow-lg shadow-primary-200'
        : isProvisional
          ? 'border-amber-400 bg-amber-50/50 shadow-md shadow-amber-100'
          : 'border-slate-200 bg-white',
      isSpeaking ? 'ring-2 ring-primary-400 ring-offset-2' : '',
    ]"
  >
    <!-- 発話中インジケーター -->
    <div
      v-if="isSpeaking"
      class="absolute -top-2 -right-2"
    >
      <span class="relative flex h-4 w-4">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
        <span class="relative inline-flex h-4 w-4 rounded-full bg-primary-500" />
      </span>
    </div>

    <!-- 仮判定インジケーター -->
    <div
      v-if="isProvisional"
      class="absolute top-2 left-2"
    >
      <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        判定中...
      </span>
    </div>

    <!-- 確定インジケーター -->
    <div
      v-if="isConfirmed"
      class="absolute top-2 left-2"
    >
      <span class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
        <UIcon name="lucide:check" class="h-3 w-3" />
        確定
      </span>
    </div>

    <p
      class="text-center text-lg leading-relaxed transition-opacity duration-200"
      :class="[
        isConfirmed ? 'font-medium text-primary-800' : '',
        isProvisional ? 'font-medium text-amber-700 opacity-80' : '',
        !hasHint ? 'italic text-slate-400' : '',
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

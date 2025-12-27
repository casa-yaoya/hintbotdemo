<script setup lang="ts">
interface Props {
  hint: string
  isSpeaking: boolean
  isListening: boolean
}

const props = defineProps<Props>()

const displayText = computed(() => {
  if (props.hint) {
    return props.hint
  }
  if (props.isListening) {
    return 'listening...'
  }
  return ''
})

const isHintMode = computed(() => !!props.hint)
</script>

<template>
  <div
    class="hint-box relative flex min-h-[200px] w-full max-w-md items-center justify-center rounded-2xl border-2 p-6 transition-all duration-300"
    :class="[
      isHintMode
        ? 'border-primary-500 bg-primary-50 shadow-lg shadow-primary-200'
        : 'border-slate-200 bg-white',
      isSpeaking ? 'ring-2 ring-primary-400 ring-offset-2' : '',
    ]"
  >
    <div
      v-if="isSpeaking"
      class="absolute -top-2 -right-2"
    >
      <span class="relative flex h-4 w-4">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
        <span class="relative inline-flex h-4 w-4 rounded-full bg-primary-500" />
      </span>
    </div>

    <p
      class="text-center text-lg leading-relaxed"
      :class="isHintMode ? 'text-primary-800 font-medium' : 'text-slate-400 italic'"
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

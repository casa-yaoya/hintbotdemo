<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'
import { DEFAULT_MODELS } from '~/composables/useRealtimeAPI'

interface SubtitleEntry {
  id: string
  timestamp: string
  text: string
}

// LocalStorageから設定を読み込み
const prompt = useLocalStorage('hintbot-prompt', '')
const configs = useLocalStorage<PhraseConfig[]>('hintbot-configs', [])
const transcribeModel = useLocalStorage('hintbot-transcribe-model', DEFAULT_MODELS.transcribe)
const topicDetectionModel = useLocalStorage('hintbot-topic-detection-model', DEFAULT_MODELS.topicDetection)

const subtitles = ref<SubtitleEntry[]>([])

const {
  isConnected,
  isSpeaking,
  hintState,
  toggleRoleplay,
  setRegisteredPhrases,
  resetPhraseDetections,
  onTranscript,
} = useRealtimeAPI()

function formatTimeWithMs(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

onTranscript.value = (transcript: string, isFinal: boolean) => {
  if (isFinal && transcript.trim()) {
    subtitles.value.push({
      id: crypto.randomUUID(),
      timestamp: formatTimeWithMs(new Date()),
      text: transcript,
    })
  }
}

watch(configs, (newConfigs) => {
  setRegisteredPhrases(newConfigs)
}, { immediate: true })

async function handleToggle() {
  if (!isConnected.value) {
    resetPhraseDetections()
    subtitles.value = []
  }
  await toggleRoleplay({
    instructions: prompt.value,
    debounceMs: 1500,
    confirmDelayMs: 800,
    getConversationHistory: () => subtitles.value.map(s => s.text),
    transcribeModel: transcribeModel.value,
    topicDetectionModel: topicDetectionModel.value,
  })
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-white p-4 sm:items-center sm:justify-center sm:p-8">
    <!-- ヒント表示エリア -->
    <div class="flex-1 w-full max-w-4xl sm:h-[300px] sm:flex-none">
      <HintBox
        :hint-text="hintState.hintText"
        :hint-status="hintState.status"
        :status-name="hintState.statusName"
        :is-speaking="isSpeaking"
        :is-listening="isConnected"
        class="text-lg sm:text-2xl"
      />
    </div>

    <!-- コントロール -->
    <div class="flex shrink-0 justify-center py-4 sm:mt-6 sm:py-0">
      <button
        class="flex h-14 w-14 items-center justify-center rounded-full transition-colors active:scale-95 sm:h-12 sm:w-12"
        :class="isConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-500 hover:bg-violet-600'"
        @click="handleToggle"
      >
        <UIcon
          :name="isConnected ? 'lucide:square' : 'lucide:play'"
          class="h-7 w-7 text-white sm:h-6 sm:w-6"
        />
      </button>
    </div>
  </div>
</template>

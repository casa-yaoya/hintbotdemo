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
  <div class="flex h-screen flex-col items-center justify-center bg-white p-8">
    <!-- ヒント表示エリア -->
    <div class="h-[300px] w-full max-w-4xl">
      <HintBox
        :hint-text="hintState.hintText"
        :hint-status="hintState.status"
        :status-name="hintState.statusName"
        :is-speaking="isSpeaking"
        :is-listening="isConnected"
        class="text-2xl"
      />
    </div>

    <!-- コントロール -->
    <div class="mt-6">
      <button
        class="flex h-12 w-12 items-center justify-center rounded-full transition-colors"
        :class="isConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-500 hover:bg-violet-600'"
        @click="handleToggle"
      >
        <UIcon
          :name="isConnected ? 'lucide:square' : 'lucide:play'"
          class="h-6 w-6 text-white"
        />
      </button>
    </div>
  </div>
</template>

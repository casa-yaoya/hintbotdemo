<script setup lang="ts">
import type { AudioMetadata, HintCondition, PhraseConfig } from '~/composables/useRealtimeAPI'

const DEFAULT_PROMPT = `あなたは会話を聞いてヒントを提供するアシスタントです。
人間の会話を聞いて、適切なタイミングで簡潔なヒントやアドバイスを日本語で提供してください。
答えを直接教えるのではなく、考えるきっかけとなるヒントを与えてください。`

const DEFAULT_PHRASES: PhraseConfig[] = [
  { phrase: '国士無双１３面待ち', matchType: 'exact' },
  { phrase: 'ナレトレとヒントボットが主要なサービスです', matchType: 'exact' },
  { phrase: 'こんにちは', matchType: 'semantic', semanticHint: '挨拶全般（おはよう、ハロー、やあ等も含む）' },
]

const prompt = useLocalStorage('hintbot-prompt', DEFAULT_PROMPT)
const phrases = useLocalStorage<PhraseConfig[]>('hintbot-phrases', DEFAULT_PHRASES)

const isSettingsOpen = ref(false)
const currentHint = ref('')

const {
  isConnected,
  isPlaying,
  isSpeaking,
  audioMetadata,
  toggleRoleplay,
  manualRequestHint,
  setRegisteredPhrases,
  resetPhraseDetections,
  onAIResponse,
  onHintCheck,
  onError,
} = useRealtimeAPI()

onHintCheck.value = (metadata: AudioMetadata): HintCondition => {
  if (metadata.lastSpeechTimestamp > 0 && metadata.silenceDuration > 3000) {
    return {
      shouldShowHint: true,
      reason: '3秒以上の沈黙を検出',
    }
  }
  return { shouldShowHint: false }
}

onAIResponse.value = (text: string, isFinal: boolean) => {
  if (isFinal) {
    currentHint.value = text
    setTimeout(() => {
      currentHint.value = ''
    }, 10000)
  }
  else {
    currentHint.value = text
  }
}

onError.value = (error: string) => {
  console.error('Error:', error)
}

watch(phrases, (newPhrases) => {
  setRegisteredPhrases(newPhrases)
}, { immediate: true })

async function handleToggle() {
  if (!isConnected.value) {
    resetPhraseDetections()
    currentHint.value = ''
  }
  await toggleRoleplay({
    instructions: prompt.value,
    voice: 'shimmer',
    batchIntervalMs: 2000,
  })
}

function handleManualHint() {
  manualRequestHint()
}

function handleUpdatePrompt(newPrompt: string) {
  prompt.value = newPrompt
}

function handleUpdatePhrases(newPhrases: PhraseConfig[]) {
  phrases.value = newPhrases
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center px-4 py-8">
    <h1 class="mb-8 text-2xl font-bold text-slate-800">
      HintBot
    </h1>

    <div class="flex w-full max-w-lg flex-col items-center gap-6">
      <HintBox
        :hint="currentHint"
        :is-speaking="isSpeaking"
        :is-listening="isConnected"
      />

      <div class="flex gap-3">
        <UButton
          :color="isConnected ? 'error' : 'primary'"
          size="lg"
          @click="handleToggle"
        >
          <UIcon
            :name="isConnected ? 'lucide:square' : 'lucide:play'"
            class="mr-2 h-5 w-5"
          />
          {{ isConnected ? '停止' : '開始' }}
        </UButton>

        <UButton
          color="warning"
          variant="soft"
          size="lg"
          :disabled="!isConnected || isPlaying"
          @click="handleManualHint"
        >
          <UIcon name="lucide:lightbulb" class="mr-2 h-5 w-5" />
          ヒント
        </UButton>

        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          @click="isSettingsOpen = true"
        >
          <UIcon name="lucide:settings" class="mr-2 h-5 w-5" />
          設定
        </UButton>
      </div>

      <MetadataPanel
        :metadata="audioMetadata"
        :is-active="isConnected"
      />
    </div>

    <SettingsPopup
      v-model="isSettingsOpen"
      :prompt="prompt"
      :phrases="phrases"
      @update:prompt="handleUpdatePrompt"
      @update:phrases="handleUpdatePhrases"
    />
  </div>
</template>

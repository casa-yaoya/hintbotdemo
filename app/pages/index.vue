<script setup lang="ts">
import type { AudioMetadata, HintCondition, HintRule, PhraseConfig } from '~/composables/useRealtimeAPI'

const DEFAULT_PROMPT = `あなたはフレーズ検出アシスタントです。
ユーザーの発話を聞いて、登録されたフレーズを検出してください。
フレーズを検出したら detect_phrase 関数を呼び出してください。`

const DEFAULT_PHRASES: PhraseConfig[] = [
  { phrase: '国士無双１３面待ち', matchType: 'exact' },
  { phrase: 'ナレトレとヒントボットが主要なサービスです', matchType: 'exact' },
  { phrase: 'こんにちは', matchType: 'semantic', semanticHint: '挨拶全般（おはよう、ハロー、やあ等も含む）' },
]

const DEFAULT_HINT_RULES: HintRule[] = [
  {
    id: 'default-greeting',
    name: '挨拶ヒント',
    triggerPhrases: ['こんにちは'],
    hintText: '挨拶が検出されました！元気よく返事をしましょう。',
    enabled: true,
  },
]

const prompt = useLocalStorage('hintbot-prompt', DEFAULT_PROMPT)
const phrases = useLocalStorage<PhraseConfig[]>('hintbot-phrases', DEFAULT_PHRASES)
const hintRules = useLocalStorage<HintRule[]>('hintbot-hint-rules', DEFAULT_HINT_RULES)

const isSettingsOpen = ref(false)
const currentHint = ref('')
const triggeredRuleIds = ref<Set<string>>(new Set())

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

// フレーズ検出に基づいてヒントルールをチェック
function checkHintRules(metadata: AudioMetadata): string | null {
  const detectedPhrases = metadata.phraseDetections
    .filter(p => p.detected)
    .map(p => p.phrase)

  for (const rule of hintRules.value) {
    if (!rule.enabled) continue
    if (triggeredRuleIds.value.has(rule.id)) continue

    // すべてのトリガーフレーズが検出されているかチェック
    const allTriggersDetected = rule.triggerPhrases.every((trigger: string) =>
      detectedPhrases.includes(trigger),
    )

    if (allTriggersDetected) {
      triggeredRuleIds.value.add(rule.id)
      return rule.hintText
    }
  }
  return null
}

onHintCheck.value = (metadata: AudioMetadata): HintCondition => {
  const hintText = checkHintRules(metadata)
  if (hintText) {
    currentHint.value = hintText
    setTimeout(() => {
      currentHint.value = ''
    }, 10000)
  }
  return { shouldShowHint: false }
}

// AI応答は使わない（ヒントは設定済みテキストから表示）
onAIResponse.value = null

onError.value = (error: string) => {
  console.error('Error:', error)
}

watch(phrases, (newPhrases) => {
  setRegisteredPhrases(newPhrases)
}, { immediate: true })

async function handleToggle() {
  if (!isConnected.value) {
    resetPhraseDetections()
    triggeredRuleIds.value.clear()
    currentHint.value = ''
  }
  await toggleRoleplay({
    instructions: prompt.value,
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

function handleUpdateHintRules(newRules: HintRule[]) {
  hintRules.value = newRules
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
      :hint-rules="hintRules"
      @update:prompt="handleUpdatePrompt"
      @update:phrases="handleUpdatePhrases"
      @update:hint-rules="handleUpdateHintRules"
    />
  </div>
</template>

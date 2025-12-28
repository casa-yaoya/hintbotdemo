<script setup lang="ts">
import type { AudioMetadata, HintRule, PhraseConfig } from '~/composables/useRealtimeAPI'
import logoImage from '~/assets/images/logo-hintbot.png'

interface LogEntry {
  timestamp: string
  type: 'step' | 'hint'
  message: string
}

const DEFAULT_PROMPT = `あなたは音声分析のエキスパートです。ユーザーの会話を聞いて、登録された内容（意味）を検出してください。内容を検出したら detect_phrase 関数を呼び出してください。`

const DEFAULT_PHRASES: PhraseConfig[] = [
  { phrase: 'やーたんだ', matchType: 'exact' },
]

const DEFAULT_HINT_RULES: HintRule[] = [
  {
    id: 'default-yatan',
    triggerPhrases: ['やーたんだ'],
    hintText: 'たんたんだよ',
    enabled: true,
  },
]

const prompt = useLocalStorage('hintbot-prompt', DEFAULT_PROMPT)
const phrases = useLocalStorage<PhraseConfig[]>('hintbot-phrases', DEFAULT_PHRASES)
const hintRules = useLocalStorage<HintRule[]>('hintbot-hint-rules', DEFAULT_HINT_RULES)

const isSettingsOpen = ref(false)
const currentHint = ref('')
const triggeredRuleIds = ref<Set<string>>(new Set())
const logs = ref<LogEntry[]>([])

const {
  isConnected,
  isSpeaking,
  audioMetadata,
  toggleRoleplay,
  setRegisteredPhrases,
  resetPhraseDetections,
  onAIResponse,
  onPhraseDetected,
  onLog,
  onError,
} = useRealtimeAPI()

function formatTimeWithMs(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

function addLog(type: 'step' | 'hint', message: string) {
  logs.value.unshift({
    timestamp: formatTimeWithMs(new Date()),
    type,
    message,
  })
  // 最大100件保持
  if (logs.value.length > 100) {
    logs.value.pop()
  }
}

// ヒントを表示する
function showHint(hintText: string) {
  addLog('hint', `[7] ヒント発火「${hintText}」`)
  currentHint.value = hintText
  setTimeout(() => {
    currentHint.value = ''
  }, 10000)
}

// フレーズ検出に基づいてヒントルールをチェック
function checkHintRules(metadata: AudioMetadata): string | null {
  addLog('step', '[6] ヒントルールチェック')

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

// ログコールバック（useRealtimeAPIからのステップログ）
onLog.value = (step: string) => {
  addLog('step', step)
}

// フレーズ検出時に即座に呼び出される
onPhraseDetected.value = (_phrase: string, metadata: AudioMetadata) => {
  // 即座にヒントルールをチェック
  const hintText = checkHintRules(metadata)
  if (hintText) {
    showHint(hintText)
  }
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
    logs.value = []
    addLog('step', '[1] 音声キャプチャ開始')
  }
  await toggleRoleplay({
    instructions: prompt.value,
    batchIntervalMs: 2000,
  })
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
    <img
      :src="logoImage"
      alt="HintBot"
      class="mb-8 h-16"
    >

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
        :logs="logs"
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

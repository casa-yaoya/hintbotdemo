<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'
import logoImage from '~/assets/images/logo-hintbot-hori.png'

interface LogEntry {
  timestamp: string
  type: 'step' | 'hint' | 'transcript'
  message: string
  matchedPhrase?: string // 検出されたフレーズ（あれば）
}

interface SubtitleEntry {
  id: string
  timestamp: string
  text: string
}

// プロンプトはuseRealtimeAPI内で自動生成されるため、ここでは空文字列
// semantic/context判定のみLLMが担当し、完全一致はフロントエンドで処理
const DEFAULT_PROMPT = ``

// AIヒント生成プロンプトのデフォルト
const DEFAULT_HINT_GENERATION_PROMPT = `検出された内容に応じて、営業マンとして次にやるべきことの適切なヒントを、10文字以内で出して`

const DEFAULT_CONFIGS: PhraseConfig[] = [
  {
    id: 'default-yatan',
    phrase: 'やーたんだ',
    matchType: 'exact',
    hintType: 'fixed',
    hintText: 'たんたんだよ',
    enabled: true,
  },
]

const prompt = useLocalStorage('hintbot-prompt', DEFAULT_PROMPT)
const hintGenerationPrompt = useLocalStorage('hintbot-hint-generation-prompt', DEFAULT_HINT_GENERATION_PROMPT)
const configs = useLocalStorage<PhraseConfig[]>('hintbot-configs', DEFAULT_CONFIGS)

const isSettingsOpen = ref(false)
const logs = ref<LogEntry[]>([])
const subtitles = ref<SubtitleEntry[]>([])

// ヒント表示タイマー（確定後10秒で非表示）
let hintDisplayTimer: ReturnType<typeof setTimeout> | null = null

const {
  isConnected,
  isSpeaking,
  audioMetadata,
  hintState,
  toggleRoleplay,
  setRegisteredPhrases,
  resetPhraseDetections,
  onAIResponse,
  onHintConfirmed,
  onTranscript,
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
  if (logs.value.length > 100) {
    logs.value.pop()
  }
}

// ログコールバック
onLog.value = (step: string) => {
  addLog('step', step)
}

// ヒント確定時のコールバック
onHintConfirmed.value = (hintText: string) => {
  addLog('hint', `ヒント確定「${hintText}」`)

  // 既存のタイマーをクリア
  if (hintDisplayTimer) {
    clearTimeout(hintDisplayTimer)
  }

  // 10秒後にヒント状態をリセット（useRealtimeAPIのresetHintを呼ぶ必要があるが、
  // ここでは表示のみを制御）
  hintDisplayTimer = setTimeout(() => {
    // hintStateはuseRealtimeAPI内で管理されているので、
    // 次の検出まで表示を維持するか、手動でリセットする必要がある
  }, 10000)
}

onAIResponse.value = null

// 文字起こしコールバック（検出されたフレーズ情報を含む）
let lastDetectedPhrase: string | null = null

onPhraseDetected.value = (phrase: string) => {
  lastDetectedPhrase = phrase
}

onTranscript.value = (transcript: string, isFinal: boolean) => {
  // 文字起こしログを追加（最新5件のみ表示されるので、全件追加してOK）
  logs.value.unshift({
    timestamp: formatTimeWithMs(new Date()),
    type: 'transcript',
    message: transcript,
    matchedPhrase: lastDetectedPhrase || undefined,
  })

  // 確定した文字起こしのみ字幕に追加（重複防止）
  if (isFinal && transcript.trim()) {
    subtitles.value.push({
      id: crypto.randomUUID(),
      timestamp: formatTimeWithMs(new Date()),
      text: transcript,
    })
  }

  // 検出フレーズをリセット（次の文字起こしに備える）
  if (isFinal) {
    lastDetectedPhrase = null
  }

  // ログが多すぎる場合は古いものを削除
  if (logs.value.length > 100) {
    logs.value.pop()
  }
}

onError.value = (error: string) => {
  console.error('Error:', error)
  addLog('step', `[ERROR] ${error}`)
}

watch(configs, (newConfigs) => {
  setRegisteredPhrases(newConfigs)
}, { immediate: true })

async function handleToggle() {
  if (!isConnected.value) {
    resetPhraseDetections()
    logs.value = []
    subtitles.value = []
  }
  await toggleRoleplay({
    instructions: prompt.value,
    commitIntervalMs: 300, // 小刻みcommit間隔
    debounceMs: 1500, // 連続発火抑止時間
    confirmDelayMs: 800, // 仮判定→確定までの待機時間
    hintGenerationPrompt: hintGenerationPrompt.value,
    getConversationHistory: () => subtitles.value.map(s => s.text),
  })
}

function handleUpdatePrompt(newPrompt: string) {
  prompt.value = newPrompt
}

function handleUpdateHintGenerationPrompt(newPrompt: string) {
  hintGenerationPrompt.value = newPrompt
}

function handleUpdateConfigs(newConfigs: PhraseConfig[]) {
  configs.value = newConfigs
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50">
    <!-- ロゴ（一番上） -->
    <div class="flex justify-center border-b border-slate-200 bg-white py-4">
      <img
        :src="logoImage"
        alt="HintBot"
        class="h-10"
      >
    </div>

    <!-- ヒント・字幕・ステータス（3列横並び） -->
    <div class="flex gap-4 border-b border-slate-200 bg-white p-4">
      <div class="w-80 flex-shrink-0">
        <HintBox
          :hint-text="hintState.hintText"
          :hint-status="hintState.status"
          :is-speaking="isSpeaking"
          :is-listening="isConnected"
        />
      </div>
      <div class="flex-1">
        <SubtitleWindow :subtitles="subtitles" />
      </div>
      <div class="w-80 flex-shrink-0">
        <MetadataPanel
          :metadata="audioMetadata"
          :is-active="isConnected"
          :logs="logs"
        />
      </div>
    </div>

    <!-- 開始ボタンと設定ボタン（横並び） -->
    <div class="flex justify-center gap-4 border-b border-slate-200 bg-white py-4">
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
        variant="outline"
        size="lg"
        @click="isSettingsOpen = true"
      >
        <UIcon name="lucide:settings" class="mr-2 h-5 w-5" />
        設定
      </UButton>
    </div>

    <!-- 判定リスト（一番下） -->
    <div class="flex-1 p-6">
      <HintConfigTable
        :configs="configs"
        @update:configs="handleUpdateConfigs"
      />
    </div>

    <SettingsPopup
      v-model="isSettingsOpen"
      :prompt="prompt"
      :hint-generation-prompt="hintGenerationPrompt"
      @update:prompt="handleUpdatePrompt"
      @update:hint-generation-prompt="handleUpdateHintGenerationPrompt"
    />
  </div>
</template>

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

// モード定義
interface Mode {
  id: string
  name: string
  hintGenerationPrompt: string
  configs: PhraseConfig[]
}

// モードプリセット
const MODE_PRESETS: Mode[] = [
  {
    id: 'naretore',
    name: 'サービス紹介',
    hintGenerationPrompt: '検出された内容に応じて、ナレトレのサービス紹介として適切なヒントを、10文字以内で出して',
    configs: [
      // フローステータス（順番通りに進むステータス）
      {
        id: 'naretore-company',
        phrase: '会社概要',
        description: '挨拶をして会社の概要について話す',
        statusType: 'flow',
        hintType: 'fixed',
        hintText: '簡潔に',
        enabled: true,
      },
      {
        id: 'naretore-feature',
        phrase: 'サービスの機能',
        description: 'サービスの概要について話す',
        statusType: 'flow',
        hintType: 'fixed',
        hintText: 'サービスの利用目的を明確に',
        enabled: true,
      },
      {
        id: 'naretore-price',
        phrase: '価格の話',
        description: '価格テーブルについて説明する',
        statusType: 'flow',
        hintType: 'fixed',
        hintText: '定価だけ話す',
        enabled: true,
      },
      // スポットステータス（突発的に発生するステータス）
      {
        id: 'naretore-competitor',
        phrase: '競合比較',
        description: '競合他社との比較について質問された',
        statusType: 'spot',
        hintType: 'fixed',
        hintText: 'トレーニングだけでなく実践の場での支援に使うことも可能です。',
        enabled: true,
      },
      {
        id: 'naretore-guide-dog',
        phrase: '盲導犬',
        description: '盲導犬について話している',
        statusType: 'spot',
        hintType: 'fixed',
        hintText: '盲導犬は、視覚障害の方の安全で快適な歩行をサポートします。白または黄色のハーネスをつけています。',
        enabled: true,
      },
    ],
  },
]

// プロンプトはuseRealtimeAPI内で自動生成されるため、ここでは空文字列
const DEFAULT_PROMPT = ``

// 現在選択中のモードID
const selectedModeId = useLocalStorage('hintbot-mode', 'naretore')

// モード選択オプション
const modeOptions = MODE_PRESETS.map(mode => ({
  label: mode.name,
  value: mode.id,
}))

// デフォルト値を取得
const getDefaultHintPrompt = () => {
  const mode = MODE_PRESETS.find(m => m.id === selectedModeId.value)
  return mode?.hintGenerationPrompt ?? '検出された内容に応じて、適切なヒントを10文字以内で出して'
}

const getDefaultConfigs = () => {
  const mode = MODE_PRESETS.find(m => m.id === selectedModeId.value)
  return mode?.configs ?? []
}

const prompt = useLocalStorage('hintbot-prompt', DEFAULT_PROMPT)
const hintGenerationPrompt = useLocalStorage('hintbot-hint-generation-prompt', getDefaultHintPrompt())
const configs = useLocalStorage<PhraseConfig[]>('hintbot-configs', getDefaultConfigs())

// LocalStorageの古いデータをマイグレーション（statusTypeがない場合はプリセットをリセット）
if (configs.value.length > 0 && configs.value.some(c => !c.statusType)) {
  const mode = MODE_PRESETS.find(m => m.id === selectedModeId.value)
  if (mode) {
    configs.value = JSON.parse(JSON.stringify(mode.configs))
  }
}

// モード変更時の処理
watch(selectedModeId, (newModeId) => {
  const mode = MODE_PRESETS.find(m => m.id === newModeId)
  if (mode) {
    hintGenerationPrompt.value = mode.hintGenerationPrompt
    // カスタムモード以外はプリセットを適用
    if (newModeId !== 'custom') {
      configs.value = JSON.parse(JSON.stringify(mode.configs))
    }
  }
})

const isSettingsOpen = ref(false)
const logs = ref<LogEntry[]>([])
const subtitles = ref<SubtitleEntry[]>([])

// 過去に判定されたステータスのインデックスを追跡
const detectedIndices = ref<Set<number>>(new Set())

// ヒント表示タイマー（確定後10秒で非表示）
let hintDisplayTimer: ReturnType<typeof setTimeout> | null = null

const {
  isConnected,
  isSpeaking,
  audioMetadata,
  hintState,
  currentStatus,
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

// currentStatusの変化を監視して、判定されたインデックスを記録
watch(() => currentStatus.value.index, (newIndex) => {
  if (newIndex >= 0) {
    detectedIndices.value = new Set([...detectedIndices.value, newIndex])
  }
})

async function handleToggle() {
  if (!isConnected.value) {
    resetPhraseDetections()
    logs.value = []
    subtitles.value = []
    detectedIndices.value = new Set()
  }
  await toggleRoleplay({
    instructions: prompt.value,
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
  <div class="flex min-h-screen flex-col bg-white">
    <!-- ロゴ -->
    <div class="flex justify-center bg-white py-3">
      <img
        :src="logoImage"
        alt="HintBot"
        class="h-8"
      >
    </div>

    <!-- メインコントロールエリア（ヒント＋コントロールバー | ステータスリスト） -->
    <div class="flex justify-center gap-4 bg-white py-3">
      <!-- 左列: ヒントウィンドウ + コントロールバー -->
      <div class="flex w-96 flex-col gap-3">
        <!-- ヒントウィンドウ -->
        <HintBox
          :hint-text="hintState.hintText"
          :hint-status="hintState.status"
          :status-name="hintState.statusName"
          :is-speaking="isSpeaking"
          :is-listening="isConnected"
        />
        <!-- コントロールバー -->
        <div class="flex items-center gap-2">
          <!-- 再生/停止ボタン -->
          <UButton
            :color="isConnected ? 'error' : 'primary'"
            size="sm"
            @click="handleToggle"
          >
            <UIcon
              :name="isConnected ? 'lucide:square' : 'lucide:play'"
              class="h-4 w-4"
            />
          </UButton>

          <!-- モード選択 -->
          <USelect
            v-model="selectedModeId"
            :items="modeOptions"
            value-key="value"
            size="sm"
            class="flex-1"
            :disabled="isConnected"
          />

          <!-- 設定ボタン -->
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            @click="isSettingsOpen = true"
          >
            <UIcon name="lucide:settings" class="h-4 w-4" />
          </UButton>
        </div>
      </div>

      <!-- 右列: ステータスリスト -->
      <div class="flex w-40 flex-col overflow-hidden rounded-lg border border-slate-300">
        <div class="max-h-40 overflow-y-auto p-2">
          <StatusProgress
            :configs="configs"
            :current-index="currentStatus.index"
            :detected-indices="detectedIndices"
            :spot-name="currentStatus.spotName"
          />
        </div>
      </div>
    </div>

    <!-- 詳細コンポーネント -->
    <DetailPanel
      :subtitles="subtitles"
      :logs="logs"
      :configs="configs"
      :current-status="currentStatus"
      :audio-metadata="audioMetadata"
      :is-connected="isConnected"
      @update:configs="handleUpdateConfigs"
    />

    <SettingsPopup
      v-model="isSettingsOpen"
      :prompt="prompt"
      :hint-generation-prompt="hintGenerationPrompt"
      @update:prompt="handleUpdatePrompt"
      @update:hint-generation-prompt="handleUpdateHintGenerationPrompt"
    />
  </div>
</template>

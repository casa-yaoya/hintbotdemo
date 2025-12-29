<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'
import { DEFAULT_MODELS } from '~/composables/useRealtimeAPI'
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
      // トピック判定（会話の文脈からトピックを判定）
      {
        id: 'naretore-company',
        phrase: '会社概要',
        description: '挨拶をして会社の概要について話す',
        detectionType: 'topic',
        hintType: 'fixed',
        hintText: '簡潔に',
        enabled: true,
      },
      {
        id: 'naretore-feature',
        phrase: 'サービスの機能',
        description: 'サービスの概要について話す',
        detectionType: 'topic',
        hintType: 'fixed',
        hintText: 'サービスの利用目的を明確に',
        enabled: true,
      },
      {
        id: 'naretore-price',
        phrase: '価格の話',
        description: '価格テーブルについて説明する',
        detectionType: 'topic',
        hintType: 'fixed',
        hintText: '定価だけ話す',
        enabled: true,
      },
      // フレーズ判定（特定のフレーズを検出したらヒントを出す）
      {
        id: 'naretore-competitor',
        phrase: '競合比較',
        description: '競合他社との比較について質問された',
        detectionType: 'phrase',
        hintType: 'fixed',
        hintText: 'トレーニングだけでなく実践の場での支援に使うことも可能です。',
        enabled: true,
      },
      {
        id: 'naretore-guide-dog',
        phrase: '盲導犬',
        description: '盲導犬について話している',
        detectionType: 'phrase',
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

// モデル設定
const transcribeModel = useLocalStorage('hintbot-transcribe-model', DEFAULT_MODELS.transcribe)
const topicDetectionModel = useLocalStorage('hintbot-topic-detection-model', DEFAULT_MODELS.topicDetection)

// LocalStorageの古いデータをマイグレーション（detectionTypeがない場合はプリセットをリセット）
if (configs.value.length > 0 && configs.value.some(c => !c.detectionType)) {
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
const isDevPanelExpanded = ref(true)
const isConfigPanelExpanded = ref(false)
const logs = ref<LogEntry[]>([])
const subtitles = ref<SubtitleEntry[]>([])

// 過去に判定されたトピックを追跡
const detectedTopics = ref<Set<string>>(new Set())

// ヒント表示タイマー（確定後10秒で非表示）
let hintDisplayTimer: ReturnType<typeof setTimeout> | null = null

const {
  isConnected,
  isSpeaking,
  audioMetadata,
  hintState,
  currentStatus,
  tokenLogs,
  toggleRoleplay,
  setRegisteredPhrases,
  resetPhraseDetections,
  resetTokenLogs,
  getTotalTokenCost,
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

// currentStatusの変化を監視して、判定されたトピックを記録
watch(() => currentStatus.value.topicName, (newTopicName) => {
  if (newTopicName) {
    detectedTopics.value = new Set([...detectedTopics.value, newTopicName])
  }
})

// 合計コスト表示用
const showCostSummary = ref(false)
const costSummary = ref<{ totalCost: number, breakdown: Record<string, number> } | null>(null)

// USD→JPY換算レート
const USD_TO_JPY = 160

// コストを日本円でフォーマット
function formatCostJpy(usd: number): string {
  const jpy = usd * USD_TO_JPY
  if (jpy < 0.01) {
    return `¥${jpy.toFixed(4)}`
  }
  return `¥${jpy.toFixed(2)}`
}

async function handleToggle() {
  if (isConnected.value) {
    // 停止時: 合計コストを計算して表示
    const summary = getTotalTokenCost()
    if (summary.totalCost > 0) {
      costSummary.value = summary
      showCostSummary.value = true
    }
  }
  else {
    // 開始時: リセット
    resetPhraseDetections()
    resetTokenLogs()
    logs.value = []
    subtitles.value = []
    detectedTopics.value = new Set()
    showCostSummary.value = false
    costSummary.value = null
  }
  await toggleRoleplay({
    instructions: prompt.value,
    debounceMs: 1500, // 連続発火抑止時間
    confirmDelayMs: 800, // 仮判定→確定までの待機時間
    hintGenerationPrompt: hintGenerationPrompt.value,
    getConversationHistory: () => subtitles.value.map(s => s.text),
    transcribeModel: transcribeModel.value,
    topicDetectionModel: topicDetectionModel.value,
  })
}

function handleUpdatePrompt(newPrompt: string) {
  prompt.value = newPrompt
}

function handleUpdateHintGenerationPrompt(newPrompt: string) {
  hintGenerationPrompt.value = newPrompt
}

function handleUpdateTranscribeModel(newModel: string) {
  transcribeModel.value = newModel
}

function handleUpdateTopicDetectionModel(newModel: string) {
  topicDetectionModel.value = newModel
}

function handleUpdateConfigs(newConfigs: PhraseConfig[]) {
  configs.value = newConfigs
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-100">
    <!-- ========================================
         パート1: ユーザー向けUI（上部）
         ======================================== -->
    <UserPanel
      :logo-image="logoImage"
      :hint-state="hintState"
      :is-speaking="isSpeaking"
      :is-connected="isConnected"
      :configs="configs"
      :current-status="currentStatus"
      :detected-topics="detectedTopics"
      :selected-mode-id="selectedModeId"
      :mode-options="modeOptions"
      :volume="audioMetadata.volume"
      :volume-db="audioMetadata.volumeDb"
      @toggle="handleToggle"
      @update:selected-mode-id="(v) => selectedModeId = v"
      @open-settings="isSettingsOpen = true"
    />

    <!-- ========================================
         パート2: 開発用パート（字幕・ログ等）
         ======================================== -->
    <div class="border-t border-slate-300 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div class="flex items-center gap-2">
          <UIcon name="lucide:code-2" class="h-4 w-4 text-slate-500" />
          <span class="text-sm font-medium text-slate-600">開発者パネル</span>
        </div>
        <button
          class="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          @click="isDevPanelExpanded = !isDevPanelExpanded"
        >
          <span>{{ isDevPanelExpanded ? '閉じる' : '開く' }}</span>
          <UIcon
            :name="isDevPanelExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="h-4 w-4"
          />
        </button>
      </div>
      <div
        class="overflow-hidden transition-all duration-300"
        :class="isDevPanelExpanded ? 'max-h-[500px]' : 'max-h-0'"
      >
        <!-- 字幕・ステータス・ログ・トークン（4列横並び） -->
        <div class="grid grid-cols-4 gap-4 p-4">
          <!-- 字幕ウィンドウ -->
          <div class="flex flex-col">
            <h3 class="mb-2 text-sm font-medium text-slate-600">字幕</h3>
            <SubtitleWindow :subtitles="subtitles" />
          </div>

          <!-- ステータスウィンドウ -->
          <div class="flex flex-col">
            <h3 class="mb-2 text-sm font-medium text-slate-600">内部状態</h3>
            <div class="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div class="space-y-2 text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-slate-500">トピック</span>
                  <span
                    class="font-medium"
                    :class="!currentStatus.topicName ? 'text-slate-400' : 'text-primary-600'"
                  >
                    {{ !currentStatus.topicName ? '未確定' : currentStatus.topicName }}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-500">ボリューム</span>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-16 overflow-hidden rounded-full bg-slate-200">
                      <div
                        class="h-full rounded-full bg-primary-500 transition-all duration-100"
                        :style="{ width: `${Math.round(audioMetadata.volume * 100)}%` }"
                      />
                    </div>
                    <span class="min-w-[2.5rem] text-right text-xs text-slate-600">{{ audioMetadata.volumeDb.toFixed(0) }}dB</span>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-500">状態</span>
                  <span :class="isConnected ? 'text-green-600' : 'text-slate-400'">
                    {{ isConnected ? '接続中' : '未接続' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- ログウィンドウ -->
          <div class="flex flex-col">
            <h3 class="mb-2 text-sm font-medium text-slate-600">ログ</h3>
            <div class="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div class="space-y-1">
                <div
                  v-for="(log, index) in logs.filter(l => l.type !== 'transcript').slice(0, 20)"
                  :key="index"
                  class="flex items-start gap-2 text-xs"
                >
                  <span class="shrink-0 font-mono text-slate-400">{{ log.timestamp }}</span>
                  <span
                    :class="log.type === 'hint' ? 'text-amber-600' : 'text-blue-600'"
                  >
                    {{ log.message }}
                  </span>
                </div>
                <div
                  v-if="logs.filter(l => l.type !== 'transcript').length === 0"
                  class="text-xs text-slate-400"
                >
                  ログなし
                </div>
              </div>
            </div>
          </div>

          <!-- トークンログウィンドウ -->
          <div class="flex flex-col">
            <h3 class="mb-2 text-sm font-medium text-slate-600">トークンログ</h3>
            <TokenLogWindow :logs="tokenLogs" />
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================
         パート3: 判定設定（折りたたみ可能）
         ======================================== -->
    <div class="border-t border-slate-300 bg-slate-50">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div class="flex items-center gap-2">
          <UIcon name="lucide:list-checks" class="h-4 w-4 text-slate-500" />
          <span class="text-sm font-medium text-slate-600">判定設定</span>
        </div>
        <button
          class="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          @click="isConfigPanelExpanded = !isConfigPanelExpanded"
        >
          <span>{{ isConfigPanelExpanded ? '閉じる' : '開く' }}</span>
          <UIcon
            :name="isConfigPanelExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="h-4 w-4"
          />
        </button>
      </div>
      <div
        class="overflow-hidden transition-all duration-300"
        :class="isConfigPanelExpanded ? 'max-h-[600px]' : 'max-h-0'"
      >
        <div class="grid grid-cols-2 gap-4 p-4">
          <!-- トピック判定 -->
          <div>
            <HintConfigTable
              :configs="configs"
              detection-type="topic"
              title="トピック判定"
              @update:configs="handleUpdateConfigs"
            />
          </div>
          <!-- フレーズ判定 -->
          <div>
            <HintConfigTable
              :configs="configs"
              detection-type="phrase"
              title="フレーズ判定"
              @update:configs="handleUpdateConfigs"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 設定ポップアップ -->
    <SettingsPopup
      v-model="isSettingsOpen"
      :prompt="prompt"
      :hint-generation-prompt="hintGenerationPrompt"
      :transcribe-model="transcribeModel"
      :topic-detection-model="topicDetectionModel"
      @update:prompt="handleUpdatePrompt"
      @update:hint-generation-prompt="handleUpdateHintGenerationPrompt"
      @update:transcribe-model="handleUpdateTranscribeModel"
      @update:topic-detection-model="handleUpdateTopicDetectionModel"
    />

    <!-- コストサマリーモーダル -->
    <UModal v-model:open="showCostSummary">
      <template #content>
        <div class="p-6">
          <h3 class="mb-4 text-lg font-semibold text-slate-800">
            API使用量サマリー
          </h3>
          <div v-if="costSummary" class="space-y-3">
            <div class="rounded-lg bg-slate-50 p-4">
              <div class="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                <span class="font-medium text-slate-700">合計コスト</span>
                <span class="text-xl font-bold text-amber-600">
                  {{ formatCostJpy(costSummary.totalCost) }}
                </span>
              </div>
              <div class="space-y-2 text-sm">
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">文字起こし</span>
                  <span class="font-mono text-slate-700">{{ formatCostJpy(costSummary.breakdown['transcribe'] || 0) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">トピック判定</span>
                  <span class="font-mono text-slate-700">{{ formatCostJpy(costSummary.breakdown['topic-detection'] || 0) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">フレーズ判定</span>
                  <span class="font-mono text-slate-700">{{ formatCostJpy(costSummary.breakdown['phrase-detection'] || 0) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">ヒント生成</span>
                  <span class="font-mono text-slate-700">{{ formatCostJpy(costSummary.breakdown['hint-generation'] || 0) }}</span>
                </div>
              </div>
            </div>
            <div class="text-xs text-slate-500">
              ※ Realtime APIのテキストトークンは別途課金されます
            </div>
          </div>
          <div class="mt-4 flex justify-end">
            <UButton color="primary" @click="showCostSummary = false">
              閉じる
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

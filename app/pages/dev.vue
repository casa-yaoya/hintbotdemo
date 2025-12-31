<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'
import { DEFAULT_MODELS } from '~/composables/useRealtimeAPI'
import HintConfigTable from '~/components/HintConfigTable.vue'

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
  configs: PhraseConfig[]
}

// モードプリセット
const MODE_PRESETS: Mode[] = [
  {
    id: 'naretore',
    name: 'サービス紹介',
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

// 判定設定のタブ
const configTab = ref<'topic' | 'phrase'>('topic')

// モード選択オプション
const modeOptions = MODE_PRESETS.map(mode => ({
  label: mode.name,
  value: mode.id,
}))

const getDefaultConfigs = () => {
  const mode = MODE_PRESETS.find(m => m.id === selectedModeId.value)
  return mode?.configs ?? []
}

const prompt = useLocalStorage('hintbot-prompt', DEFAULT_PROMPT)
const configs = ref<PhraseConfig[]>(getDefaultConfigs())

// モデル設定
const transcribeModel = useLocalStorage('hintbot-transcribe-model', DEFAULT_MODELS.transcribe)
const topicDetectionModel = useLocalStorage('hintbot-topic-detection-model', DEFAULT_MODELS.topicDetection)

// Firestoreからヒント設定を読み込み
const { loadSettings } = useHintSettings()
const isLoadingConfigs = ref(true)

async function loadConfigsFromFirestore(modeId: string) {
  isLoadingConfigs.value = true
  try {
    const savedConfigs = await loadSettings(modeId)
    if (savedConfigs && savedConfigs.length > 0) {
      configs.value = savedConfigs
    }
    else {
      // Firestoreにデータがない場合はプリセットを使用
      const mode = MODE_PRESETS.find(m => m.id === modeId)
      if (mode) {
        configs.value = JSON.parse(JSON.stringify(mode.configs))
      }
    }
  }
  catch (error) {
    console.error('Failed to load configs from Firestore:', error)
    // エラー時はプリセットを使用
    const mode = MODE_PRESETS.find(m => m.id === modeId)
    if (mode) {
      configs.value = JSON.parse(JSON.stringify(mode.configs))
    }
  }
  finally {
    isLoadingConfigs.value = false
  }
}

// ページ読み込み時にFirestoreからデータを取得
onMounted(async () => {
  await loadConfigsFromFirestore(selectedModeId.value)
})

// モード変更時の処理
watch(selectedModeId, async (newModeId) => {
  await loadConfigsFromFirestore(newModeId)
})

const isSettingsOpen = ref(false)
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
  toggleRoleplay,
  setRegisteredPhrases,
  resetPhraseDetections,
  getTotalTokenCost,
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
const costSummary = ref<{
  totalCost: number
  breakdown: Record<string, number>
  totalAudioSeconds: number
} | null>(null)

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
    // 停止時: 合計コストを計算して開発者パネルに表示
    const summary = getTotalTokenCost()
    if (summary.totalCost > 0) {
      costSummary.value = summary
    }
  }
  else {
    // 開始時: リセット
    resetPhraseDetections()
    logs.value = []
    subtitles.value = []
    detectedTopics.value = new Set()
    costSummary.value = null
  }
  await toggleRoleplay({
    instructions: prompt.value,
    debounceMs: 1500, // 連続発火抑止時間
    confirmDelayMs: 800, // 仮判定→確定までの待機時間
    getConversationHistory: () => subtitles.value.map(s => s.text),
    transcribeModel: transcribeModel.value,
    topicDetectionModel: topicDetectionModel.value,
  })
}

function handleUpdatePrompt(newPrompt: string) {
  prompt.value = newPrompt
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

// HintConfigTableのref
const topicConfigTable = ref<InstanceType<typeof HintConfigTable> | null>(null)
const phraseConfigTable = ref<InstanceType<typeof HintConfigTable> | null>(null)

// 現在表示中のテーブル
const currentConfigTable = computed(() =>
  configTab.value === 'topic' ? topicConfigTable.value : phraseConfigTable.value,
)
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-100">
    <!-- ロゴヘッダー -->
    <div class="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
      <div class="flex items-end gap-2 cursor-default" @dblclick="navigateTo('/')">
        <img src="~/assets/images/logoa.svg" alt="HintBot" class="h-5">
        <span class="text-sm text-slate-500 leading-none">構築ページ</span>
      </div>
      <NuxtLink to="/" class="text-sm text-slate-500 hover:text-slate-700">
        実行ページへ
      </NuxtLink>
    </div>

    <!-- ========================================
         メインゾーン: 5列パネル構成
         ======================================== -->
    <div class="flex h-[280px] shrink-0 gap-2 p-2">
      <!-- 1. 状態パネル（音量 + 再生/設定ボタン） -->
      <div class="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
        <h3 class="mb-2 text-xs font-medium text-slate-500">状態</h3>
        <GameStatusBox
          :volume="audioMetadata.volume"
          :volume-db="audioMetadata.volumeDb"
          :is-speaking="isSpeaking"
          :is-connected="isConnected"
        />
        <!-- 再生/設定ボタン -->
        <div class="mt-3 flex gap-2">
          <UButton
            :color="isConnected ? 'error' : 'primary'"
            size="sm"
            class="flex-1"
            @click="handleToggle"
          >
            <UIcon
              :name="isConnected ? 'lucide:square' : 'lucide:play'"
              class="h-4 w-4"
            />
          </UButton>
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

      <!-- 2. ヒントパネル -->
      <div class="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
        <h3 class="mb-2 text-xs font-medium text-slate-500">ヒント</h3>
        <HintBox
          :hint-text="hintState.hintText"
          :hint-status="hintState.status"
          :status-name="hintState.statusName"
          :is-speaking="isSpeaking"
          :is-listening="isConnected"
        />
      </div>

      <!-- 3. 判定パネル（モード選択 + トピック/フレーズ表示） -->
      <div class="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
        <h3 class="mb-2 text-xs font-medium text-slate-500">判定</h3>
        <!-- モード選択 -->
        <USelect
          v-model="selectedModeId"
          :items="modeOptions"
          value-key="value"
          size="xs"
          class="mb-2"
          :disabled="isConnected"
        />
        <!-- 判定状態表示 -->
        <StatusProgress
          :configs="configs"
          :topic-name="currentStatus.topicName"
          :detected-topics="detectedTopics"
          :phrase-name="currentStatus.phraseName"
        />
      </div>

      <!-- 4. 字幕パネル -->
      <div class="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
        <h3 class="mb-2 text-xs font-medium text-slate-500">字幕</h3>
        <SubtitleWindow :subtitles="subtitles" class="flex-1" />
      </div>

      <!-- 5. ログパネル -->
      <div class="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
        <h3 class="mb-2 text-xs font-medium text-slate-500">ログ</h3>
        <div class="flex-1 overflow-y-auto text-xs">
          <div class="space-y-1">
            <div
              v-for="(log, index) in logs.filter(l => l.type !== 'transcript').slice(0, 30)"
              :key="index"
              class="flex items-start gap-1"
            >
              <span class="shrink-0 font-mono text-[10px] text-slate-400">{{ log.timestamp.slice(-8) }}</span>
              <span
                :class="log.type === 'hint' ? 'text-amber-600' : 'text-blue-600'"
                class="break-all"
              >
                {{ log.message }}
              </span>
            </div>
            <!-- コストサマリー（停止後に表示） -->
            <div v-if="costSummary" class="mt-3 border-t border-slate-200 pt-2">
              <div class="mb-1 text-[10px] font-medium text-slate-500">コストサマリー</div>
              <div class="space-y-0.5 text-[10px]">
                <div class="flex justify-between">
                  <span class="text-slate-500">録音時間</span>
                  <span class="font-mono text-slate-600">{{ Math.floor(costSummary.totalAudioSeconds / 60) }}分{{ Math.floor(costSummary.totalAudioSeconds % 60) }}秒</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">合計</span>
                  <span class="font-mono font-medium text-amber-600">{{ formatCostJpy(costSummary.totalCost) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">1時間換算</span>
                  <span class="font-mono text-blue-600">{{ formatCostJpy(costSummary.totalCost * (3600 / costSummary.totalAudioSeconds)) }}</span>
                </div>
              </div>
            </div>
            <div
              v-if="logs.filter(l => l.type !== 'transcript').length === 0 && !costSummary"
              class="text-slate-400"
            >
              ログなし
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================
         トリガー＆ヒント設定パネル
         ======================================== -->
    <div class="border-t border-slate-300 bg-white">
      <!-- ヘッダー: タイトル + タブ + 操作ボタン -->
      <div class="flex items-center gap-3 border-b border-slate-200 px-3 py-1.5">
        <span class="text-xs font-medium text-slate-500">トリガー＆ヒント</span>
        <div class="flex gap-0.5 rounded bg-slate-100 p-0.5">
          <button
            class="rounded px-3 py-1 text-xs font-medium transition-colors"
            :class="configTab === 'topic' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="configTab = 'topic'"
          >
            トピック
          </button>
          <button
            class="rounded px-3 py-1 text-xs font-medium transition-colors"
            :class="configTab === 'phrase' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="configTab = 'phrase'"
          >
            フレーズ
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-slate-400">{{ currentConfigTable?.configCount ?? 0 }}件</span>
          <button
            class="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            @click="currentConfigTable?.startAdding()"
          >
            <UIcon name="lucide:plus" class="h-3 w-3" />
            追加
          </button>
          <button
            class="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            @click="currentConfigTable?.triggerFileInput()"
          >
            <UIcon name="lucide:download" class="h-3 w-3" />
            CSV
          </button>
          <button
            class="flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-2 py-1 text-[11px] text-purple-600 hover:bg-purple-100 disabled:opacity-50"
            :disabled="currentConfigTable?.isGenerating"
            @click="currentConfigTable?.openAiDialog()"
          >
            <UIcon name="lucide:sparkles" class="h-3 w-3" />
            AI生成
          </button>
          <button
            class="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-[11px] text-white hover:bg-blue-600 disabled:opacity-50"
            :disabled="currentConfigTable?.isSaving"
            @click="currentConfigTable?.handleSaveToCloud()"
          >
            <UIcon name="lucide:cloud-upload" class="h-3 w-3" />
            保存
          </button>
        </div>
      </div>
      <!-- タブ内容 -->
      <div class="p-3">
        <HintConfigTable
          v-if="configTab === 'topic'"
          ref="topicConfigTable"
          :configs="configs"
          :mode-id="selectedModeId"
          detection-type="topic"
          @update:configs="handleUpdateConfigs"
        />
        <HintConfigTable
          v-if="configTab === 'phrase'"
          ref="phraseConfigTable"
          :configs="configs"
          :mode-id="selectedModeId"
          detection-type="phrase"
          @update:configs="handleUpdateConfigs"
        />
      </div>
    </div>

    <!-- 設定ポップアップ -->
    <SettingsPopup
      v-model="isSettingsOpen"
      :prompt="prompt"
      :transcribe-model="transcribeModel"
      :topic-detection-model="topicDetectionModel"
      @update:prompt="handleUpdatePrompt"
      @update:transcribe-model="handleUpdateTranscribeModel"
      @update:topic-detection-model="handleUpdateTopicDetectionModel"
    />

  </div>
</template>

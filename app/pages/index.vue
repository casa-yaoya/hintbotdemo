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
    name: 'ナレトレのサービス紹介',
    hintGenerationPrompt: '検出された内容に応じて、ナレトレのサービス紹介として適切なヒントを、10文字以内で出して',
    configs: [
      {
        id: 'naretore-company',
        phrase: '会社概要',
        description: '挨拶をして会社の概要について話す',
        hintType: 'fixed',
        hintText: '簡潔に',
        enabled: true,
      },
      {
        id: 'naretore-feature',
        phrase: 'サービスの機能',
        description: 'サービスの概要について話す',
        hintType: 'fixed',
        hintText: 'サービスの利用目的を明確に',
        enabled: true,
      },
      {
        id: 'naretore-price',
        phrase: '価格の話',
        description: '価格テーブルについて説明する',
        hintType: 'fixed',
        hintText: '定価だけ話す',
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
    <!-- ロゴ -->
    <div class="flex justify-center bg-white py-3">
      <img
        :src="logoImage"
        alt="HintBot"
        class="h-8"
      >
    </div>

    <!-- ヒントウィンドウ（横長・中央配置） -->
    <div class="flex justify-center bg-white py-2">
      <div class="w-96">
        <HintBox
          :hint-text="hintState.hintText"
          :hint-status="hintState.status"
          :status-name="hintState.statusName"
          :is-speaking="isSpeaking"
          :is-listening="isConnected"
        />
      </div>
    </div>

    <!-- コントロールバー（再生ボタン、モード選択、設定ボタン） -->
    <div class="flex justify-center border-b border-slate-200 bg-white pb-4">
      <div class="flex w-96 items-center gap-2">
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

    <!-- 字幕・ステータス・ログ（3列横並び） -->
    <div class="grid grid-cols-3 gap-4 border-b border-slate-200 bg-white p-4">
      <!-- 字幕ウィンドウ -->
      <div class="flex flex-col">
        <h3 class="mb-2 text-sm font-medium text-slate-600">字幕</h3>
        <div class="flex-1">
          <SubtitleWindow :subtitles="subtitles" />
        </div>
      </div>

      <!-- ステータスウィンドウ -->
      <div class="flex flex-col">
        <h3 class="mb-2 text-sm font-medium text-slate-600">現在のステータス</h3>
        <div class="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="space-y-2 text-sm">
            <!-- 現在の会話ステータス -->
            <div class="flex items-center justify-between">
              <span class="text-slate-500">会話ステータス</span>
              <span
                class="font-medium"
                :class="currentStatus.index === -1 ? 'text-slate-400' : 'text-primary-600'"
              >
                {{ currentStatus.index === -1 ? '待機中' : `${currentStatus.index + 1}. ${currentStatus.name}` }}
              </span>
            </div>
            <!-- ステータス進行バー -->
            <div class="flex items-center gap-1">
              <template v-for="(config, idx) in configs.filter(c => c.enabled)" :key="config.id">
                <div
                  class="h-2 flex-1 rounded-full transition-all duration-300"
                  :class="idx <= currentStatus.index ? 'bg-primary-500' : 'bg-slate-200'"
                />
              </template>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">ボリューム</span>
              <div class="flex items-center gap-2">
                <div class="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                  <div
                    class="h-full rounded-full bg-primary-500 transition-all duration-100"
                    :style="{ width: `${Math.round(audioMetadata.volume * 100)}%` }"
                  />
                </div>
                <span class="min-w-[3rem] text-right text-xs text-slate-600">{{ audioMetadata.volumeDb.toFixed(1) }} dB</span>
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
    </div>

    <!-- 検出対象リスト -->
    <div class="flex-1 p-4">
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

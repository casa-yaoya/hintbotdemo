<script setup lang="ts">
import type { PhraseConfig } from '~/composables/useRealtimeAPI'
import { DEFAULT_MODELS } from '~/composables/useRealtimeAPI'

interface SubtitleEntry {
  id: string
  timestamp: string
  text: string
}

// モード定義
interface Mode {
  id: string
  name: string
}

// モードプリセット（Firestoreのモードと連動）
const MODE_PRESETS: Mode[] = [
  { id: 'naretore', name: 'サービス紹介' },
]

// LocalStorageから設定を読み込み
const prompt = useLocalStorage('hintbot-prompt', '')
const selectedModeId = useLocalStorage('hintbot-mode', 'naretore')
const isModeMenuOpen = ref(false)

const currentMode = computed((): Mode => {
  const found = MODE_PRESETS.find(m => m.id === selectedModeId.value)
  return found ?? MODE_PRESETS[0]!
})

function selectMode(mode: Mode) {
  selectedModeId.value = mode.id
  isModeMenuOpen.value = false
}

// ヒント設定はFirestoreから読み込む
const configs = ref<PhraseConfig[]>([])
const { loadSettings } = useHintSettings()

// ロード状態とエラー状態
const isLoadingConfigs = ref(true)
const loadError = ref<string | null>(null)

// 選択中のモードからヒント設定を読み込む
async function loadConfigsForMode(modeId: string) {
  isLoadingConfigs.value = true
  loadError.value = null
  try {
    console.log('[index] Loading configs for mode:', modeId)
    const savedConfigs = await loadSettings(modeId)
    console.log('[index] Loaded configs:', savedConfigs?.length ?? 0, 'items')
    if (savedConfigs && savedConfigs.length > 0) {
      configs.value = savedConfigs
    }
    else {
      // Firestoreにデータがない場合はエラー表示
      console.warn('[index] No configs found in Firestore')
      loadError.value = 'データがロードできません'
      configs.value = []
    }
  }
  catch (error) {
    console.error('[index] Failed to load configs from Firestore:', error)
    loadError.value = 'データがロードできません'
    configs.value = []
  }
  finally {
    isLoadingConfigs.value = false
  }
}

// ページ読み込み時にFirestoreからデータを取得
onMounted(async () => {
  await loadConfigsForMode(selectedModeId.value)
})

// モード変更時にヒント設定を再読み込み
watch(selectedModeId, async (newModeId) => {
  await loadConfigsForMode(newModeId)
})

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
  // ロード中は何もしない
  if (isLoadingConfigs.value) {
    console.log('[index] Still loading configs, please wait...')
    return
  }

  // configsが空の場合は警告
  if (configs.value.length === 0) {
    console.warn('[index] No configs loaded, hints will not work')
  }
  else {
    console.log('[index] Starting with', configs.value.length, 'configs')
  }

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
    <!-- ロゴ -->
    <div class="mb-2 sm:mb-4">
      <img src="~/assets/images/logoa.svg" alt="HintBot" class="h-6 sm:h-7 mx-auto">
    </div>

    <!-- ヒント表示エリア -->
    <div class="flex-1 w-full max-w-2xl sm:h-[300px] sm:flex-none">
      <HintBox
        :hint-text="hintState.hintText"
        :hint-status="hintState.status"
        :status-name="hintState.statusName"
        :is-speaking="isSpeaking"
        :is-listening="isConnected"
        :error-message="loadError"
        class="text-lg sm:text-2xl"
      />
    </div>

    <!-- コントロール -->
    <div class="flex shrink-0 items-center justify-center gap-3 py-4 sm:mt-6 sm:py-0">
      <!-- 再生/停止ボタン -->
      <button
        class="flex h-14 w-14 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 shadow-lg"
        :class="isConnected ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-violet-500 hover:bg-violet-600 shadow-violet-500/30'"
        :disabled="!!loadError"
        @click="handleToggle"
      >
        <UIcon
          :name="isConnected ? 'lucide:square' : 'lucide:play'"
          class="h-7 w-7 text-white sm:h-6 sm:w-6"
        />
      </button>

      <!-- モード選択プルダウン -->
      <div class="relative z-10">
        <!-- オーバーレイ（メニュー外クリックで閉じる） -->
        <div
          v-if="isModeMenuOpen"
          class="fixed inset-0"
          @click="isModeMenuOpen = false"
        />

        <button
          class="relative flex h-12 items-center gap-2 rounded-full bg-white px-4 text-slate-700 shadow-md ring-1 ring-slate-200 transition-all hover:bg-slate-50 active:scale-95 sm:h-10 sm:px-3"
          :class="{ 'ring-2 ring-violet-400': isModeMenuOpen }"
          @click="isModeMenuOpen = !isModeMenuOpen"
        >
          <span class="text-sm font-medium sm:text-xs">{{ currentMode.name }}</span>
          <UIcon
            name="lucide:chevron-down"
            class="h-4 w-4 text-slate-400 transition-transform sm:h-3 sm:w-3"
            :class="{ 'rotate-180': isModeMenuOpen }"
          />
        </button>

        <!-- ドロップダウンメニュー -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95 translate-y-2"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 translate-y-2"
        >
          <div
            v-if="isModeMenuOpen"
            class="absolute top-full left-0 z-20 mt-2 min-w-[140px] overflow-hidden rounded-xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200 sm:left-auto sm:right-0"
          >
            <div class="p-1">
              <button
                v-for="mode in MODE_PRESETS"
                :key="mode.id"
                class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors"
                :class="selectedModeId === mode.id ? 'bg-violet-50 text-violet-700' : 'text-slate-700 hover:bg-slate-50'"
                @click="selectMode(mode)"
              >
                <span class="text-sm font-medium">{{ mode.name }}</span>
                <UIcon
                  v-if="selectedModeId === mode.id"
                  name="lucide:check"
                  class="h-4 w-4 text-violet-500"
                />
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

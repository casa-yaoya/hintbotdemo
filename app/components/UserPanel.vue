<script setup lang="ts">
import type { PhraseConfig, HintState, CurrentStatus } from '~/composables/useRealtimeAPI'

interface Props {
  logoImage: string
  hintState: HintState
  isSpeaking: boolean
  isConnected: boolean
  configs: PhraseConfig[]
  currentStatus: CurrentStatus
  detectedTopics: Set<string>
  selectedModeId: string
  modeOptions: { label: string, value: string }[]
  volume: number
  volumeDb: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'toggle': []
  'update:selectedModeId': [value: string]
  'openSettings': []
}>()

// v-modelを使うための内部変数
const selectedMode = computed({
  get: () => props.selectedModeId,
  set: (value) => emit('update:selectedModeId', value),
})
</script>

<template>
  <div class="bg-gradient-to-b from-slate-50 to-white">
    <!-- ========== PC版レイアウト ========== -->
    <div class="hidden md:block">
      <!-- ヘッダー（ロゴ） -->
      <div class="flex justify-center py-4">
        <img
          :src="logoImage"
          alt="HintBot"
          class="h-8"
        >
      </div>

      <!-- メインコントロールエリア -->
      <div class="flex justify-center gap-4 px-4 pb-4">
        <!-- 左列: 音声モニター -->
        <div class="w-44">
          <GameStatusBox
            :volume="volume"
            :volume-db="volumeDb"
            :is-speaking="isSpeaking"
            :is-connected="isConnected"
          />
        </div>

        <!-- 中央: ヒントウィンドウ + コントロール -->
        <div class="flex w-96 flex-col gap-3">
          <HintBox
            :hint-text="hintState.hintText"
            :hint-status="hintState.status"
            :status-name="hintState.statusName"
            :is-speaking="isSpeaking"
            :is-listening="isConnected"
          />
          <!-- コントロールバー -->
          <div class="flex items-center gap-2">
            <UButton
              :color="isConnected ? 'error' : 'primary'"
              size="sm"
              @click="emit('toggle')"
            >
              <UIcon
                :name="isConnected ? 'lucide:square' : 'lucide:play'"
                class="h-4 w-4"
              />
            </UButton>

            <USelect
              v-model="selectedMode"
              :items="modeOptions"
              value-key="value"
              size="sm"
              class="flex-1"
              :disabled="isConnected"
            />

            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              @click="emit('openSettings')"
            >
              <UIcon name="lucide:settings" class="h-4 w-4" />
            </UButton>
          </div>
        </div>

        <!-- 右列: トピック進行リスト -->
        <div class="w-44">
          <StatusProgress
            :configs="configs"
            :topic-name="currentStatus.topicName"
            :detected-topics="detectedTopics"
            :phrase-name="currentStatus.phraseName"
          />
        </div>
      </div>
    </div>

    <!-- ========== スマホ版レイアウト ========== -->
    <div class="block md:hidden">
      <div class="flex flex-col gap-3 px-3 py-3">
        <!-- 1. ヒントウィンドウ -->
        <HintBox
          :hint-text="hintState.hintText"
          :hint-status="hintState.status"
          :status-name="hintState.statusName"
          :is-speaking="isSpeaking"
          :is-listening="isConnected"
          layout="horizontal"
        />

        <!-- 2. 判定ウィンドウ（トピック進行） -->
        <StatusProgress
          :configs="configs"
          :topic-name="currentStatus.topicName"
          :detected-topics="detectedTopics"
          :phrase-name="currentStatus.phraseName"
        />

        <!-- 3. 状態＋音量バーを横並びに -->
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <MobileStatusBar
              :volume="volume"
              :volume-db="volumeDb"
              :is-speaking="isSpeaking"
              :is-connected="isConnected"
            />
          </div>
          <!-- 開始/停止ボタン -->
          <UButton
            :color="isConnected ? 'error' : 'primary'"
            size="lg"
            class="shrink-0"
            @click="emit('toggle')"
          >
            <UIcon
              :name="isConnected ? 'lucide:square' : 'lucide:play'"
              class="h-5 w-5"
            />
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MODEL_OPTIONS, DEFAULT_MODELS } from '~/composables/useRealtimeAPI'

interface Props {
  modelValue: boolean
  prompt: string
  hintGenerationPrompt: string
  transcribeModel: string
  topicDetectionModel: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:prompt': [value: string]
  'update:hintGenerationPrompt': [value: string]
  'update:transcribeModel': [value: string]
  'update:topicDetectionModel': [value: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const localPrompt = ref(props.prompt)
const localHintGenerationPrompt = ref(props.hintGenerationPrompt)
const localTranscribeModel = ref(props.transcribeModel)
const localTopicDetectionModel = ref(props.topicDetectionModel)

watch(() => props.prompt, (val: string) => {
  localPrompt.value = val
})

watch(() => props.hintGenerationPrompt, (val: string) => {
  localHintGenerationPrompt.value = val
})

watch(() => props.transcribeModel, (val: string) => {
  localTranscribeModel.value = val
})

watch(() => props.topicDetectionModel, (val: string) => {
  localTopicDetectionModel.value = val
})

// モデル選択オプション
const transcribeModelOptions = MODEL_OPTIONS.transcribe
const topicDetectionModelOptions = MODEL_OPTIONS.topicDetection

function handleSave() {
  emit('update:prompt', localPrompt.value)
  emit('update:hintGenerationPrompt', localHintGenerationPrompt.value)
  emit('update:transcribeModel', localTranscribeModel.value)
  emit('update:topicDetectionModel', localTopicDetectionModel.value)
  isOpen.value = false
}

function handleCancel() {
  localPrompt.value = props.prompt
  localHintGenerationPrompt.value = props.hintGenerationPrompt
  localTranscribeModel.value = props.transcribeModel
  localTopicDetectionModel.value = props.topicDetectionModel
  isOpen.value = false
}
</script>

<template>
  <UModal :open="isOpen" @update:open="isOpen = $event">
    <template #content>
      <div class="p-6">
        <h2 class="mb-6 text-lg font-semibold text-slate-800">
          指示設定
        </h2>

        <div class="mb-6">
          <label class="mb-2 block text-sm font-medium text-slate-700">
            AIへの指示プロンプト
          </label>
          <p class="mb-3 text-xs text-slate-500">
            音声分析AIに対する基本的な指示を設定します。検出対象やヒントの設定はメイン画面のテーブルで行ってください。
          </p>
          <UTextarea
            v-model="localPrompt"
            :rows="4"
            placeholder="あなたは音声分析のエキスパートです。ユーザーの会話を聞いて、登録された内容（意味）を検出してください。内容を検出したら detect_phrase 関数を呼び出してください。"
            class="w-full"
          />
        </div>

        <div class="mb-6">
          <label class="mb-2 block text-sm font-medium text-slate-700">
            AIヒント生成プロンプト
          </label>
          <p class="mb-3 text-xs text-slate-500">
            「AIヒント」タイプの設定で、検出時にAIがヒントを生成するためのプロンプトです。
          </p>
          <UTextarea
            v-model="localHintGenerationPrompt"
            :rows="3"
            placeholder="検出された内容に応じて、営業マンとして次にやるべきことの適切なヒントを、10文字以内で出して"
            class="w-full"
          />
        </div>

        <!-- モデル設定セクション -->
        <div class="border-t border-slate-200 pt-6">
          <h3 class="mb-4 text-sm font-semibold text-slate-700">
            AIモデル設定
          </h3>

          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-slate-700">
              文字起こしモデル
            </label>
            <USelect
              v-model="localTranscribeModel"
              :items="transcribeModelOptions"
              value-key="value"
              class="w-full"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              トピック判定モデル
            </label>
            <USelect
              v-model="localTopicDetectionModel"
              :items="topicDetectionModelOptions"
              value-key="value"
              class="w-full"
            />
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="soft"
            @click="handleCancel"
          >
            キャンセル
          </UButton>
          <UButton
            color="primary"
            @click="handleSave"
          >
            保存
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

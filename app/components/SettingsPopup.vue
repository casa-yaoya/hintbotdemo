<script setup lang="ts">
import type { MatchType, PhraseConfig } from '~/composables/useRealtimeAPI'

interface Props {
  modelValue: boolean
  prompt: string
  phrases: PhraseConfig[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:prompt': [value: string]
  'update:phrases': [value: PhraseConfig[]]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const localPrompt = ref(props.prompt)
const localPhrases = ref<PhraseConfig[]>([...props.phrases])

const newPhrase = ref('')
const newMatchType = ref<MatchType>('exact')
const newSemanticHint = ref('')

const matchTypeOptions = [
  { label: '完全一致', value: 'exact' },
  { label: '意味判定', value: 'semantic' },
]

watch(() => props.prompt, (val) => {
  localPrompt.value = val
})

watch(() => props.phrases, (val) => {
  localPhrases.value = [...val]
}, { deep: true })

function addPhrase() {
  if (!newPhrase.value.trim()) return

  const phrase: PhraseConfig = {
    phrase: newPhrase.value.trim(),
    matchType: newMatchType.value,
  }

  if (newMatchType.value === 'semantic' && newSemanticHint.value.trim()) {
    phrase.semanticHint = newSemanticHint.value.trim()
  }

  localPhrases.value.push(phrase)
  newPhrase.value = ''
  newSemanticHint.value = ''
  newMatchType.value = 'exact'
}

function removePhrase(index: number) {
  localPhrases.value.splice(index, 1)
}

function handleSave() {
  emit('update:prompt', localPrompt.value)
  emit('update:phrases', [...localPhrases.value])
  isOpen.value = false
}

function handleCancel() {
  localPrompt.value = props.prompt
  localPhrases.value = [...props.phrases]
  isOpen.value = false
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="p-6">
        <h2 class="mb-6 text-lg font-semibold text-slate-800">
          設定
        </h2>

        <div class="space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              ヒントボットへの指示
            </label>
            <UTextarea
              v-model="localPrompt"
              :rows="6"
              placeholder="AIへの指示を入力..."
              class="w-full"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              フレーズ検出
            </label>

            <div class="space-y-3">
              <div class="flex gap-2">
                <UInput
                  v-model="newPhrase"
                  placeholder="フレーズを入力..."
                  class="flex-1"
                  @keyup.enter="addPhrase"
                />
                <USelect
                  v-model="newMatchType"
                  :items="matchTypeOptions"
                  value-key="value"
                  class="w-32"
                />
              </div>

              <div v-if="newMatchType === 'semantic'">
                <UInput
                  v-model="newSemanticHint"
                  placeholder="意味のヒントを入力（例: 挨拶全般）..."
                  class="w-full"
                />
              </div>

              <UButton
                block
                color="primary"
                variant="soft"
                @click="addPhrase"
              >
                <UIcon name="lucide:plus" class="mr-1 h-4 w-4" />
                追加
              </UButton>
            </div>

            <div
              v-if="localPhrases.length > 0"
              class="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3"
            >
              <div
                v-for="(phrase, index) in localPhrases"
                :key="index"
                class="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <UBadge
                    :color="phrase.matchType === 'exact' ? 'info' : 'warning'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ phrase.matchType === 'exact' ? '完全' : '意味' }}
                  </UBadge>
                  <span class="truncate text-sm text-slate-700">
                    {{ truncateText(phrase.phrase, 20) }}
                  </span>
                  <span
                    v-if="phrase.semanticHint"
                    class="truncate text-xs text-slate-500"
                  >
                    ({{ truncateText(phrase.semanticHint, 15) }})
                  </span>
                </div>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="removePhrase(index)"
                >
                  <UIcon name="lucide:x" class="h-4 w-4" />
                </UButton>
              </div>
            </div>
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

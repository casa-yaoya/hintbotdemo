<script setup lang="ts">
import type { HintRule, MatchType, PhraseConfig } from '~/composables/useRealtimeAPI'

interface Props {
  modelValue: boolean
  prompt: string
  phrases: PhraseConfig[]
  hintRules: HintRule[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:prompt': [value: string]
  'update:phrases': [value: PhraseConfig[]]
  'update:hintRules': [value: HintRule[]]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const localPrompt = ref(props.prompt)
const localPhrases = ref<PhraseConfig[]>([...props.phrases])
const localHintRules = ref<HintRule[]>([...props.hintRules])

const newPhrase = ref('')
const newMatchType = ref<MatchType>('exact')
const newSemanticHint = ref('')

// ヒントルール追加用
const newRuleName = ref('')
const newRuleTriggerPhrases = ref<string[]>([])
const newRuleHintText = ref('')

const matchTypeOptions = [
  { label: '完全一致', value: 'exact' },
  { label: '意味判定', value: 'semantic' },
]

// フレーズ選択用オプション
const phraseOptions = computed(() =>
  localPhrases.value.map((p: PhraseConfig) => ({ label: p.phrase, value: p.phrase })),
)

watch(() => props.prompt, (val: string) => {
  localPrompt.value = val
})

watch(() => props.phrases, (val: PhraseConfig[]) => {
  localPhrases.value = [...val]
}, { deep: true })

watch(() => props.hintRules, (val: HintRule[]) => {
  localHintRules.value = [...val]
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
  const removedPhrase = localPhrases.value[index].phrase
  localPhrases.value.splice(index, 1)
  // 削除されたフレーズをヒントルールから除去
  localHintRules.value.forEach((rule: HintRule) => {
    rule.triggerPhrases = rule.triggerPhrases.filter((p: string) => p !== removedPhrase)
  })
}

function addHintRule() {
  if (!newRuleName.value.trim() || !newRuleHintText.value.trim() || newRuleTriggerPhrases.value.length === 0) return

  const rule: HintRule = {
    id: crypto.randomUUID(),
    name: newRuleName.value.trim(),
    triggerPhrases: [...newRuleTriggerPhrases.value],
    hintText: newRuleHintText.value.trim(),
    enabled: true,
  }

  localHintRules.value.push(rule)
  newRuleName.value = ''
  newRuleTriggerPhrases.value = []
  newRuleHintText.value = ''
}

function removeHintRule(index: number) {
  localHintRules.value.splice(index, 1)
}

function toggleHintRule(index: number) {
  localHintRules.value[index].enabled = !localHintRules.value[index].enabled
}

function handleSave() {
  emit('update:prompt', localPrompt.value)
  emit('update:phrases', [...localPhrases.value])
  emit('update:hintRules', [...localHintRules.value])
  isOpen.value = false
}

function handleCancel() {
  localPrompt.value = props.prompt
  localPhrases.value = [...props.phrases]
  localHintRules.value = [...props.hintRules]
  isOpen.value = false
}

function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
</script>

<template>
  <UModal :open="isOpen" @update:open="isOpen = $event">
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

          <!-- ヒントルール設定 -->
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              ヒントルール
            </label>
            <p class="mb-3 text-xs text-slate-500">
              指定したフレーズがすべて検出されたときに、設定したヒントを表示します
            </p>

            <div class="space-y-3">
              <UInput
                v-model="newRuleName"
                placeholder="ルール名（例: 挨拶ヒント）"
                class="w-full"
              />

              <div>
                <label class="mb-1 block text-xs text-slate-500">発火条件（フレーズを選択）</label>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="phrase in localPhrases"
                    :key="phrase.phrase"
                    size="xs"
                    :color="newRuleTriggerPhrases.includes(phrase.phrase) ? 'primary' : 'neutral'"
                    :variant="newRuleTriggerPhrases.includes(phrase.phrase) ? 'solid' : 'outline'"
                    @click="newRuleTriggerPhrases.includes(phrase.phrase)
                      ? newRuleTriggerPhrases = newRuleTriggerPhrases.filter(p => p !== phrase.phrase)
                      : newRuleTriggerPhrases = [...newRuleTriggerPhrases, phrase.phrase]"
                  >
                    {{ truncateText(phrase.phrase, 15) }}
                  </UButton>
                </div>
                <p v-if="localPhrases.length === 0" class="text-xs text-slate-400">
                  先にフレーズを追加してください
                </p>
              </div>

              <UTextarea
                v-model="newRuleHintText"
                :rows="2"
                placeholder="表示するヒントテキスト"
                class="w-full"
              />

              <UButton
                block
                color="success"
                variant="soft"
                :disabled="!newRuleName.trim() || !newRuleHintText.trim() || newRuleTriggerPhrases.length === 0"
                @click="addHintRule"
              >
                <UIcon name="lucide:plus" class="mr-1 h-4 w-4" />
                ルール追加
              </UButton>
            </div>

            <div
              v-if="localHintRules.length > 0"
              class="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3"
            >
              <div
                v-for="(rule, index) in localHintRules"
                :key="rule.id"
                class="rounded-md bg-slate-50 px-3 py-2"
                :class="{ 'opacity-50': !rule.enabled }"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      :color="rule.enabled ? 'success' : 'neutral'"
                      variant="ghost"
                      @click="toggleHintRule(index)"
                    >
                      <UIcon :name="rule.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-4 w-4" />
                    </UButton>
                    <span class="text-sm font-medium text-slate-700">{{ rule.name }}</span>
                  </div>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="removeHintRule(index)"
                  >
                    <UIcon name="lucide:x" class="h-4 w-4" />
                  </UButton>
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <UBadge
                    v-for="phrase in rule.triggerPhrases"
                    :key="phrase"
                    color="info"
                    variant="subtle"
                    size="xs"
                  >
                    {{ truncateText(phrase, 10) }}
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-slate-600">
                  → {{ truncateText(rule.hintText, 30) }}
                </p>
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

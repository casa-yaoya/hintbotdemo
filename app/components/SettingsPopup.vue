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
const newRuleTriggerPhrases = ref<string[]>([])
const newRuleHintText = ref('')

// 編集中のインデックス
const editingPhraseIndex = ref<number | null>(null)
const editingRuleIndex = ref<number | null>(null)

// 編集用の一時データ
const editPhrase = ref('')
const editMatchType = ref<MatchType>('exact')
const editSemanticHint = ref('')
const editRuleTriggerPhrases = ref<string[]>([])
const editRuleHintText = ref('')

const matchTypeOptions = [
  { label: '完全一致', value: 'exact' },
  { label: '意味一致', value: 'semantic' },
]

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
  editingPhraseIndex.value = null
}

function startEditPhrase(index: number) {
  const phrase = localPhrases.value[index]
  editingPhraseIndex.value = index
  editPhrase.value = phrase.phrase
  editMatchType.value = phrase.matchType
  editSemanticHint.value = phrase.semanticHint || ''
}

function saveEditPhrase() {
  if (editingPhraseIndex.value === null) return
  if (!editPhrase.value.trim()) return

  const oldPhrase = localPhrases.value[editingPhraseIndex.value].phrase
  const newPhraseText = editPhrase.value.trim()

  localPhrases.value[editingPhraseIndex.value] = {
    phrase: newPhraseText,
    matchType: editMatchType.value,
    semanticHint: editMatchType.value === 'semantic' ? editSemanticHint.value.trim() : undefined,
  }

  // ヒントルールの発火条件も更新
  if (oldPhrase !== newPhraseText) {
    localHintRules.value.forEach((rule: HintRule) => {
      rule.triggerPhrases = rule.triggerPhrases.map((p: string) =>
        p === oldPhrase ? newPhraseText : p,
      )
    })
  }

  editingPhraseIndex.value = null
}

function cancelEditPhrase() {
  editingPhraseIndex.value = null
}

function addHintRule() {
  if (!newRuleHintText.value.trim() || newRuleTriggerPhrases.value.length === 0) return

  const rule: HintRule = {
    id: crypto.randomUUID(),
    triggerPhrases: [...newRuleTriggerPhrases.value],
    hintText: newRuleHintText.value.trim(),
    enabled: true,
  }

  localHintRules.value.push(rule)
  newRuleTriggerPhrases.value = []
  newRuleHintText.value = ''
}

function removeHintRule(index: number) {
  localHintRules.value.splice(index, 1)
  editingRuleIndex.value = null
}

function toggleHintRule(index: number) {
  localHintRules.value[index].enabled = !localHintRules.value[index].enabled
}

function startEditRule(index: number) {
  const rule = localHintRules.value[index]
  editingRuleIndex.value = index
  editRuleTriggerPhrases.value = [...rule.triggerPhrases]
  editRuleHintText.value = rule.hintText
}

function saveEditRule() {
  if (editingRuleIndex.value === null) return
  if (!editRuleHintText.value.trim() || editRuleTriggerPhrases.value.length === 0) return

  localHintRules.value[editingRuleIndex.value] = {
    ...localHintRules.value[editingRuleIndex.value],
    triggerPhrases: [...editRuleTriggerPhrases.value],
    hintText: editRuleHintText.value.trim(),
  }

  editingRuleIndex.value = null
}

function cancelEditRule() {
  editingRuleIndex.value = null
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
  editingPhraseIndex.value = null
  editingRuleIndex.value = null
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
          <!-- 指示セクション -->
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              指示
            </label>
            <UTextarea
              v-model="localPrompt"
              :rows="4"
              placeholder="あなたは音声分析のエキスパートです。ユーザーの会話を聞いて、登録された内容（意味）を検出してください。内容を検出したら detect_phrase 関数を呼び出してください。"
              class="w-full"
            />
          </div>

          <!-- 検出対象セクション -->
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              検出対象
            </label>

            <!-- 登録済みリスト -->
            <div
              v-if="localPhrases.length > 0"
              class="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3"
            >
              <div
                v-for="(phrase, index) in localPhrases"
                :key="index"
                class="rounded-md bg-slate-50 px-3 py-2"
              >
                <!-- 編集モード -->
                <div v-if="editingPhraseIndex === index" class="space-y-2">
                  <div class="flex gap-2">
                    <USelect
                      v-model="editMatchType"
                      :items="matchTypeOptions"
                      value-key="value"
                      class="w-28"
                    />
                    <UInput
                      v-model="editPhrase"
                      class="flex-1"
                    />
                  </div>
                  <div v-if="editMatchType === 'semantic'">
                    <UInput
                      v-model="editSemanticHint"
                      placeholder="補足：挨拶全般（おはよう、ハローなどもOK）"
                      class="w-full"
                    />
                  </div>
                  <div class="flex justify-end gap-2">
                    <UButton size="xs" color="neutral" variant="ghost" @click="cancelEditPhrase">
                      キャンセル
                    </UButton>
                    <UButton size="xs" color="primary" @click="saveEditPhrase">
                      保存
                    </UButton>
                  </div>
                </div>

                <!-- 表示モード -->
                <div v-else class="flex items-start justify-between gap-2">
                  <div
                    class="flex min-w-0 flex-1 cursor-pointer flex-col gap-1"
                    @click="startEditPhrase(index)"
                  >
                    <div class="flex items-center gap-2">
                      <UBadge
                        :color="phrase.matchType === 'exact' ? 'info' : 'warning'"
                        variant="subtle"
                        size="xs"
                      >
                        {{ phrase.matchType === 'exact' ? '完全一致' : '意味一致' }}
                      </UBadge>
                      <span class="text-sm text-slate-700">
                        {{ phrase.phrase }}
                      </span>
                    </div>
                    <div
                      v-if="phrase.matchType === 'semantic' && phrase.semanticHint"
                      class="text-xs text-slate-500"
                    >
                      補足：{{ phrase.semanticHint }}
                    </div>
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

            <!-- 発火条件追加フォーム -->
            <div class="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
              <div class="flex gap-2">
                <USelect
                  v-model="newMatchType"
                  :items="matchTypeOptions"
                  value-key="value"
                  class="w-28"
                />
                <UInput
                  v-model="newPhrase"
                  placeholder="検出する内容を入力..."
                  class="flex-1"
                  @keyup.enter="addPhrase"
                />
              </div>

              <div v-if="newMatchType === 'semantic'">
                <UInput
                  v-model="newSemanticHint"
                  placeholder="補足：挨拶全般（おはよう、ハローなどもOK）"
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
          </div>

          <!-- ヒントリストセクション -->
          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">
              ヒントリスト
            </label>

            <!-- 登録済みヒントリスト -->
            <div
              v-if="localHintRules.length > 0"
              class="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3"
            >
              <div
                v-for="(rule, index) in localHintRules"
                :key="rule.id"
                class="rounded-md bg-slate-50 px-3 py-2"
                :class="{ 'opacity-50': !rule.enabled }"
              >
                <!-- 編集モード -->
                <div v-if="editingRuleIndex === index" class="space-y-3">
                  <div>
                    <label class="mb-1 block text-xs text-slate-500">発火条件（複数選択可）</label>
                    <div class="flex flex-wrap gap-2">
                      <UButton
                        v-for="phrase in localPhrases"
                        :key="phrase.phrase"
                        size="xs"
                        :color="editRuleTriggerPhrases.includes(phrase.phrase) ? 'primary' : 'neutral'"
                        :variant="editRuleTriggerPhrases.includes(phrase.phrase) ? 'solid' : 'outline'"
                        @click="editRuleTriggerPhrases.includes(phrase.phrase)
                          ? editRuleTriggerPhrases = editRuleTriggerPhrases.filter(p => p !== phrase.phrase)
                          : editRuleTriggerPhrases = [...editRuleTriggerPhrases, phrase.phrase]"
                      >
                        {{ truncateText(phrase.phrase, 15) }}
                      </UButton>
                    </div>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs text-slate-500">ヒントテキスト</label>
                    <UTextarea
                      v-model="editRuleHintText"
                      :rows="2"
                      class="w-full"
                    />
                  </div>
                  <div class="flex justify-end gap-2">
                    <UButton size="xs" color="neutral" variant="ghost" @click="cancelEditRule">
                      キャンセル
                    </UButton>
                    <UButton size="xs" color="primary" @click="saveEditRule">
                      保存
                    </UButton>
                  </div>
                </div>

                <!-- 表示モード -->
                <div v-else class="flex items-start justify-between gap-2">
                  <div
                    class="flex min-w-0 flex-1 cursor-pointer flex-col gap-1"
                    @click="startEditRule(index)"
                  >
                    <div class="flex items-center gap-2">
                      <UButton
                        size="xs"
                        :color="rule.enabled ? 'success' : 'neutral'"
                        variant="ghost"
                        @click.stop="toggleHintRule(index)"
                      >
                        <UIcon :name="rule.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-4 w-4" />
                      </UButton>
                      <span class="text-xs text-slate-500">発火条件：</span>
                      <div class="flex flex-wrap gap-1">
                        <UBadge
                          v-for="phrase in rule.triggerPhrases"
                          :key="phrase"
                          color="info"
                          variant="subtle"
                          size="xs"
                        >
                          {{ truncateText(phrase, 15) }}
                        </UBadge>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-slate-500">ヒントテキスト：</span>
                      <span class="text-sm text-slate-700">{{ rule.hintText }}</span>
                    </div>
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
              </div>
            </div>

            <!-- ヒント追加フォーム -->
            <div class="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">発火条件（複数選択可）</label>
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
                  先に検出対象に項目を追加してください
                </p>
              </div>

              <div>
                <label class="mb-1 block text-xs text-slate-500">ヒントテキスト</label>
                <UTextarea
                  v-model="newRuleHintText"
                  :rows="2"
                  placeholder="表示するヒントテキストを入力..."
                  class="w-full"
                />
              </div>

              <UButton
                block
                color="success"
                variant="soft"
                :disabled="!newRuleHintText.trim() || newRuleTriggerPhrases.length === 0"
                @click="addHintRule"
              >
                <UIcon name="lucide:plus" class="mr-1 h-4 w-4" />
                ヒント追加
              </UButton>
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

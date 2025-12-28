<script setup lang="ts">
import type { HintType, PhraseConfig, StatusType } from '~/composables/useRealtimeAPI'

interface Props {
  configs: PhraseConfig[]
  statusType: StatusType
  title: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:configs': [value: PhraseConfig[]]
}>()

// このstatusTypeに該当するconfigのみ表示
const filteredConfigs = computed(() =>
  props.configs.filter(c => c.statusType === props.statusType),
)

const localConfigs = ref<PhraseConfig[]>([...filteredConfigs.value])

// 新規追加用
const newPhrase = ref('')
const newDescription = ref('')
const newHintType = ref<HintType>('fixed')
const newHintText = ref('')

const hintTypeOptions = [
  { label: '固定', value: 'fixed' },
  { label: 'AI', value: 'ai' },
]

watch(filteredConfigs, (val) => {
  localConfigs.value = [...val]
}, { deep: true })

// localConfigsを全体のconfigsにマージして返す
function mergeConfigs(): PhraseConfig[] {
  // 他のstatusTypeのconfigsを保持しつつ、このstatusTypeのものを更新
  const otherConfigs = props.configs.filter(c => c.statusType !== props.statusType)
  return [...otherConfigs, ...localConfigs.value]
}

function updateField(index: number, field: keyof PhraseConfig, value: string) {
  const config = localConfigs.value[index]
  if (field === 'description') {
    config.description = value.trim() || undefined
  }
  else {
    (config as Record<string, unknown>)[field] = value
  }
  emit('update:configs', mergeConfigs())
}

function addConfig() {
  // AIヒントの場合はhintTextは不要
  if (!newPhrase.value.trim()) return
  if (newHintType.value === 'fixed' && !newHintText.value.trim()) return

  const config: PhraseConfig = {
    id: crypto.randomUUID(),
    phrase: newPhrase.value.trim(),
    description: newDescription.value.trim() || undefined,
    statusType: props.statusType, // propsのstatusTypeを使用
    hintType: newHintType.value,
    hintText: newHintType.value === 'fixed' ? newHintText.value.trim() : '',
    enabled: true,
  }

  localConfigs.value.push(config)
  emit('update:configs', mergeConfigs())

  newPhrase.value = ''
  newDescription.value = ''
  newHintType.value = 'ai'
  newHintText.value = ''
}

function removeConfig(index: number) {
  localConfigs.value.splice(index, 1)
  emit('update:configs', mergeConfigs())
}

function toggleConfig(index: number) {
  localConfigs.value[index].enabled = !localConfigs.value[index].enabled
  emit('update:configs', mergeConfigs())
}
</script>

<template>
  <div class="hint-config-table">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">
        {{ title }}
      </h3>
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200">
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="w-10 px-2 py-2 text-center font-medium text-slate-600">
              #
            </th>
            <th class="w-10 px-2 py-2 text-center font-medium text-slate-600">
              有効
            </th>
            <th class="px-3 py-2 text-left font-medium text-slate-600">
              ステータス
            </th>
            <th class="px-3 py-2 text-left font-medium text-slate-600">
              ステータス定義
            </th>
            <th class="w-20 px-3 py-2 text-left font-medium text-slate-600">
              ヒント種別
            </th>
            <th class="px-3 py-2 text-left font-medium text-slate-600">
              ヒント内容
            </th>
            <th class="w-16 px-2 py-2 text-center font-medium text-slate-600">
              操作
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <!-- 既存の行（インライン編集可能） -->
          <tr
            v-for="(config, index) in localConfigs"
            :key="config.id"
            class="hover:bg-slate-50"
            :class="{ 'opacity-50': !config.enabled }"
          >
            <td class="px-2 py-2 text-center">
              <span class="text-xs font-medium text-slate-500">{{ index + 1 }}</span>
            </td>
            <td class="px-2 py-2 text-center">
              <UButton
                size="xs"
                :color="config.enabled ? 'success' : 'neutral'"
                variant="ghost"
                @click="toggleConfig(index)"
              >
                <UIcon :name="config.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-4 w-4" />
              </UButton>
            </td>
            <td class="px-2 py-2">
              <UInput
                :model-value="config.phrase"
                size="xs"
                class="w-full"
                @update:model-value="updateField(index, 'phrase', $event)"
              />
            </td>
            <td class="px-2 py-2">
              <UInput
                :model-value="config.description || ''"
                size="xs"
                placeholder="ステータス定義..."
                class="w-full"
                @update:model-value="updateField(index, 'description', $event)"
              />
            </td>
            <td class="px-2 py-2">
              <USelect
                :model-value="config.hintType || 'fixed'"
                :items="hintTypeOptions"
                value-key="value"
                size="xs"
                class="w-full"
                @update:model-value="updateField(index, 'hintType', $event)"
              />
            </td>
            <td class="px-2 py-2">
              <UInput
                v-if="config.hintType !== 'ai'"
                :model-value="config.hintText"
                size="xs"
                class="w-full"
                @update:model-value="updateField(index, 'hintText', $event)"
              />
              <span v-else class="text-xs text-slate-400">（AIが生成）</span>
            </td>
            <td class="px-2 py-2 text-center">
              <UButton size="xs" color="error" variant="ghost" @click="removeConfig(index)">
                <UIcon name="lucide:trash-2" class="h-3 w-3" />
              </UButton>
            </td>
          </tr>

          <!-- 新規追加行 -->
          <tr class="bg-slate-25">
            <td class="px-2 py-1 text-center">
              <span class="text-xs text-slate-400">{{ localConfigs.length + 1 }}</span>
            </td>
            <td class="px-2 py-1 text-center">
              <UIcon name="lucide:plus-circle" class="h-4 w-4 text-slate-400" />
            </td>
            <td class="px-2 py-1">
              <UInput
                v-model="newPhrase"
                size="xs"
                placeholder="ステータス..."
                class="w-full"
              />
            </td>
            <td class="px-2 py-1">
              <UInput
                v-model="newDescription"
                size="xs"
                placeholder="ステータス定義..."
                class="w-full"
              />
            </td>
            <td class="px-2 py-1">
              <USelect
                v-model="newHintType"
                :items="hintTypeOptions"
                value-key="value"
                size="xs"
                class="w-full"
              />
            </td>
            <td class="px-2 py-1">
              <UInput
                v-if="newHintType !== 'ai'"
                v-model="newHintText"
                size="xs"
                placeholder="ヒント..."
                class="w-full"
                @keyup.enter="addConfig"
              />
              <span v-else class="text-xs text-slate-400">（AIが生成）</span>
            </td>
            <td class="px-2 py-1 text-center">
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                :disabled="!newPhrase.trim() || (newHintType === 'fixed' && !newHintText.trim())"
                @click="addConfig"
              >
                <UIcon name="lucide:plus" class="h-3 w-3" />
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

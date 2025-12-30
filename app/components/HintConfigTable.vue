<script setup lang="ts">
import type { DetectionType, PhraseConfig } from '~/composables/useRealtimeAPI'
import { parseHintCSV } from '~/utils/csvParser'

interface Props {
  configs: PhraseConfig[]
  detectionType: DetectionType
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:configs': [value: PhraseConfig[]]
}>()

// CSV読み込み用
const fileInputRef = ref<HTMLInputElement | null>(null)

// このdetectionTypeに該当するconfigのみ表示
const filteredConfigs = computed(() =>
  props.configs.filter(c => c.detectionType === props.detectionType),
)

const localConfigs = ref<PhraseConfig[]>([...filteredConfigs.value])

// 新規追加用
const newPhrase = ref('')
const newDescription = ref('')
const newHintText = ref('')

watch(filteredConfigs, (val) => {
  localConfigs.value = [...val]
}, { deep: true })

// localConfigsを全体のconfigsにマージして返す
function mergeConfigs(): PhraseConfig[] {
  // 他のdetectionTypeのconfigsを保持しつつ、このdetectionTypeのものを更新
  const otherConfigs = props.configs.filter(c => c.detectionType !== props.detectionType)
  return [...otherConfigs, ...localConfigs.value]
}

function updateField(index: number, field: keyof PhraseConfig, value: string) {
  const config = localConfigs.value[index]
  if (!config) return
  if (field === 'description') {
    config.description = value.trim() || undefined
  }
  else {
    (config as Record<string, unknown>)[field] = value
  }
  emit('update:configs', mergeConfigs())
}

function addConfig() {
  if (!newPhrase.value.trim()) return
  if (!newHintText.value.trim()) return

  const config: PhraseConfig = {
    id: crypto.randomUUID(),
    phrase: newPhrase.value.trim(),
    description: newDescription.value.trim() || undefined,
    detectionType: props.detectionType,
    hintType: 'fixed',
    hintText: newHintText.value.trim(),
    enabled: true,
  }

  localConfigs.value.push(config)
  emit('update:configs', mergeConfigs())

  newPhrase.value = ''
  newDescription.value = ''
  newHintText.value = ''
}

function removeConfig(index: number) {
  localConfigs.value.splice(index, 1)
  emit('update:configs', mergeConfigs())
}

function toggleConfig(index: number) {
  const config = localConfigs.value[index]
  if (!config) return
  config.enabled = !config.enabled
  emit('update:configs', mergeConfigs())
}

// CSV読み込みボタンクリック
function triggerFileInput() {
  fileInputRef.value?.click()
}

// CSVファイル選択時の処理
async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const csvText = await file.text()
    const newConfigs = parseHintCSV(csvText, props.detectionType)

    if (newConfigs.length > 0) {
      // 既存の設定を新しい設定で置き換え
      localConfigs.value = newConfigs
      emit('update:configs', mergeConfigs())
    }
  }
  catch (error) {
    console.error('CSV読み込みエラー:', error)
  }

  // 同じファイルを再選択できるようにリセット
  input.value = ''
}
</script>

<template>
  <ClientOnly>
    <div class="hint-config-table">
      <!-- CSV読み込みボタン -->
      <div class="mb-2 flex justify-end">
        <input
          ref="fileInputRef"
          type="file"
          accept=".csv"
          class="hidden"
          @change="handleFileSelect"
        >
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          @click="triggerFileInput"
        >
          <UIcon name="lucide:upload" class="mr-1 h-3 w-3" />
          CSVから読み込み
        </UButton>
      </div>
      <div class="overflow-hidden rounded-lg border border-slate-200">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="w-12 px-2 py-2 text-center font-medium text-slate-600">
                No.
              </th>
              <th class="px-3 py-2 text-left font-medium text-slate-600">
                名前
              </th>
              <th class="px-3 py-2 text-left font-medium text-slate-600">
                判定基準
              </th>
              <th class="px-3 py-2 text-left font-medium text-slate-600">
                ヒント
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
                <div class="flex items-center justify-center gap-1">
                  <UButton
                    size="xs"
                    :color="config.enabled ? 'success' : 'neutral'"
                    variant="ghost"
                    @click="toggleConfig(index)"
                  >
                    <UIcon :name="config.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-4 w-4" />
                  </UButton>
                  <span class="text-xs font-medium text-slate-500">{{ index + 1 }}</span>
                </div>
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
                  placeholder="判定基準..."
                  class="w-full"
                  @update:model-value="updateField(index, 'description', $event)"
                />
              </td>
              <td class="px-2 py-2">
                <div class="flex items-start gap-1">
                  <UTextarea
                    :model-value="config.hintText"
                    :rows="2"
                    size="xs"
                    class="w-full flex-1"
                    placeholder="ヒント（改行可）..."
                    @update:model-value="updateField(index, 'hintText', $event)"
                  />
                  <UButton size="xs" color="error" variant="ghost" @click="removeConfig(index)">
                    <UIcon name="lucide:trash-2" class="h-3 w-3" />
                  </UButton>
                </div>
              </td>
            </tr>

            <!-- 新規追加行 -->
            <tr class="bg-slate-25">
              <td class="px-2 py-1 text-center">
                <UIcon name="lucide:plus-circle" class="h-4 w-4 text-slate-400" />
              </td>
              <td class="px-2 py-1">
                <UInput
                  v-model="newPhrase"
                  size="xs"
                  placeholder="名前..."
                  class="w-full"
                />
              </td>
              <td class="px-2 py-1">
                <UInput
                  v-model="newDescription"
                  size="xs"
                  placeholder="判定基準..."
                  class="w-full"
                />
              </td>
              <td class="px-2 py-1">
                <div class="flex items-start gap-1">
                  <UTextarea
                    v-model="newHintText"
                    :rows="2"
                    size="xs"
                    placeholder="ヒント（改行可）..."
                    class="w-full flex-1"
                  />
                  <UButton
                    size="xs"
                    color="primary"
                    variant="soft"
                    :disabled="!newPhrase.trim() || !newHintText.trim()"
                    @click="addConfig"
                  >
                    <UIcon name="lucide:plus" class="h-3 w-3" />
                  </UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <template #fallback>
      <div class="hint-config-table">
        <div class="overflow-hidden rounded-lg border border-slate-200">
          <div class="animate-pulse p-4">
            <div class="h-8 bg-slate-200 rounded mb-2" />
            <div class="h-8 bg-slate-200 rounded mb-2" />
            <div class="h-8 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    </template>
  </ClientOnly>
</template>

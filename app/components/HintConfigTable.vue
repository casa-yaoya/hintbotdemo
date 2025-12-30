<script setup lang="ts">
import type { DetectionType, PhraseConfig } from '~/composables/useRealtimeAPI'
import { parseHintCSV } from '~/utils/csvParser'
import { useHintSettings } from '~/composables/useHintSettings'
import draggable from 'vuedraggable'

interface Props {
  configs: PhraseConfig[]
  detectionType: DetectionType
  modeId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:configs': [value: PhraseConfig[]]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

const filteredConfigs = computed(() =>
  props.configs.filter(c => c.detectionType === props.detectionType),
)

const localConfigs = ref<PhraseConfig[]>([...filteredConfigs.value])

const newPhrase = ref('')
const newDescription = ref('')
const newHintText = ref('')
const isAdding = ref(false)

function startAdding() {
  isAdding.value = true
  newPhrase.value = ''
  newDescription.value = ''
  newHintText.value = ''
}

watch(filteredConfigs, (val) => {
  localConfigs.value = [...val]
}, { deep: true })

function mergeConfigs(): PhraseConfig[] {
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
  isAdding.value = false
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

function onDragEnd() {
  emit('update:configs', mergeConfigs())
}

// Firebase保存
const { loading: isSaving, saveSettings } = useHintSettings()

async function handleSaveToCloud() {
  const success = await saveSettings(props.modeId, props.configs)
  if (success) {
    console.log(`ヒント設定を保存しました: ${props.modeId}`)
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const csvText = await file.text()
    const newConfigs = parseHintCSV(csvText, props.detectionType)

    if (newConfigs.length > 0) {
      localConfigs.value = newConfigs
      emit('update:configs', mergeConfigs())
    }
  }
  catch (error) {
    console.error('CSV読み込みエラー:', error)
  }

  input.value = ''
}

// 外部から呼び出せる関数・状態
defineExpose({
  startAdding,
  triggerFileInput,
  handleSaveToCloud,
  isSaving,
  configCount: computed(() => localConfigs.value.length),
})
</script>

<template>
  <ClientOnly>
    <div class="hint-config-table">
      <input
        ref="fileInputRef"
        type="file"
        accept=".csv"
        class="hidden"
        @change="handleFileSelect"
      >

      <!-- テーブル -->
      <div class="overflow-hidden bg-white">
        <!-- 固定ヘッダー -->
        <div class="flex border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
          <div class="w-8 shrink-0 px-1 py-2 text-center">#</div>
          <div class="w-[200px] shrink-0 px-1 py-2">名前</div>
          <div class="w-[400px] shrink-0 px-1 py-2">判定基準</div>
          <div class="min-w-0 flex-1 px-1 py-2">ヒント</div>
          <div class="w-12 shrink-0 px-1 py-2 text-center">操作</div>
        </div>

        <!-- スクロール領域 -->
        <div class="max-h-80 overflow-y-auto">
          <!-- 既存行（ドラッグ可能） -->
          <draggable
            v-model="localConfigs"
            item-key="id"
            handle=".drag-handle"
            ghost-class="bg-blue-50"
            @end="onDragEnd"
          >
            <template #item="{ element: config, index }">
              <div
                class="group flex border-b border-slate-100 text-xs hover:bg-slate-50"
                :class="{ 'opacity-40': !config.enabled }"
              >
                <!-- ドラッグハンドル & No. -->
                <div class="flex w-8 shrink-0 items-center justify-center px-1 py-1.5">
                  <span class="drag-handle cursor-grab text-[10px] text-slate-400 hover:text-slate-600">
                    {{ index + 1 }}
                  </span>
                </div>

                <!-- 名前 -->
                <div class="w-[200px] shrink-0 px-1 py-1.5">
                  <input
                    :value="config.phrase"
                    class="w-full rounded border-0 bg-transparent px-1 py-0.5 text-xs text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-blue-300"
                    @input="updateField(index, 'phrase', ($event.target as HTMLInputElement).value)"
                  >
                </div>

                <!-- 判定基準 -->
                <div class="w-[400px] shrink-0 px-1 py-1.5">
                  <input
                    :value="config.description || ''"
                    placeholder="—"
                    class="w-full rounded border-0 bg-transparent px-1 py-0.5 text-xs text-slate-600 outline-none placeholder:text-slate-300 focus:bg-white focus:ring-1 focus:ring-blue-300"
                    @input="updateField(index, 'description', ($event.target as HTMLInputElement).value)"
                  >
                </div>

                <!-- ヒント -->
                <div class="min-w-0 flex-1 px-1 py-1.5">
                  <div
                    contenteditable="true"
                    class="w-full whitespace-pre-wrap rounded border-0 bg-transparent px-1 py-0.5 text-xs leading-normal text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-blue-300"
                    @blur="updateField(index, 'hintText', ($event.target as HTMLElement).innerText)"
                    @keydown.enter.prevent="($event.target as HTMLElement).blur()"
                    v-text="config.hintText"
                  />
                </div>

                <!-- 操作 -->
                <div class="flex w-12 shrink-0 items-center justify-center gap-0.5 px-1 py-1.5">
                  <button
                    class="rounded p-0.5 hover:bg-slate-200"
                    :class="config.enabled ? 'text-green-500' : 'text-slate-300'"
                    :title="config.enabled ? '無効にする' : '有効にする'"
                    @click="toggleConfig(index)"
                  >
                    <UIcon :name="config.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="rounded p-0.5 text-slate-400 opacity-0 hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                    title="削除"
                    @click="removeConfig(index)"
                  >
                    <UIcon name="lucide:x" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </template>
          </draggable>

          <!-- 新規追加行（isAddingがtrueの場合のみ表示） -->
          <div v-if="isAdding" class="flex border-b border-slate-100 bg-blue-50/50 text-xs">
            <div class="flex w-8 shrink-0 items-center justify-center px-1 py-1.5">
              <UIcon name="lucide:plus" class="h-3 w-3 text-blue-400" />
            </div>
            <div class="w-[200px] shrink-0 px-1 py-1.5">
              <input
                v-model="newPhrase"
                placeholder="名前"
                class="w-full rounded border border-blue-200 bg-white px-1 py-0.5 text-xs outline-none focus:border-blue-400"
              >
            </div>
            <div class="w-[400px] shrink-0 px-1 py-1.5">
              <input
                v-model="newDescription"
                placeholder="判定基準"
                class="w-full rounded border border-blue-200 bg-white px-1 py-0.5 text-xs outline-none focus:border-blue-400"
              >
            </div>
            <div class="min-w-0 flex-1 px-1 py-1.5">
              <textarea
                v-model="newHintText"
                rows="1"
                placeholder="ヒント（最大5行）"
                class="field-sizing-content w-full resize-none rounded border border-blue-200 bg-white px-1 py-0.5 text-xs leading-normal outline-none focus:border-blue-400"
              />
            </div>
            <div class="flex w-12 shrink-0 items-center justify-center gap-0.5 px-1 py-1.5">
              <button
                class="rounded bg-blue-500 p-1 text-white hover:bg-blue-600 disabled:opacity-30"
                :disabled="!newPhrase.trim() || !newHintText.trim()"
                title="追加"
                @click="addConfig"
              >
                <UIcon name="lucide:check" class="h-3 w-3" />
              </button>
              <button
                class="rounded bg-slate-200 p-1 text-slate-500 hover:bg-slate-300"
                title="キャンセル"
                @click="isAdding = false"
              >
                <UIcon name="lucide:x" class="h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- データがない場合 -->
          <div v-if="localConfigs.length === 0 && !isAdding" class="py-6 text-center text-xs text-slate-400">
            データがありません
          </div>
        </div>
      </div>
    </div>

    <template #fallback>
      <div class="hint-config-table">
        <div class="overflow-hidden rounded border border-slate-200">
          <div class="animate-pulse p-3">
            <div class="mb-1.5 h-5 w-20 rounded bg-slate-200" />
            <div class="mb-1 h-6 rounded bg-slate-200" />
            <div class="mb-1 h-6 rounded bg-slate-200" />
            <div class="h-6 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </template>
  </ClientOnly>
</template>

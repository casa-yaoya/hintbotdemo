<script setup lang="ts">
interface Props {
  volume: number // 0-1
  volumeDb: number // dB値
  isSpeaking: boolean // 発話中かどうか
  isConnected: boolean // 接続中かどうか
}

defineProps<Props>()
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-3">
    <!-- 音量バー -->
    <div class="mb-4">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-xs text-slate-500">音量</span>
        <span class="font-mono text-xs text-slate-600">{{ volumeDb.toFixed(0) }} dB</span>
      </div>
      <div class="h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          class="h-full rounded-full transition-all duration-100"
          :class="[
            isSpeaking ? 'bg-green-500' : 'bg-slate-400',
          ]"
          :style="{ width: `${Math.min(100, Math.max(0, volume * 100))}%` }"
        />
      </div>
    </div>

    <!-- 発話ステータス -->
    <div>
      <div class="mb-1.5 text-xs text-slate-500">発話状態</div>
      <div class="flex gap-2">
        <!-- 待機中 -->
        <div
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 transition-all"
          :class="[
            !isSpeaking && isConnected
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-200 bg-slate-50',
          ]"
        >
          <div
            class="h-2 w-2 rounded-full"
            :class="[
              !isSpeaking && isConnected
                ? 'bg-blue-500'
                : 'bg-slate-300',
            ]"
          />
          <span
            class="text-xs font-medium"
            :class="[
              !isSpeaking && isConnected
                ? 'text-blue-700'
                : 'text-slate-400',
            ]"
          >待機</span>
        </div>

        <!-- 発話中 -->
        <div
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-2 transition-all"
          :class="[
            isSpeaking
              ? 'border-green-500 bg-green-50'
              : 'border-slate-200 bg-slate-50',
          ]"
        >
          <div
            class="h-2 w-2 rounded-full"
            :class="[
              isSpeaking
                ? 'animate-pulse bg-green-500'
                : 'bg-slate-300',
            ]"
          />
          <span
            class="text-xs font-medium"
            :class="[
              isSpeaking
                ? 'text-green-700'
                : 'text-slate-400',
            ]"
          >発話中</span>
        </div>
      </div>
    </div>

    <!-- 未接続時のオーバーレイ -->
    <div
      v-if="!isConnected"
      class="mt-3 rounded border border-slate-200 bg-slate-100 px-2 py-1.5 text-center text-xs text-slate-400"
    >
      未接続
    </div>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 1s ease-in-out infinite;
}
</style>

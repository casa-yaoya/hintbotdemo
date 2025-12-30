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
  <div class="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2">
    <!-- 発話ステータス -->
    <div class="flex items-center gap-1.5">
      <div
        class="h-2.5 w-2.5 rounded-full"
        :class="[
          !isConnected
            ? 'bg-slate-300'
            : isSpeaking
              ? 'animate-pulse bg-green-500'
              : 'bg-blue-500',
        ]"
      />
      <span
        class="text-xs font-medium"
        :class="[
          !isConnected
            ? 'text-slate-400'
            : isSpeaking
              ? 'text-green-700'
              : 'text-blue-700',
        ]"
      >
        {{ !isConnected ? '未接続' : isSpeaking ? '発話中' : '待機' }}
      </span>
    </div>

    <!-- 音量バー -->
    <div class="flex flex-1 items-center gap-2">
      <UIcon name="lucide:volume-2" class="h-4 w-4 text-slate-400" />
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div
          class="h-full rounded-full transition-all duration-100"
          :class="[isSpeaking ? 'bg-green-500' : 'bg-slate-400']"
          :style="{ width: `${Math.min(100, Math.max(0, volume * 100))}%` }"
        />
      </div>
      <span class="min-w-[3rem] text-right font-mono text-xs text-slate-500">
        {{ volumeDb.toFixed(0) }}dB
      </span>
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

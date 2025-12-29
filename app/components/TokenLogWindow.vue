<script setup lang="ts">
import type { TokenLogEntry, TokenLogPurpose } from '~/composables/useRealtimeAPI'

interface Props {
  logs: TokenLogEntry[]
}

defineProps<Props>()

// 用途の日本語ラベル
const purposeLabels: Record<TokenLogPurpose, string> = {
  'transcribe': '文字起こし',
  'topic-detection': 'トピック判定',
  'phrase-detection': 'フレーズ判定',
  'hint-generation': 'ヒント生成',
}

// USD→JPY換算レート
const USD_TO_JPY = 160

// 費用をフォーマット（日本円）
function formatCost(cost: number): string {
  const jpy = cost * USD_TO_JPY
  if (jpy < 0.01) {
    return `¥${jpy.toFixed(4)}`
  }
  return `¥${jpy.toFixed(2)}`
}

// トークン数をフォーマット
function formatTokens(entry: TokenLogEntry): string {
  if (entry.audioSeconds !== undefined) {
    return `${entry.audioSeconds.toFixed(1)}秒`
  }
  if (entry.totalTokens !== undefined) {
    return `${entry.totalTokens}tk`
  }
  return '-'
}
</script>

<template>
  <div class="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
    <div class="space-y-1">
      <div
        v-for="(log, index) in logs.slice().reverse().slice(0, 30)"
        :key="index"
        class="flex items-start gap-2 text-xs"
      >
        <span class="shrink-0 font-mono text-slate-400">{{ log.timestamp.split('.')[0] }}</span>
        <span class="shrink-0 min-w-[5rem] text-slate-600">{{ purposeLabels[log.purpose] }}</span>
        <span class="shrink-0 min-w-[4rem] text-slate-500">{{ log.api }}</span>
        <span class="shrink-0 min-w-[3rem] text-right text-slate-600">{{ formatTokens(log) }}</span>
        <span class="shrink-0 min-w-[4rem] text-right font-mono text-amber-600">{{ formatCost(log.cost) }}</span>
      </div>
      <div
        v-if="logs.length === 0"
        class="text-xs text-slate-400"
      >
        トークンログなし
      </div>
    </div>
  </div>
</template>

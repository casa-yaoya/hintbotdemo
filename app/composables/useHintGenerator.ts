import type { DetectionType, PhraseConfig } from '~/composables/useRealtimeAPI'
import { parseHintCSV } from '~/utils/csvParser'

interface GenerateHintsRequest {
  context: string
  detectionType: DetectionType
  existingHints?: PhraseConfig[]
  count?: number
}

interface GenerateHintsResponse {
  csv: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  } | null
}

export function useHintGenerator() {
  const isGenerating = ref(false)
  const error = ref<string | null>(null)

  async function generateHints(request: GenerateHintsRequest): Promise<PhraseConfig[]> {
    isGenerating.value = true
    error.value = null

    try {
      const response = await $fetch<GenerateHintsResponse>('/api/generate-hints', {
        method: 'POST',
        body: {
          context: request.context,
          detectionType: request.detectionType,
          existingHints: request.existingHints?.map(h => ({
            phrase: h.phrase,
            description: h.description,
          })),
          count: request.count || 5,
        },
      })

      if (!response.csv) {
        throw new Error('AIからの応答が空です')
      }

      // CSVをパースしてPhraseConfig配列に変換
      const configs = parseHintCSV(response.csv, request.detectionType)

      if (configs.length === 0) {
        throw new Error('ヒントの生成に失敗しました')
      }

      return configs
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'ヒント生成に失敗しました'
      console.error('Failed to generate hints:', e)
      return []
    }
    finally {
      isGenerating.value = false
    }
  }

  return {
    isGenerating,
    error,
    generateHints,
  }
}

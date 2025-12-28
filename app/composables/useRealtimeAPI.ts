export type HintType = 'fixed' | 'ai' // 固定ヒント or AIヒント

// LLMが返す根拠タイプ
export type EvidenceType = 'explicit' | 'implicit' | 'weak'

export interface PhraseConfig {
  id: string
  phrase: string // ステータス名
  description?: string // ステータス定義（どのような状態か）
  hintType: HintType // ヒントタイプ
  hintText: string // 固定ヒント（hintType='fixed'の場合）
  enabled: boolean
}

export interface PhraseDetection {
  id: string
  phrase: string // ステータス名
  detected: boolean
  detectedAt?: number
  detectedExpression?: string // ステータス移行を示す発話内容
  hintText: string
  // 品質情報（拡張）
  confidence?: number // LLMの確信度 (0.0-1.0)
  evidenceType?: EvidenceType // 根拠タイプ
  asrQualityScore?: number // ASR品質スコア (0.0-1.0)
}

// 短期間の検出履歴（リングバッファ用）
export interface RecentDetection {
  phrase: string
  confidence: number
  evidenceType: EvidenceType
  detectedAt: number
}

// 音声チャンク品質情報
export interface AudioChunkQuality {
  durationMs: number // チャンク長
  rmsDb: number // RMS（dB）
  voicedRatio: number // 有声区間の割合 (0.0-1.0)
  skipDetection: boolean // LLM判定をスキップするか
}

// ヒントの状態（仮判定→確定の二段階）
export type HintStatus = 'none' | 'provisional' | 'confirmed'

export interface HintState {
  status: HintStatus
  phraseId: string | null
  hintText: string
  detectedAt: number | null
  statusName: string | null // 現在のステータス名
}

// 現在の会話ステータス
export interface CurrentStatus {
  index: number // 現在のステータスインデックス（-1: 未開始）
  name: string | null // 現在のステータス名
  changedAt: number | null // ステータス変更時刻
  recentDetections: RecentDetection[] // 短期間の検出履歴（リングバッファ）
}

export interface AudioMetadata {
  volume: number
  volumeDb: number
  timestamp: number
  isSpeechDetected: boolean
  lastSpeechTimestamp: number
  silenceDuration: number
  phraseDetections: PhraseDetection[]
  lastTranscript?: string // 内部保持用（UI非表示）
}

export interface HintCondition {
  shouldShowHint: boolean
  reason?: string
}

export interface RealtimeConfig {
  instructions?: string
  debounceMs?: number // 連続発火抑止時間（デフォルト1500ms）
  confirmDelayMs?: number // 仮判定→確定までの待機時間（デフォルト800ms）
  hintGenerationPrompt?: string // AIヒント生成プロンプト
  getConversationHistory?: () => string[] // 会話履歴を取得する関数
}

const SAMPLE_RATE = 24000

// クライアント側VAD設定
const VAD_CONFIG = {
  speechThresholdDb: -35, // 発話開始閾値（dB）
  silenceThresholdDb: -45, // 無音閾値（dB）
  minSpeechDurationMs: 100, // 最小発話継続時間
  minSilenceDurationMs: 150, // 最小無音継続時間（commit判定用）
}

// Gate A: 音声品質ゲート設定
const AUDIO_QUALITY_GATE = {
  minDurationMs: 250, // 最小チャンク長（これ未満はskipDetection）
  minVoicedRatio: 0.2, // 最小有声区間割合（これ未満はskipDetection）
  minRmsDb: -50, // 最小RMS（これ未満はskipDetection）- 緩和
}

// Gate B: ASR品質ゲート設定
const ASR_QUALITY_GATE = {
  minScore: 0.5, // ASR品質スコアの最小値（これ未満はLLM判定スキップ）
  minCharCount: 6, // 最小文字数
}

// Gate C: ステータス確定ゲート設定
const STATUS_CONFIRM_GATE = {
  highConfidenceThreshold: 0.85, // 高信頼度閾値（1回で確定）
  minConfidenceThreshold: 0.75, // 最低信頼度閾値（これ未満は無視）
  multiHitWindowMs: 1500, // 複数ヒット判定ウィンドウ（ms）
  multiHitCount: 2, // 確定に必要なヒット数（中信頼度の場合）
  recentDetectionsMaxSize: 10, // リングバッファサイズ
}

/**
 * Whisperのhallucination（幻覚）パターン
 * 無音やノイズに対して出力されやすいフレーズ
 */
const HALLUCINATION_PATTERNS = [
  // YouTube/動画関連
  /ご視聴ありがとうございました/,
  /字幕.*作成/,
  /チャンネル登録/,
  /高評価.*お願い/,
  /ご覧いただき.*ありがとう/,
  /次回.*お楽しみ/,
  /チャンネル.*登録/,
  /グッド.*ボタン/,
  /コメント.*お願い/,
  /動画.*見て/,
  // 挨拶・定型句
  /おやすみなさい/,
  /ありがとうございました/,
  /お疲れ様でした/,
  // 記号のみ
  /^\.+$/, // ドットのみ
  /^…+$/, // 三点リーダーのみ
  /^[、。,.!?！？\s]+$/, // 句読点のみ
  // 短すぎる無意味な出力
  /^.{1,2}$/, // 1-2文字のみ
  // 繰り返しパターン（同じ文字が3回以上連続）
  /(.)\1{2,}/,
  // 音声ノイズ系
  /^[あうえおん]+$/, // 母音のみの繰り返し
  /^ん+$/,
  /^はい+$/,
  /^えー+$/,
  /^あー+$/,
  /^うー+$/,
]

/**
 * hallucinationかどうかをチェック
 */
function isHallucination(text: string): boolean {
  const trimmed = text.trim()

  // 空文字列
  if (!trimmed) return true

  // 非常に短い出力（3文字未満）は無視
  if (trimmed.length < 3) return true

  // パターンマッチ
  return HALLUCINATION_PATTERNS.some(pattern => pattern.test(trimmed))
}

/**
 * Gate B: ASR品質スコアを計算
 * @returns 0.0-1.0 のスコア（高いほど品質が良い）
 */
function calculateAsrQualityScore(text: string): number {
  const trimmed = text.trim()

  // 空または非常に短い → 最低スコア
  if (!trimmed || trimmed.length < 3) return 0

  let score = 1.0

  // 文字数ペナルティ（6文字未満は減点）
  if (trimmed.length < ASR_QUALITY_GATE.minCharCount) {
    score *= 0.3 + (trimmed.length / ASR_QUALITY_GATE.minCharCount) * 0.4
  }

  // 同一短語の繰り返しチェック（例：「はいはいはい」）
  const words = trimmed.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g) || []
  if (words.length > 0) {
    const uniqueWords = new Set(words)
    if (uniqueWords.size === 1 && words.length >= 2) {
      score *= 0.4 // 同じ単語の繰り返し
    }
  }

  // 定型幻覚パターンにマッチ → 大幅減点
  if (HALLUCINATION_PATTERNS.some(pattern => pattern.test(trimmed))) {
    score *= 0.2
  }

  // フィラー語のみ（えー、あー、うー など）
  if (/^[えあうおんー]+$/.test(trimmed)) {
    score *= 0.3
  }

  // 句読点・記号の割合が高い
  const punctuationRatio = (trimmed.match(/[、。,.!?！？\s]/g) || []).length / trimmed.length
  if (punctuationRatio > 0.3) {
    score *= 0.5
  }

  return Math.max(0, Math.min(1, score))
}


export function useRealtimeAPI() {
  const isConnected = ref(false)
  const isPlaying = ref(false)
  const isRecording = ref(false)
  const isSpeaking = ref(false)
  const connectionStatus = ref('disconnected')
  const registeredPhrases = ref<PhraseConfig[]>([])

  // ヒント状態（仮判定→確定の二段階）
  const hintState = ref<HintState>({
    status: 'none',
    phraseId: null,
    hintText: '',
    detectedAt: null,
    statusName: null,
  })

  // 現在の会話ステータス
  const currentStatus = ref<CurrentStatus>({
    index: -1, // -1: 未開始
    name: null,
    changedAt: null,
    recentDetections: [],
  })

  const audioMetadata = ref<AudioMetadata>({
    volume: 0,
    volumeDb: -100,
    timestamp: 0,
    isSpeechDetected: false,
    lastSpeechTimestamp: 0,
    silenceDuration: 0,
    phraseDetections: [],
    lastTranscript: undefined,
  })

  const onAIResponse = ref<((text: string, isFinal: boolean) => void) | null>(null)
  const onHintCheck = ref<((metadata: AudioMetadata) => HintCondition) | null>(null)
  const onPhraseDetected = ref<((phrase: string, metadata: AudioMetadata, isProvisional: boolean) => void) | null>(null)
  const onHintConfirmed = ref<((hintText: string) => void) | null>(null)
  const onTranscript = ref<((transcript: string, isFinal: boolean) => void) | null>(null)
  const onLog = ref<((step: string) => void) | null>(null)
  const onError = ref<((error: string) => void) | null>(null)

  let websocket: WebSocket | null = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let scriptProcessor: ScriptProcessorNode | null = null
  let playbackQueue: Float32Array<ArrayBuffer>[] = []
  let isPlayingAudio = false

  // クライアント側VAD用の状態
  let lastCommitTime = 0
  let speechStartTime = 0
  let silenceStartTime = 0
  let isInSpeech = false
  let hasPendingAudio = false // commit待ちの音声があるか
  let isResponseInProgress = false // レスポンス処理中かどうか

  // Gate A: 音声チャンク品質計測用
  let chunkStartTime = 0 // チャンク開始時刻
  let chunkVoicedSamples = 0 // 有声サンプル数
  let chunkTotalSamples = 0 // 総サンプル数
  let chunkRmsSum = 0 // RMS累積（平均計算用）
  let chunkRmsCount = 0 // RMSサンプル数
  let currentChunkQuality: AudioChunkQuality | null = null // 現在のチャンク品質

  // gpt-4o-transcribe用: 音声バッファ
  let audioChunkBuffer: Int16Array[] = []

  // デバウンス用
  let lastHintTriggerTime: Record<string, number> = {}
  let confirmTimer: ReturnType<typeof setTimeout> | null = null

  // 設定値
  let debounceMs = 1500
  let confirmDelayMs = 800
  let hintGenerationPrompt = '検出された内容に応じて、営業マンとして次にやるべきことの適切なヒントを、10文字以内で出して'
  let getConversationHistory: (() => string[]) | null = null

  /**
   * LLM用プロンプトを構築（会話ステータス判定）
   */
  function buildInstructions(_baseInstructions: string, phrases: PhraseConfig[]): string {
    const enabledPhrases = phrases.filter(p => p.enabled)

    if (enabledPhrases.length === 0) {
      return `あなたは会話のステータスを判定するシステムです。
通常のテキスト返答は一切行わないでください。
現在、判定対象のステータスは登録されていません。`
    }

    // 現在のステータス情報
    const currentStatusInfo = currentStatus.value.index === -1
      ? '会話開始前（最初のステータス「' + enabledPhrases[0]?.phrase + '」への移行を待機中）'
      : `${currentStatus.value.index + 1}. 「${currentStatus.value.name}」`

    const instructions = `あなたは会話の進行状況を追跡し、現在のステータスを判定するシステムです。

【重要なルール】
- 通常のテキスト返答は一切行わないでください
- ステータスの移行を検出した場合のみ detect_phrase 関数を呼び出してください
- ステータス移行が検出されなかった場合は何も返さないでください（abstain）
- 会話は基本的に順番通りに進みますが、前後したり戻ったりする可能性もあります

【確信度と根拠タイプのルール】
detect_phrase を呼び出す際は、必ず confidence と evidence_type を正確に評価してください：

confidence（確信度）:
- 0.85以上: 非常に高い確信（明確な言及がある）
- 0.75-0.84: 高い確信（文脈から強く推測できる）
- 0.75未満: 不十分 → detect_phrase を呼び出さないこと

evidence_type（根拠タイプ）:
- explicit: 話者が明示的にそのステータスに関する内容を述べた
- implicit: 直接的な言及はないが、文脈から高い確度で推測できる
- weak: 弱い根拠や推測のみ → detect_phrase を呼び出さないこと

【絶対に守ること】
- confidence < 0.75 の場合は絶対に detect_phrase を呼び出さない
- evidence_type = 'weak' の場合は絶対に detect_phrase を呼び出さない
- 曖昧な場合、推測の場合は何も返さない（過検出より見逃しを選ぶ）

【現在のステータス】
${currentStatusInfo}

【ステータス一覧】（順番に進む想定だが、前後する可能性あり）
${enabledPhrases.map((p, index) => {
  const desc = p.description ? `: ${p.description}` : ''
  const isCurrent = currentStatus.value.index === index ? ' ← 現在' : ''
  return `${index + 1}. 「${p.phrase}」${desc}${isCurrent}`
}).join('\n')}

→ ステータス移行を検出した場合、detected_expression に実際に聞こえた発話内容を正確に引用してください。
`

    return instructions
  }

  /**
   * LLM用ツール定義を構築（ステータス判定）
   * Gate C: confidence と evidence_type を返すように拡張
   */
  function buildTools(phrases: PhraseConfig[]) {
    const enabledPhrases = phrases.filter(p => p.enabled)

    if (enabledPhrases.length === 0) {
      return []
    }

    return [
      {
        type: 'function',
        name: 'detect_phrase',
        description: `会話のステータスが移行したことを検出した場合に呼び出す。
【重要】confidence >= 0.75 かつ evidence_type != 'weak' の場合のみ呼び出すこと。
少しでも曖昧な場合は呼び出さず、何も返さないこと（abstain）。`,
        parameters: {
          type: 'object',
          properties: {
            phrase: {
              type: 'string',
              description: '移行先のステータス名',
              enum: enabledPhrases.map(p => p.phrase),
            },
            detected_expression: {
              type: 'string',
              description: 'ステータス移行を示す発話内容（実際に聞こえた言葉を引用）',
            },
            confidence: {
              type: 'number',
              description: '確信度（0.0〜1.0）。0.75未満なら呼び出さないこと。',
              minimum: 0,
              maximum: 1,
            },
            evidence_type: {
              type: 'string',
              description: '根拠タイプ: explicit=明示的な言及, implicit=文脈からの推測, weak=弱い根拠',
              enum: ['explicit', 'implicit', 'weak'],
            },
          },
          required: ['phrase', 'detected_expression', 'confidence', 'evidence_type'],
        },
      },
    ]
  }

  // buildInputAudioTranscription は削除（gpt-4o-transcribeを使用するため不要）

  function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2)
    const view = new DataView(buffer)
    for (let i = 0; i < float32Array.length; i++) {
      const val = float32Array[i]
      if (val !== undefined) {
        const s = Math.max(-1, Math.min(1, val))
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      }
    }
    return buffer
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      const charCode = binaryString.charCodeAt(i)
      bytes[i] = charCode
    }
    return bytes.buffer
  }

  // arrayBufferToBase64 は削除（Realtime APIへの音声送信は行わないため）

  function pcm16ToFloat32(pcm16: ArrayBuffer): Float32Array<ArrayBuffer> {
    const int16Array = new Int16Array(pcm16)
    const float32Array = new Float32Array(int16Array.length)
    for (let i = 0; i < int16Array.length; i++) {
      const val = int16Array[i]
      if (val !== undefined) {
        float32Array[i] = val / 32768
      }
    }
    return float32Array
  }

  async function playAudioChunk(audioData: Float32Array<ArrayBuffer>) {
    if (!audioContext) return

    playbackQueue.push(audioData)

    if (!isPlayingAudio) {
      isPlayingAudio = true
      processPlaybackQueue()
    }
  }

  async function processPlaybackQueue() {
    if (!audioContext || playbackQueue.length === 0) {
      isPlayingAudio = false
      isPlaying.value = false
      return
    }

    isPlaying.value = true
    const audioData = playbackQueue.shift()!

    const audioBuffer = audioContext.createBuffer(1, audioData.length, SAMPLE_RATE)
    audioBuffer.copyToChannel(audioData, 0)

    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContext.destination)

    source.onended = () => {
      processPlaybackQueue()
    }

    source.start()
  }

  function sendEvent(event: Record<string, unknown>) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify(event))
    }
  }

  /**
   * Gate A: 音声チャンク品質を評価
   */
  function evaluateChunkQuality(): AudioChunkQuality {
    const now = Date.now()
    const durationMs = chunkStartTime > 0 ? now - chunkStartTime : 0
    const voicedRatio = chunkTotalSamples > 0 ? chunkVoicedSamples / chunkTotalSamples : 0
    const avgRmsDb = chunkRmsCount > 0 ? chunkRmsSum / chunkRmsCount : -100

    // Gate A判定: 品質が低い場合はskipDetection=true
    const skipDetection = durationMs < AUDIO_QUALITY_GATE.minDurationMs
      || voicedRatio < AUDIO_QUALITY_GATE.minVoicedRatio
      || avgRmsDb < AUDIO_QUALITY_GATE.minRmsDb

    return {
      durationMs,
      rmsDb: avgRmsDb,
      voicedRatio,
      skipDetection,
    }
  }

  /**
   * チャンク品質計測をリセット
   */
  function resetChunkQuality() {
    chunkStartTime = Date.now()
    chunkVoicedSamples = 0
    chunkTotalSamples = 0
    chunkRmsSum = 0
    chunkRmsCount = 0
    currentChunkQuality = null
    audioChunkBuffer = [] // 音声バッファもリセット
  }

  /**
   * gpt-4o-transcribeで文字起こし
   */
  async function transcribeWithGpt4o(audioData: Int16Array): Promise<string | null> {
    try {
      // Int16ArrayをBase64に変換
      const uint8Array = new Uint8Array(audioData.buffer)
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]!)
      }
      const base64Audio = btoa(binary)

      const response = await $fetch<{ text: string }>('/api/transcribe', {
        method: 'POST',
        body: { audio: base64Audio },
      })

      return response.text || null
    }
    catch (error) {
      console.error('gpt-4o-transcribe error:', error)
      return null
    }
  }

  /**
   * 音声バッファをcommitする
   * gpt-4o-transcribeで文字起こしし、Realtime APIのLLMでステータス判定
   */
  async function commitAudioBuffer() {
    if (!hasPendingAudio) return

    // レスポンス処理中は新しいcommitをスキップ
    if (isResponseInProgress) {
      if (onLog.value) onLog.value(`[2] commit スキップ（処理中）`)
      return
    }

    const now = Date.now()

    // Gate A: 音声品質を評価
    currentChunkQuality = evaluateChunkQuality()

    if (currentChunkQuality.skipDetection) {
      // 低品質の場合は文字起こし自体をスキップ
      hasPendingAudio = false
      lastCommitTime = now
      resetChunkQuality()
      return
    }

    // 音声バッファを結合
    if (audioChunkBuffer.length === 0) {
      hasPendingAudio = false
      lastCommitTime = now
      resetChunkQuality()
      return
    }

    const totalLength = audioChunkBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
    const combinedAudio = new Int16Array(totalLength)
    let offset = 0
    for (const chunk of audioChunkBuffer) {
      combinedAudio.set(chunk, offset)
      offset += chunk.length
    }

    hasPendingAudio = false
    lastCommitTime = now

    // 音声バッファをリセット（次のチャンク用）
    resetChunkQuality()

    // gpt-4o-transcribeで文字起こし（非同期）
    isResponseInProgress = true
    const transcript = await transcribeWithGpt4o(combinedAudio)

    if (!transcript) {
      isResponseInProgress = false
      return
    }

    // hallucinationチェック
    if (isHallucination(transcript)) {
      isResponseInProgress = false
      return
    }

    // Gate B: ASR品質スコアを計算
    const asrScore = calculateAsrQualityScore(transcript)

    audioMetadata.value.lastTranscript = transcript

    if (asrScore < ASR_QUALITY_GATE.minScore) {
      // 文字起こしは表示するが、LLM判定はスキップ
      if (onTranscript.value) onTranscript.value(transcript, true)
      isResponseInProgress = false
      return
    }

    if (onLog.value) onLog.value(`文字起こし完了「${transcript}」`)
    if (onTranscript.value) onTranscript.value(transcript, true)

    // Realtime APIにテキストとしてメッセージを送信し、LLMでステータス判定
    sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `【文字起こし】${transcript}`,
          },
        ],
      },
    })

    // LLMにレスポンスを要求
    sendEvent({
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    })
  }

  /**
   * 仮判定を開始する
   */
  function startProvisionalHint(phraseId: string, hintText: string, statusName: string) {
    const now = Date.now()

    // デバウンスチェック
    const lastTrigger = lastHintTriggerTime[phraseId] || 0
    if (now - lastTrigger < debounceMs) {
      return
    }

    // 既存の確定タイマーをキャンセル
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }

    // 現在のステータスを更新
    const enabledPhrases = registeredPhrases.value.filter(p => p.enabled)
    const statusIndex = enabledPhrases.findIndex(p => p.phrase === statusName)
    currentStatus.value = {
      index: statusIndex,
      name: statusName,
      changedAt: now,
      recentDetections: currentStatus.value.recentDetections,
    }

    // 仮判定状態に移行
    hintState.value = {
      status: 'provisional',
      phraseId,
      hintText,
      detectedAt: now,
      statusName,
    }

    lastHintTriggerTime[phraseId] = now

    // 確定タイマーを開始
    confirmTimer = setTimeout(() => {
      confirmHint()
    }, confirmDelayMs)
  }

  /**
   * ヒントを確定する
   */
  function confirmHint() {
    if (hintState.value.status !== 'provisional') return

    // 確定タイマーをクリア（即時確定の場合のため）
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }

    hintState.value.status = 'confirmed'

    if (onHintConfirmed.value) {
      onHintConfirmed.value(hintState.value.hintText)
    }
  }

  /**
   * ヒントをキャンセルする（仮判定中のみ）
   */
  function cancelProvisionalHint() {
    if (hintState.value.status !== 'provisional') return

    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }

    hintState.value = {
      status: 'none',
      phraseId: null,
      hintText: '',
      detectedAt: null,
      statusName: null,
    }
  }

  /**
   * ヒントをリセットする
   */
  function resetHint() {
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }

    hintState.value = {
      status: 'none',
      phraseId: null,
      hintText: '',
      detectedAt: null,
      statusName: null,
    }
  }

  /**
   * ステータスをリセットする
   */
  function resetStatus() {
    currentStatus.value = {
      index: -1,
      name: null,
      changedAt: null,
      recentDetections: [],
    }
  }

  /**
   * AIヒントを生成する
   */
  async function generateAIHint(detectedPhrase: string, detectedExpression: string): Promise<string> {
    try {
      const conversationHistory = getConversationHistory ? getConversationHistory() : []
      const historyText = conversationHistory.length > 0
        ? `【会話履歴】\n${conversationHistory.slice(-10).join('\n')}`
        : ''

      const response = await $fetch<{ hint: string }>('/api/generate-hint', {
        method: 'POST',
        body: {
          prompt: hintGenerationPrompt,
          detectedPhrase,
          detectedExpression,
          conversationHistory: historyText,
        },
      })

      return response.hint || 'ヒントを生成できませんでした'
    }
    catch (error) {
      console.error('AIヒント生成エラー:', error)
      return 'ヒント生成エラー'
    }
  }

  function handleWebSocketMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'session.created':
          connectionStatus.value = 'connected'
          isConnected.value = true
          break

        case 'session.updated':
          console.log('Session updated:', data)
          break

        // サーバー側VADイベントは無視（クライアント側VADを使用）
        case 'input_audio_buffer.speech_started':
        case 'input_audio_buffer.speech_stopped':
          break

        // input_audio_transcription.completed は使用しない（gpt-4o-transcribeを使用）
        case 'conversation.item.input_audio_transcription.completed':
          // gpt-4o-transcribeで処理するため無視
          break

        case 'response.audio.delta':
          if (data.delta) {
            const pcmData = base64ToArrayBuffer(data.delta)
            const floatData = pcm16ToFloat32(pcmData)
            playAudioChunk(floatData)
          }
          break

        case 'response.audio_transcript.delta':
          if (data.delta && onAIResponse.value) {
            onAIResponse.value(data.delta, false)
          }
          break

        case 'response.audio_transcript.done':
          if (data.transcript && onAIResponse.value) {
            onAIResponse.value(data.transcript, true)
          }
          break

        // LLMによるtool call（semantic/context判定）
        case 'response.function_call_arguments.done':
          handleFunctionCall(data)
          break

        // レスポンス完了
        case 'response.done':
          isResponseInProgress = false
          break

        case 'error':
          isResponseInProgress = false
          console.error('WebSocket error:', data.error)
          if (onError.value) {
            onError.value(data.error?.message || 'Unknown error')
          }
          break
      }
    }
    catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  /**
   * recentDetectionsにエントリを追加（リングバッファ）
   */
  function addRecentDetection(phrase: string, confidence: number, evidenceType: EvidenceType) {
    const now = Date.now()
    const detection: RecentDetection = {
      phrase,
      confidence,
      evidenceType,
      detectedAt: now,
    }

    // 古いエントリを削除（ウィンドウ外のもの）
    currentStatus.value.recentDetections = currentStatus.value.recentDetections.filter(
      d => now - d.detectedAt < STATUS_CONFIRM_GATE.multiHitWindowMs,
    )

    // 新しいエントリを追加
    currentStatus.value.recentDetections.push(detection)

    // サイズ制限
    if (currentStatus.value.recentDetections.length > STATUS_CONFIRM_GATE.recentDetectionsMaxSize) {
      currentStatus.value.recentDetections.shift()
    }
  }

  /**
   * 同一phraseの短期間ヒット数をカウント
   */
  function countRecentHits(phrase: string): number {
    const now = Date.now()
    return currentStatus.value.recentDetections.filter(
      d => d.phrase === phrase && now - d.detectedAt < STATUS_CONFIRM_GATE.multiHitWindowMs,
    ).length
  }

  /**
   * LLMからのtool call処理（Gate C: confidence/evidence_type による確定ゲート）
   */
  async function handleFunctionCall(data: Record<string, unknown>) {
    if (data.name === 'detect_phrase') {
      try {
        const args = JSON.parse(data.arguments as string)
        const phrase = args.phrase as string
        const detectedExpression = args.detected_expression as string | undefined
        const confidence = (args.confidence as number) ?? 0.5
        const evidenceType = (args.evidence_type as EvidenceType) ?? 'weak'

        // Gate C: 最低信頼度チェック
        if (confidence < STATUS_CONFIRM_GATE.minConfidenceThreshold) {
          return
        }

        // Gate C: weak根拠は無視
        if (evidenceType === 'weak') {
          return
        }

        const detection = audioMetadata.value.phraseDetections.find(
          p => p.phrase === phrase,
        )

        // 対応するPhraseConfigを取得
        const phraseConfig = registeredPhrases.value.find(p => p.phrase === phrase)

        if (detection && phraseConfig) {
          detection.detected = true
          detection.detectedAt = Date.now()
          detection.confidence = confidence
          detection.evidenceType = evidenceType
          if (detectedExpression) {
            detection.detectedExpression = detectedExpression
          }

          // リングバッファに追加
          addRecentDetection(phrase, confidence, evidenceType)

          // ステータス判定ログ（判定理由を含む）
          if (onLog.value) {
            const reason = detectedExpression ? `「${detectedExpression}」` : ''
            onLog.value(`ステータス判定「${phrase}」${reason}`)
          }

          if (onPhraseDetected.value) {
            onPhraseDetected.value(phrase, audioMetadata.value, false)
          }

          // ヒントテキストを決定（固定 or AI生成）
          let hintText = detection.hintText
          if (phraseConfig.hintType === 'ai') {
            hintText = await generateAIHint(phrase, detectedExpression || phrase)
          }

          // Gate C: 確定条件の判定
          const isHighConfidence = confidence >= STATUS_CONFIRM_GATE.highConfidenceThreshold
            && evidenceType === 'explicit'
          const hitCount = countRecentHits(phrase)

          if (isHighConfidence) {
            // 強根拠: 1回で確定
            if (hintState.value.status === 'provisional' && hintState.value.phraseId !== detection.id) {
              cancelProvisionalHint()
            }
            startProvisionalHint(detection.id, hintText, phrase)
            confirmHint()
          }
          else if (hitCount >= STATUS_CONFIRM_GATE.multiHitCount) {
            // 中信頼度だが複数ヒット: 確定
            if (hintState.value.status === 'provisional' && hintState.value.phraseId !== detection.id) {
              cancelProvisionalHint()
            }
            startProvisionalHint(detection.id, hintText, phrase)
            confirmHint()
          }
          else {
            // 中信頼度で初回: 仮判定を開始し、confirmDelayMs後に確定
            if (hintState.value.status === 'provisional' && hintState.value.statusName !== phrase) {
              cancelProvisionalHint()
            }
            startProvisionalHint(detection.id, hintText, phrase)
          }
        }

        sendEvent({
          type: 'response.create',
          response: {
            modalities: ['text'],
          },
        })
      }
      catch (error) {
        console.error('Failed to parse function call arguments:', error)
      }
    }
  }

  async function startAudioCapture() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      const source = audioContext.createMediaStreamSource(mediaStream)
      scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1)

      scriptProcessor.onaudioprocess = (audioEvent) => {
        const inputData = audioEvent.inputBuffer.getChannelData(0)
        const now = Date.now()

        // RMS計算
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          const sample = inputData[i] ?? 0
          sum += sample * sample
        }
        const rms = Math.sqrt(sum / inputData.length)
        const db = 20 * Math.log10(rms + 0.0001)

        audioMetadata.value.volume = Math.min(1, rms * 10)
        audioMetadata.value.volumeDb = Math.max(-100, db)
        audioMetadata.value.timestamp = now

        // 音声データをローカルバッファに蓄積（gpt-4o-transcribe用）
        const pcmData = floatTo16BitPCM(inputData)
        audioChunkBuffer.push(new Int16Array(pcmData))
        hasPendingAudio = true

        // Gate A: チャンク品質計測データを収集
        if (chunkStartTime === 0) {
          chunkStartTime = now
        }
        chunkTotalSamples += inputData.length
        chunkRmsSum += db
        chunkRmsCount += 1
        // 有声判定（speechThresholdより上なら有声とカウント）
        if (db > VAD_CONFIG.speechThresholdDb) {
          chunkVoicedSamples += inputData.length
        }

        // クライアント側VAD判定
        const isSpeechNow = db > VAD_CONFIG.speechThresholdDb
        const isSilenceNow = db < VAD_CONFIG.silenceThresholdDb

        if (isSpeechNow && !isInSpeech) {
          // 発話開始
          if (speechStartTime === 0) {
            speechStartTime = now
          }
          else if (now - speechStartTime >= VAD_CONFIG.minSpeechDurationMs) {
            isInSpeech = true
            isSpeaking.value = true
            audioMetadata.value.isSpeechDetected = true
            audioMetadata.value.lastSpeechTimestamp = now
            audioMetadata.value.silenceDuration = 0
            silenceStartTime = 0
            if (onLog.value) onLog.value('発話開始')
          }
        }
        else if (!isSpeechNow) {
          speechStartTime = 0
        }

        if (isSilenceNow && isInSpeech) {
          // 無音検出
          if (silenceStartTime === 0) {
            silenceStartTime = now
          }

          // 発話終了判定（150ms無音でcommit）
          if (now - silenceStartTime >= 150) {
            isInSpeech = false
            isSpeaking.value = false
            audioMetadata.value.isSpeechDetected = false
            audioMetadata.value.silenceDuration = now - audioMetadata.value.lastSpeechTimestamp
            if (onLog.value) onLog.value('発話終了')
            // 発話終了時にまとめてcommit
            commitAudioBuffer()
          }
        }
        else if (!isSilenceNow) {
          silenceStartTime = 0
        }

        // 長時間発話の場合は定期的にcommit（5秒以上）
        if (isInSpeech && now - lastCommitTime >= 5000) {
          commitAudioBuffer()
        }
      }

      source.connect(scriptProcessor)
      scriptProcessor.connect(audioContext.destination)
      isRecording.value = true
    }
    catch (error) {
      console.error('Failed to start audio capture:', error)
      if (onError.value) {
        onError.value('マイクへのアクセスに失敗しました')
      }
    }
  }

  function stopAudioCapture() {
    if (scriptProcessor) {
      scriptProcessor.disconnect()
      scriptProcessor = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }

    if (audioContext) {
      audioContext.close()
      audioContext = null
    }

    isRecording.value = false
    isSpeaking.value = false
    isInSpeech = false
    hasPendingAudio = false
    speechStartTime = 0
    silenceStartTime = 0
  }

  async function startRoleplay(config?: RealtimeConfig) {
    connectionStatus.value = 'connecting'

    // 設定値を適用
    debounceMs = config?.debounceMs ?? 1500
    confirmDelayMs = config?.confirmDelayMs ?? 800
    hintGenerationPrompt = config?.hintGenerationPrompt ?? '検出された内容に応じて、営業マンとして次にやるべきことの適切なヒントを、10文字以内で出して'
    getConversationHistory = config?.getConversationHistory ?? null

    try {
      const response = await $fetch<{ client_secret: string }>('/api/realtime-session', {
        method: 'POST',
      })

      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`

      websocket = new WebSocket(wsUrl, [
        'realtime',
        `openai-insecure-api-key.${response.client_secret}`,
        'openai-beta.realtime-v1',
      ])

      websocket.onopen = () => {
        console.log('WebSocket connected')

        const tools = buildTools(registeredPhrases.value)
        const instructions = buildInstructions(
          config?.instructions || '',
          registeredPhrases.value,
        )

        // gpt-4o-transcribeを使用するため、音声入力は使わずテキストのみ
        sendEvent({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions,
            // 音声入力関連は無効化（文字起こしはgpt-4o-transcribeで別途行う）
            turn_detection: null,
            tools,
            tool_choice: tools.length > 0 ? 'auto' : 'none',
          },
        })

        startAudioCapture()
      }

      websocket.onmessage = handleWebSocketMessage

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error)
        connectionStatus.value = 'error'
        if (onError.value) {
          onError.value('WebSocket接続エラー')
        }
      }

      websocket.onclose = () => {
        console.log('WebSocket closed')
        isConnected.value = false
        connectionStatus.value = 'disconnected'
        stopAudioCapture()
      }
    }
    catch (error) {
      console.error('Failed to start roleplay:', error)
      connectionStatus.value = 'error'
      if (onError.value) {
        onError.value('接続の開始に失敗しました')
      }
    }
  }

  function stopRoleplay() {
    stopAudioCapture()
    resetHint()

    if (websocket) {
      websocket.close()
      websocket = null
    }

    isConnected.value = false
    connectionStatus.value = 'disconnected'
    playbackQueue = []
    isPlayingAudio = false
    isPlaying.value = false
    lastHintTriggerTime = {}
    isResponseInProgress = false
  }

  async function toggleRoleplay(config?: RealtimeConfig) {
    if (isConnected.value) {
      stopRoleplay()
    }
    else {
      await startRoleplay(config)
    }
  }

  function updateInstructions(instructions: string) {
    const tools = buildTools(registeredPhrases.value)
    const fullInstructions = buildInstructions(instructions, registeredPhrases.value)

    sendEvent({
      type: 'session.update',
      session: {
        instructions: fullInstructions,
        tools,
        tool_choice: tools.length > 0 ? 'auto' : 'none',
      },
    })
  }

  function manualRequestHint() {
    sendEvent({
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    })
  }

  function setRegisteredPhrases(phrases: PhraseConfig[]) {
    registeredPhrases.value = phrases
    audioMetadata.value.phraseDetections = phrases.filter(p => p.enabled).map(p => ({
      id: p.id,
      phrase: p.phrase,
      detected: false,
      hintText: p.hintText,
    }))
  }

  function resetPhraseDetections() {
    audioMetadata.value.phraseDetections = audioMetadata.value.phraseDetections.map(p => ({
      ...p,
      detected: false,
      detectedAt: undefined,
      detectedExpression: undefined,
    }))
    audioMetadata.value.lastTranscript = undefined
    resetHint()
    resetStatus()
    lastHintTriggerTime = {}
  }

  onUnmounted(() => {
    stopRoleplay()
  })

  return {
    isConnected,
    isPlaying,
    isRecording,
    isSpeaking,
    connectionStatus,
    audioMetadata,
    registeredPhrases,
    hintState,
    currentStatus,

    toggleRoleplay,
    startRoleplay,
    stopRoleplay,
    updateInstructions,
    manualRequestHint,
    setRegisteredPhrases,
    resetPhraseDetections,
    cancelProvisionalHint,
    confirmHint,

    onAIResponse,
    onHintCheck,
    onPhraseDetected,
    onHintConfirmed,
    onTranscript,
    onLog,
    onError,
  }
}

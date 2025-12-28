export type MatchType = 'exact' | 'semantic' | 'context'
export type HintType = 'fixed' | 'ai' // 固定ヒント or AIヒント

export interface PhraseConfig {
  id: string
  phrase: string // 検出対象
  matchType: MatchType // 一致タイプ
  description?: string // 検出条件（意味一致/文脈一致の場合）
  hintType: HintType // ヒントタイプ
  hintText: string // 固定ヒント（hintType='fixed'の場合）
  enabled: boolean
}

export interface PhraseDetection {
  id: string
  phrase: string
  matchType: MatchType
  detected: boolean
  detectedAt?: number
  detectedExpression?: string
  hintText: string
}

// ヒントの状態（仮判定→確定の二段階）
export type HintStatus = 'none' | 'provisional' | 'confirmed'

export interface HintState {
  status: HintStatus
  phraseId: string | null
  hintText: string
  detectedAt: number | null
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
  commitIntervalMs?: number // 小刻みcommit間隔（デフォルト300ms）
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

/**
 * Whisperのhallucination（幻覚）パターン
 * 無音やノイズに対して出力されやすいフレーズ
 */
const HALLUCINATION_PATTERNS = [
  /ご視聴ありがとうございました/,
  /字幕.*作成/,
  /チャンネル登録/,
  /高評価.*お願い/,
  /ご覧いただき.*ありがとう/,
  /次回.*お楽しみ/,
  /おやすみなさい/,
  /^\.+$/, // ドットのみ
  /^…+$/, // 三点リーダーのみ
]

/**
 * hallucinationかどうかをチェック
 */
function isHallucination(text: string): boolean {
  return HALLUCINATION_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * 文字列を正規化する（完全一致判定用）
 */
function normalizeText(text: string): string {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .toLowerCase()
    .replace(/[、。,.!?！？・\-ー〜～「」『』（）()[\]【】]/g, '')
    .replace(/\s+/g, '')
    .replace(/[\u3041-\u3096]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60))
}

/**
 * 完全一致判定（deterministic）
 */
function checkExactMatch(transcript: string, phrases: PhraseConfig[]): PhraseConfig | null {
  const normalizedTranscript = normalizeText(transcript)

  for (const phrase of phrases) {
    if (phrase.matchType !== 'exact' || !phrase.enabled) continue

    const normalizedPhrase = normalizeText(phrase.phrase)
    if (normalizedTranscript.includes(normalizedPhrase)) {
      return phrase
    }
  }
  return null
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

  // デバウンス用
  let lastHintTriggerTime: Record<string, number> = {}
  let confirmTimer: ReturnType<typeof setTimeout> | null = null

  // 設定値
  let commitIntervalMs = 300
  let debounceMs = 1500
  let confirmDelayMs = 800
  let hintGenerationPrompt = '検出された内容に応じて、営業マンとして次にやるべきことの適切なヒントを、10文字以内で出して'
  let getConversationHistory: (() => string[]) | null = null

  /**
   * LLM用プロンプトを構築（semantic/context判定専用）
   */
  function buildInstructions(_baseInstructions: string, phrases: PhraseConfig[]): string {
    const semanticPhrases = phrases.filter(p => p.enabled && p.matchType === 'semantic')
    const contextPhrases = phrases.filter(p => p.enabled && p.matchType === 'context')

    if (semanticPhrases.length === 0 && contextPhrases.length === 0) {
      return `あなたは音声認識結果を処理するシステムです。
通常のテキスト返答は一切行わないでください。
現在、判定対象のフレーズは登録されていません。`
    }

    let instructions = `あなたは音声認識結果から特定の意味や文脈を検出するシステムです。

【重要なルール】
- 通常のテキスト返答は一切行わないでください
- 検出した場合のみ detect_phrase 関数を呼び出してください
- 検出しなかった場合は何も返さないでください
- 完全一致判定は別システムで行うため、あなたは意味一致・文脈一致のみを担当します

【判定対象】
`

    if (semanticPhrases.length > 0) {
      instructions += `
■ 意味一致（同じ意味の別表現も検出）:
${semanticPhrases.map((p) => {
  const desc = p.description ? `（判定条件: ${p.description}）` : ''
  return `- 「${p.phrase}」${desc}`
}).join('\n')}
→ 意味一致の場合、detected_expression に実際の発話表現を記録してください。
`
    }

    if (contextPhrases.length > 0) {
      instructions += `
■ 文脈一致（会話の意図・状況で判定）:
${contextPhrases.map((p) => {
  const desc = p.description || '該当する文脈を検出'
  return `- 「${p.phrase}」: ${desc}`
}).join('\n')}
→ 文脈一致の場合、detected_expression に該当する発話内容を記録してください。
`
    }

    return instructions
  }

  /**
   * LLM用ツール定義を構築（semantic/context判定専用）
   */
  function buildTools(phrases: PhraseConfig[]) {
    const llmPhrases = phrases.filter(p => p.enabled && (p.matchType === 'semantic' || p.matchType === 'context'))

    if (llmPhrases.length === 0) {
      return []
    }

    return [
      {
        type: 'function',
        name: 'detect_phrase',
        description: '意味一致または文脈一致でフレーズを検出した場合に呼び出す。完全一致判定には使用しない。',
        parameters: {
          type: 'object',
          properties: {
            phrase: {
              type: 'string',
              description: '検出された登録フレーズ名',
              enum: llmPhrases.map(p => p.phrase),
            },
            detected_expression: {
              type: 'string',
              description: '実際にユーザーが発話した表現',
            },
          },
          required: ['phrase', 'detected_expression'],
        },
      },
    ]
  }

  /**
   * 入力音声辞書（Dictionary）を構築
   */
  function buildInputAudioTranscription(phrases: PhraseConfig[]) {
    const exactPhrases = phrases.filter(p => p.enabled && p.matchType === 'exact')

    return {
      model: 'whisper-1',
      prompt: exactPhrases.length > 0
        ? `以下の単語が含まれる可能性があります: ${exactPhrases.map(p => p.phrase).join('、')}`
        : undefined,
    }
  }

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

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      const byte = bytes[i]
      if (byte !== undefined) {
        binary += String.fromCharCode(byte)
      }
    }
    return btoa(binary)
  }

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
   * 音声バッファをcommitする
   * Realtime APIのバッファに溜まった音声をcommitして文字起こしをトリガー
   */
  function commitAudioBuffer() {
    if (!hasPendingAudio) return

    // レスポンス処理中は新しいcommitをスキップ
    if (isResponseInProgress) {
      if (onLog.value) onLog.value(`[2] commit スキップ（処理中）`)
      return
    }

    const now = Date.now()

    // commitイベントを送信（バッファに溜まった音声を確定）
    sendEvent({
      type: 'input_audio_buffer.commit',
    })

    // 重要: turn_detection: null の場合、明示的にレスポンスをトリガーする必要がある
    sendEvent({
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    })

    isResponseInProgress = true
    if (onLog.value) onLog.value(`[2] commit`)

    // commit後にバッファをクリア（次の発話用）
    sendEvent({
      type: 'input_audio_buffer.clear',
    })

    hasPendingAudio = false
    lastCommitTime = now
  }

  /**
   * 仮判定を開始する
   */
  function startProvisionalHint(phraseId: string, hintText: string) {
    const now = Date.now()

    // デバウンスチェック
    const lastTrigger = lastHintTriggerTime[phraseId] || 0
    if (now - lastTrigger < debounceMs) {
      if (onLog.value) onLog.value(`[6] デバウンス中（${phraseId}）`)
      return
    }

    // 既存の確定タイマーをキャンセル
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }

    // 仮判定状態に移行
    hintState.value = {
      status: 'provisional',
      phraseId,
      hintText,
      detectedAt: now,
    }

    lastHintTriggerTime[phraseId] = now

    if (onLog.value) onLog.value(`[6] 仮判定「${hintText}」`)

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

    hintState.value.status = 'confirmed'

    if (onLog.value) onLog.value(`[7] ヒント確定「${hintState.value.hintText}」`)

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

    if (onLog.value) onLog.value(`[6] 仮判定キャンセル`)

    hintState.value = {
      status: 'none',
      phraseId: null,
      hintText: '',
      detectedAt: null,
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

  /**
   * 完全一致判定を実行し、検出時は仮判定を開始
   */
  async function processExactMatchDetection(transcript: string, isFinal: boolean) {
    const matchedPhrase = checkExactMatch(transcript, registeredPhrases.value)

    if (matchedPhrase) {
      const detection = audioMetadata.value.phraseDetections.find(
        p => p.id === matchedPhrase.id,
      )

      if (detection) {
        detection.detected = true
        detection.detectedAt = Date.now()
        detection.detectedExpression = transcript

        if (onLog.value) onLog.value(`[5] 完全一致検出「${matchedPhrase.phrase}」${isFinal ? '（確定）' : '（中間）'}`)

        if (onPhraseDetected.value) {
          onPhraseDetected.value(matchedPhrase.phrase, audioMetadata.value, !isFinal)
        }

        // ヒントテキストを決定（固定 or AI生成）
        let hintText = matchedPhrase.hintText
        if (matchedPhrase.hintType === 'ai') {
          if (onLog.value) onLog.value(`[5] AIヒント生成中...`)
          hintText = await generateAIHint(matchedPhrase.phrase, transcript)
          if (onLog.value) onLog.value(`[5] AIヒント生成完了「${hintText}」`)
        }

        // 仮判定を開始（または即確定）
        if (isFinal) {
          // 最終結果なら即確定
          startProvisionalHint(matchedPhrase.id, hintText)
          // 即座に確定
          setTimeout(() => confirmHint(), 50)
        }
        else {
          // 中間結果なら仮判定
          startProvisionalHint(matchedPhrase.id, hintText)
        }
      }
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

        // クライアント側VADを使うのでサーバー側VADイベントは参考程度
        case 'input_audio_buffer.speech_started':
          if (onLog.value) onLog.value('[*] サーバーVAD: 発話開始')
          break

        case 'input_audio_buffer.speech_stopped':
          if (onLog.value) onLog.value('[*] サーバーVAD: 発話終了')
          break

        // 文字起こし結果（確定）を受信
        case 'conversation.item.input_audio_transcription.completed':
          if (data.transcript) {
            const transcript = data.transcript as string

            // hallucinationチェック
            if (isHallucination(transcript)) {
              break
            }

            audioMetadata.value.lastTranscript = transcript

            if (onLog.value) onLog.value(`[4] 文字起こし確定`)
            if (onTranscript.value) onTranscript.value(transcript, true)

            // 完全一致判定（確定）
            processExactMatchDetection(transcript, true)
          }
          break

        // 部分的な文字起こし（中間結果）
        case 'conversation.item.input_audio_transcription.delta':
          if (data.delta) {
            const partialTranscript = data.delta as string

            // hallucinationチェック
            if (isHallucination(partialTranscript)) {
              break
            }

            if (onTranscript.value) onTranscript.value(partialTranscript, false)

            // 完全一致判定（中間結果）
            processExactMatchDetection(partialTranscript, false)
          }
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
          if (onLog.value) onLog.value('[5] LLM判定結果受信')
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
   * LLMからのtool call処理（semantic/context判定結果）
   */
  async function handleFunctionCall(data: Record<string, unknown>) {
    if (data.name === 'detect_phrase') {
      try {
        const args = JSON.parse(data.arguments as string)
        const phrase = args.phrase as string
        const detectedExpression = args.detected_expression as string | undefined

        const detection = audioMetadata.value.phraseDetections.find(
          p => p.phrase === phrase,
        )

        // 対応するPhraseConfigを取得
        const phraseConfig = registeredPhrases.value.find(p => p.phrase === phrase)

        if (detection && phraseConfig) {
          if (detection.matchType === 'semantic' || detection.matchType === 'context') {
            detection.detected = true
            detection.detectedAt = Date.now()
            if (detectedExpression) {
              detection.detectedExpression = detectedExpression
            }

            const matchTypeLabel = detection.matchType === 'semantic' ? '意味一致' : '文脈一致'
            if (onLog.value) onLog.value(`[6] ${matchTypeLabel}検出「${phrase}」`)

            if (onPhraseDetected.value) {
              onPhraseDetected.value(phrase, audioMetadata.value, false)
            }

            // ヒントテキストを決定（固定 or AI生成）
            let hintText = detection.hintText
            if (phraseConfig.hintType === 'ai') {
              if (onLog.value) onLog.value(`[6] AIヒント生成中...`)
              hintText = await generateAIHint(phrase, detectedExpression || phrase)
              if (onLog.value) onLog.value(`[6] AIヒント生成完了「${hintText}」`)
            }

            // semantic/contextは即確定
            startProvisionalHint(detection.id, hintText)
            setTimeout(() => confirmHint(), 50)
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

        // 音声データをRealtime APIに直接送信
        const pcmData = floatTo16BitPCM(inputData)
        const base64Data = arrayBufferToBase64(pcmData)
        sendEvent({
          type: 'input_audio_buffer.append',
          audio: base64Data,
        })
        hasPendingAudio = true

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
            if (onLog.value) onLog.value('[1] 発話開始（クライアントVAD）')
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
          else if (now - silenceStartTime >= VAD_CONFIG.minSilenceDurationMs) {
            // 発話区切り → commit
            commitAudioBuffer()
          }

          // 長い無音で発話終了
          if (now - silenceStartTime >= 500) {
            isInSpeech = false
            isSpeaking.value = false
            audioMetadata.value.isSpeechDetected = false
            audioMetadata.value.silenceDuration = now - audioMetadata.value.lastSpeechTimestamp
            if (onLog.value) onLog.value('[3] 発話終了（クライアントVAD）')
          }
        }
        else if (!isSilenceNow) {
          silenceStartTime = 0
        }

        // 定期的にcommit（発話中のみ）
        if (isInSpeech && now - lastCommitTime >= commitIntervalMs) {
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
    // 残りのバッファをcommit
    if (hasPendingAudio) {
      commitAudioBuffer()
    }

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
    hasPendingAudio = false
  }

  async function startRoleplay(config?: RealtimeConfig) {
    connectionStatus.value = 'connecting'

    // 設定値を適用
    commitIntervalMs = config?.commitIntervalMs ?? 300
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
        const inputAudioTranscription = buildInputAudioTranscription(registeredPhrases.value)

        sendEvent({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions,
            input_audio_format: 'pcm16',
            input_audio_transcription: inputAudioTranscription,
            // サーバー側VADは無効化（クライアント側で制御）
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
      matchType: p.matchType,
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

export type MatchType = 'exact' | 'semantic'

export interface PhraseConfig {
  phrase: string
  matchType: MatchType
  semanticHint?: string
}

export interface PhraseDetection {
  phrase: string
  matchType: MatchType
  detected: boolean
  detectedAt?: number
  detectedExpression?: string
}

export interface AudioMetadata {
  volume: number
  volumeDb: number
  timestamp: number
  isSpeechDetected: boolean
  lastSpeechTimestamp: number
  silenceDuration: number
  phraseDetections: PhraseDetection[]
}

export interface HintCondition {
  shouldShowHint: boolean
  reason?: string
}

export interface RealtimeConfig {
  voice?: string
  instructions?: string
  batchIntervalMs?: number
}

const SAMPLE_RATE = 24000

export function useRealtimeAPI() {
  const isConnected = ref(false)
  const isPlaying = ref(false)
  const isRecording = ref(false)
  const isSpeaking = ref(false)
  const connectionStatus = ref('disconnected')
  const registeredPhrases = ref<PhraseConfig[]>([])

  const audioMetadata = ref<AudioMetadata>({
    volume: 0,
    volumeDb: -100,
    timestamp: 0,
    isSpeechDetected: false,
    lastSpeechTimestamp: 0,
    silenceDuration: 0,
    phraseDetections: [],
  })

  const onAIResponse = ref<((text: string, isFinal: boolean) => void) | null>(null)
  const onHintCheck = ref<((metadata: AudioMetadata) => HintCondition) | null>(null)
  const onError = ref<((error: string) => void) | null>(null)

  let websocket: WebSocket | null = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let scriptProcessor: ScriptProcessorNode | null = null
  let batchInterval: ReturnType<typeof setInterval> | null = null
  let playbackQueue: Float32Array[] = []
  let isPlayingAudio = false

  function buildInstructions(baseInstructions: string, phrases: PhraseConfig[]): string {
    if (phrases.length === 0) {
      return baseInstructions
    }

    const exactPhrases = phrases.filter(p => p.matchType === 'exact')
    const semanticPhrases = phrases.filter(p => p.matchType === 'semantic')

    let phraseRules = `

【フレーズ検出ルール】
ユーザーの発話に以下のフレーズが含まれている場合、返答する前に即座に detect_phrase 関数を呼び出してください。
`

    if (exactPhrases.length > 0) {
      phraseRules += `
■ 完全一致フレーズ（そのままの表現のみ検出）:
${exactPhrases.map(p => `「${p.phrase}」`).join('、')}
`
    }

    if (semanticPhrases.length > 0) {
      phraseRules += `
■ 意味判定フレーズ（同じ意味の表現も検出）:
${semanticPhrases.map(p => `「${p.phrase}」${p.semanticHint ? `（${p.semanticHint}）` : ''}`).join('\n')}
意味判定フレーズの場合は、detected_expression に実際の発話表現を記録してください。
`
    }

    return baseInstructions + phraseRules
  }

  function buildTools(phrases: PhraseConfig[]) {
    if (phrases.length === 0) {
      return []
    }

    return [
      {
        type: 'function',
        name: 'detect_phrase',
        description: '登録されたフレーズがユーザーの発話に含まれていた場合に呼び出す',
        parameters: {
          type: 'object',
          properties: {
            phrase: {
              type: 'string',
              description: '検出された登録フレーズ名',
              enum: phrases.map(p => p.phrase),
            },
            detected_expression: {
              type: 'string',
              description: '実際にユーザーが発話した表現（意味判定の場合に記録）',
            },
          },
          required: ['phrase'],
        },
      },
    ]
  }

  function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2)
    const view = new DataView(buffer)
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }
    return buffer
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  function pcm16ToFloat32(pcm16: ArrayBuffer): Float32Array {
    const int16Array = new Int16Array(pcm16)
    const float32Array = new Float32Array(int16Array.length)
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768
    }
    return float32Array
  }

  async function playAudioChunk(audioData: Float32Array) {
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

        case 'input_audio_buffer.speech_started':
          isSpeaking.value = true
          audioMetadata.value.isSpeechDetected = true
          audioMetadata.value.lastSpeechTimestamp = Date.now()
          audioMetadata.value.silenceDuration = 0
          break

        case 'input_audio_buffer.speech_stopped':
          isSpeaking.value = false
          audioMetadata.value.isSpeechDetected = false
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

        case 'response.function_call_arguments.done':
          handleFunctionCall(data)
          break

        case 'error':
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

  function handleFunctionCall(data: Record<string, unknown>) {
    if (data.name === 'detect_phrase') {
      try {
        const args = JSON.parse(data.arguments as string)
        const phrase = args.phrase as string
        const detectedExpression = args.detected_expression as string | undefined

        const phraseIndex = audioMetadata.value.phraseDetections.findIndex(
          p => p.phrase === phrase,
        )

        if (phraseIndex !== -1) {
          audioMetadata.value.phraseDetections[phraseIndex].detected = true
          audioMetadata.value.phraseDetections[phraseIndex].detectedAt = Date.now()
          if (detectedExpression) {
            audioMetadata.value.phraseDetections[phraseIndex].detectedExpression = detectedExpression
          }
        }

        sendEvent({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
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

        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)
        const db = 20 * Math.log10(rms + 0.0001)

        audioMetadata.value.volume = Math.min(1, rms * 10)
        audioMetadata.value.volumeDb = Math.max(-100, db)
        audioMetadata.value.timestamp = Date.now()

        if (audioMetadata.value.lastSpeechTimestamp > 0 && !audioMetadata.value.isSpeechDetected) {
          audioMetadata.value.silenceDuration = Date.now() - audioMetadata.value.lastSpeechTimestamp
        }

        const pcmData = floatTo16BitPCM(inputData)
        const base64Data = arrayBufferToBase64(pcmData)

        sendEvent({
          type: 'input_audio_buffer.append',
          audio: base64Data,
        })
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
  }

  function startBatchProcessing(intervalMs: number) {
    batchInterval = setInterval(() => {
      if (onHintCheck.value) {
        const condition = onHintCheck.value(audioMetadata.value)
        if (condition.shouldShowHint) {
          manualRequestHint()
        }
      }
    }, intervalMs)
  }

  function stopBatchProcessing() {
    if (batchInterval) {
      clearInterval(batchInterval)
      batchInterval = null
    }
  }

  async function startRoleplay(config?: RealtimeConfig) {
    connectionStatus.value = 'connecting'

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

        sendEvent({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: config?.voice || 'shimmer',
            instructions,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            tools,
            tool_choice: tools.length > 0 ? 'auto' : 'none',
          },
        })

        startAudioCapture()
        startBatchProcessing(config?.batchIntervalMs || 2000)
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
        stopBatchProcessing()
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
    stopBatchProcessing()
    stopAudioCapture()

    if (websocket) {
      websocket.close()
      websocket = null
    }

    isConnected.value = false
    connectionStatus.value = 'disconnected'
    playbackQueue = []
    isPlayingAudio = false
    isPlaying.value = false
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
        modalities: ['text', 'audio'],
      },
    })
  }

  function setRegisteredPhrases(phrases: PhraseConfig[]) {
    registeredPhrases.value = phrases
    audioMetadata.value.phraseDetections = phrases.map(p => ({
      phrase: p.phrase,
      matchType: p.matchType,
      detected: false,
    }))
  }

  function resetPhraseDetections() {
    audioMetadata.value.phraseDetections = audioMetadata.value.phraseDetections.map(p => ({
      ...p,
      detected: false,
      detectedAt: undefined,
      detectedExpression: undefined,
    }))
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

    toggleRoleplay,
    startRoleplay,
    stopRoleplay,
    updateInstructions,
    manualRequestHint,
    setRegisteredPhrases,
    resetPhraseDetections,

    onAIResponse,
    onHintCheck,
    onError,
  }
}

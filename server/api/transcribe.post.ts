import { Buffer } from 'node:buffer'
import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openaiApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OPENAI_API_KEY is not configured',
    })
  }

  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
  })

  try {
    const body = await readBody(event)
    const { audio, model, prompt } = body as { audio: string, model?: string, prompt?: string }

    if (!audio) {
      throw createError({
        statusCode: 400,
        statusMessage: 'audio is required',
      })
    }

    // Base64デコードしてバイナリに変換
    const audioBuffer = Buffer.from(audio, 'base64')

    // WAVヘッダーを追加（PCM16, 24kHz, mono）
    const wavBuffer = createWavBuffer(audioBuffer, 24000, 1, 16)

    // Fileオブジェクトを作成
    const audioFile = new File([wavBuffer], 'audio.wav', { type: 'audio/wav' })

    // 音声の秒数を計算（PCM16, 24kHz, mono = 2 bytes per sample）
    const audioSeconds = audioBuffer.length / (24000 * 2)

    // 文字起こしモデル（デフォルト: gpt-4o-mini-transcribe）
    const transcribeModel = model || 'gpt-4o-mini-transcribe'

    const response = await openai.audio.transcriptions.create({
      model: transcribeModel,
      file: audioFile,
      language: 'ja',
      response_format: 'json',
      // promptで想定される単語を指定すると認識精度が向上
      // ただし、無理やり認識されることはない（あくまでヒント）
      ...(prompt && { prompt }),
    })

    return {
      text: response.text,
      model: transcribeModel,
      usage: {
        audioSeconds,
      },
    }
  }
  catch (error) {
    console.error('Failed to transcribe audio:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to transcribe audio',
    })
  }
})

/**
 * PCMデータにWAVヘッダーを追加
 */
function createWavBuffer(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = pcmData.length
  const headerSize = 44
  const fileSize = dataSize + headerSize - 8

  const header = Buffer.alloc(headerSize)

  // RIFF header
  header.write('RIFF', 0)
  header.writeUInt32LE(fileSize, 4)
  header.write('WAVE', 8)

  // fmt chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // audio format (PCM)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcmData])
}

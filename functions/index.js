import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import OpenAI from 'openai'

const openaiApiKey = defineSecret('OPENAI_API_KEY')

// CORS設定
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * PCMデータにWAVヘッダーを追加
 */
function createWavBuffer(pcmData, sampleRate, channels, bitsPerSample) {
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

/**
 * Realtime Session API - エフェメラルトークンを取得
 */
export const realtimeSession = onRequest(
  { secrets: [openaiApiKey], cors: true },
  async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders)
      res.status(204).send('')
      return
    }

    res.set(corsHeaders)

    try {
      const openai = new OpenAI({
        apiKey: openaiApiKey.value(),
      })

      const response = await openai.beta.realtime.sessions.create({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'shimmer',
      })

      res.json({
        client_secret: response.client_secret?.value,
      })
    } catch (error) {
      console.error('Failed to create realtime session:', error)
      res.status(500).json({ error: 'Failed to create realtime session' })
    }
  }
)

/**
 * Transcribe API - 音声文字起こし
 */
export const transcribe = onRequest(
  { secrets: [openaiApiKey], cors: true },
  async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders)
      res.status(204).send('')
      return
    }

    res.set(corsHeaders)

    try {
      const { audio, model, prompt } = req.body

      if (!audio) {
        res.status(400).json({ error: 'audio is required' })
        return
      }

      const openai = new OpenAI({
        apiKey: openaiApiKey.value(),
      })

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
        ...(prompt && { prompt }),
      })

      res.json({
        text: response.text,
        model: transcribeModel,
        usage: {
          audioSeconds,
        },
      })
    } catch (error) {
      console.error('Failed to transcribe audio:', error)
      res.status(500).json({ error: 'Failed to transcribe audio' })
    }
  }
)

/**
 * Generate Hints API - AIでトリガー＆ヒントを生成
 * Responses APIを使用してCSV形式で返す
 */
export const generateHints = onRequest(
  { secrets: [openaiApiKey], cors: true },
  async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders)
      res.status(204).send('')
      return
    }

    res.set(corsHeaders)

    try {
      const { context, detectionType, existingHints, count } = req.body

      if (!context) {
        res.status(400).json({ error: 'context is required' })
        return
      }

      const openai = new OpenAI({
        apiKey: openaiApiKey.value(),
      })

      // 既存ヒントのリスト（重複を避けるため）
      const existingList = existingHints && existingHints.length > 0
        ? `\n\n【既存のヒント（重複を避けてください）】\n${existingHints.map(h => `- ${h.phrase}`).join('\n')}`
        : ''

      const typeDescription = detectionType === 'topic'
        ? 'トピック（会話の大きな文脈・段階）'
        : 'フレーズ（特定のキーワードや質問）'

      const systemPrompt = `あなたは営業・商談のヒント生成AIです。
ユーザーが提供するコンテキスト（商品情報、サービス概要など）に基づいて、営業担当者向けのリアルタイムヒントを生成してください。

【生成するヒントの種類】
${typeDescription}

【出力形式】
必ず以下のCSV形式で出力してください。ヘッダー行を含めてください。
名前,判定基準,ヒント

【各列の説明】
- 名前: ヒントの名前（短く、10文字以内）
- 判定基準: ${detectionType === 'topic' ? '会話がこのトピックに該当する条件（例：「製品の価格について質問された」）' : 'このヒントを表示するトリガーとなる発言パターン（例：「競合他社との違いは？」）'}
- ヒント: 営業担当者に表示するヒントテキスト（簡潔で実用的に、50〜100文字程度）

【注意事項】
- ヒント内容は具体的で実用的なものにしてください
- カンマを含む場合はダブルクォートで囲んでください
- 改行を含む場合もダブルクォートで囲んでください
- ${count || 5}件のヒントを生成してください${existingList}`

      const response = await openai.responses.create({
        model: 'gpt-4o',
        input: `以下のコンテキストに基づいて、${typeDescription}のヒントを生成してください。\n\n【コンテキスト】\n${context}`,
        instructions: systemPrompt,
      })

      // レスポンスからCSVテキストを抽出
      const csvContent = response.output_text || ''

      res.json({
        csv: csvContent,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : null,
      })
    } catch (error) {
      console.error('ヒント生成エラー:', error)
      res.status(500).json({ error: 'ヒント生成に失敗しました', details: error.message })
    }
  }
)

/**
 * Detect Topic API - トピック判定
 */
export const detectTopic = onRequest(
  { secrets: [openaiApiKey], cors: true },
  async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders)
      res.status(204).send('')
      return
    }

    res.set(corsHeaders)

    try {
      const { conversationHistory, topicDefinitions, currentTopic, model } = req.body

      if (!topicDefinitions || topicDefinitions.length === 0) {
        res.json({ topic: null, confidence: 0 })
        return
      }

      const openai = new OpenAI({
        apiKey: openaiApiKey.value(),
      })

      // トピック定義をフォーマット
      const topicListText = topicDefinitions
        .map((t, i) => `${i + 1}. ${t.name}${t.description ? `: ${t.description}` : ''}`)
        .join('\n')

      // 会話履歴をフォーマット（直近の発話を使用）
      const recentHistory = (conversationHistory || []).slice(-10).join('\n')

      const systemPrompt = `あなたは会話のトピック判定AIです。以下の会話履歴を分析し、現在の会話がどのトピックに該当するかを判定してください。

【判定可能なトピック一覧】
${topicListText}

【判定ルール】
- 会話の文脈から最も適切なトピックを1つ選んでください
- 明確にトピックが特定できない場合は「未確定」と回答してください
- トピックは順番に進むとは限りません。会話の内容に基づいて判定してください
- 現在のトピック: ${currentTopic || '未確定'}

【出力形式】
JSON形式で出力してください:
{"topic": "トピック名", "reason": "判定理由（会話のどの部分からそう判断したか、20文字以内）"}
判定できない場合は:
{"topic": "未確定", "reason": "理由"}`

      const response = await openai.chat.completions.create({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `【会話履歴】\n${recentHistory || '（会話なし）'}\n\n現在のトピックを判定してください。` },
        ],
        max_tokens: 100,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      })

      const rawContent = response.choices[0]?.message?.content?.trim() || '{}'

      // JSONをパース
      let detectedTopic = '未確定'
      let reason = ''
      try {
        const parsed = JSON.parse(rawContent)
        detectedTopic = parsed.topic || '未確定'
        reason = parsed.reason || ''
      } catch {
        detectedTopic = rawContent
      }

      // トピック名がリストに存在するか確認
      const matchedTopic = topicDefinitions.find(t =>
        t.name === detectedTopic || detectedTopic.includes(t.name)
      )

      // トークン使用量を取得
      const usage = response.usage

      res.json({
        topic: matchedTopic ? matchedTopic.name : null,
        reason,
        rawResponse: detectedTopic,
        model: model || 'gpt-4o-mini',
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
      })
    } catch (error) {
      console.error('トピック判定エラー:', error)
      res.status(500).json({ error: 'トピック判定に失敗しました' })
    }
  }
)

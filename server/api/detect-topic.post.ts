import OpenAI from 'openai'

interface TopicDefinition {
  name: string
  description?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { conversationHistory, topicDefinitions, currentTopic, model } = body as {
    conversationHistory: string[]
    topicDefinitions: TopicDefinition[]
    currentTopic: string | null
    model?: string
  }

  if (!topicDefinitions || topicDefinitions.length === 0) {
    return { topic: null, confidence: 0 }
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  try {
    // トピック定義をフォーマット
    const topicListText = topicDefinitions
      .map((t, i) => `${i + 1}. ${t.name}${t.description ? `: ${t.description}` : ''}`)
      .join('\n')

    // 会話履歴をフォーマット（直近の発話を使用）
    const recentHistory = conversationHistory.slice(-10).join('\n')

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
    }
    catch {
      // JSONパースに失敗した場合はそのまま使用
      detectedTopic = rawContent
    }

    // トピック名がリストに存在するか確認
    const matchedTopic = topicDefinitions.find(t =>
      t.name === detectedTopic || detectedTopic.includes(t.name),
    )

    // トークン使用量を取得
    const usage = response.usage

    return {
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
    }
  }
  catch (error) {
    console.error('トピック判定エラー:', error)
    throw createError({
      statusCode: 500,
      message: 'トピック判定に失敗しました',
    })
  }
})

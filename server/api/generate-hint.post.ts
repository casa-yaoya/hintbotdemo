import OpenAI from 'openai'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { prompt, detectedPhrase, detectedExpression, conversationHistory } = body

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  try {
    const systemPrompt = `あなたはヒント生成AIです。以下の条件に従ってヒントを生成してください。

【ヒント生成指示】
${prompt}

【検出されたフレーズ】
${detectedPhrase}

【実際の発話内容】
${detectedExpression}

${conversationHistory || ''}

上記の情報を元に、指示に従ったヒントを生成してください。ヒントのみを出力し、説明や前置きは不要です。`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '適切なヒントを生成してください。' },
      ],
      max_tokens: 50,
      temperature: 0.7,
    })

    const hint = response.choices[0]?.message?.content?.trim() || 'ヒントを生成できませんでした'

    // トークン使用量を取得
    const usage = response.usage

    return {
      hint,
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
    console.error('AIヒント生成エラー:', error)
    throw createError({
      statusCode: 500,
      message: 'ヒント生成に失敗しました',
    })
  }
})

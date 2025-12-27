import OpenAI from 'openai'

export default defineEventHandler(async () => {
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
    const response = await openai.beta.realtime.sessions.create({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'shimmer',
    })

    return {
      client_secret: response.client_secret?.value,
    }
  }
  catch (error) {
    console.error('Failed to create realtime session:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create realtime session',
    })
  }
})

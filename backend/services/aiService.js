import { GoogleGenerativeAI } from '@google/generative-ai'

const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']
const cooldowns = new Map()

export async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw Object.assign(new Error('Gemini API key is not configured'), { status: 500 })
  const client = new GoogleGenerativeAI(key)
  for (const modelName of models) {
    if (Date.now() - (cooldowns.get(modelName) || 0) < 5000) continue
    try {
      const model = client.getGenerativeModel({ model: modelName })
      const result = await model.generateContent(prompt)
      return { text: result.response.text(), model: modelName }
    } catch (error) {
      const message = error?.message?.toLowerCase() || ''
      if (!/quota|429|rate limit|resource exhausted|not found|unsupported/.test(message)) throw error
      cooldowns.set(modelName, Date.now())
    }
  }
  return { text: null, model: 'Unavailable' }
}

import { apiFetch } from './api/client'

// The Gemini key and model fallback live on the server.
export const askGemini = prompt => apiFetch('/api/ai/generate', { method: 'POST', body: JSON.stringify({ prompt }) })

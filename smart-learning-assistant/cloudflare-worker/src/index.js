import { createRemoteJWKSet, jwtVerify } from 'jose'

const firebaseKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  }
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) })
}

async function requireUser(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Sign in is required.')
  const result = await jwtVerify(token, firebaseKeys, {
    audience: env.FIREBASE_PROJECT_ID,
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`
  })
  return result.payload
}

function safeText(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || env.ALLOWED_ORIGIN
    if (origin !== env.ALLOWED_ORIGIN) return reply(403, { error: 'Origin is not allowed.' }, env.ALLOWED_ORIGIN)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env.ALLOWED_ORIGIN) })
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/ai/chat') return reply(404, { error: 'Route not found.' }, env.ALLOWED_ORIGIN)
    try {
      await requireUser(request, env)
      const body = await request.json()
      const message = safeText(body.message, 1500)
      const subject = safeText(body.subject, 100) || 'General study'
      if (!message) return reply(400, { error: 'Enter a study question.' }, env.ALLOWED_ORIGIN)
      const upstream = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.HF_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.1-8B-Instruct:featherless-ai',
          messages: [
            { role: 'system', content: 'You are Smart Learning Assistant. Give clear, supportive and academically honest help. Keep replies concise. Do not invent sources. If a request involves unsafe or disallowed conduct, explain a safe alternative.' },
            { role: 'user', content: `Subject: ${subject}\n\nQuestion: ${message}` }
          ],
          max_tokens: 550,
          temperature: 0.5
        })
      })
      if (!upstream.ok) return reply(502, { error: 'The AI service is temporarily unavailable. Please try again.' }, env.ALLOWED_ORIGIN)
      const data = await upstream.json()
      const answer = safeText(data?.choices?.[0]?.message?.content, 6000)
      if (!answer) return reply(502, { error: 'The AI service returned an empty response. Please try again.' }, env.ALLOWED_ORIGIN)
      return reply(200, { answer }, env.ALLOWED_ORIGIN)
    } catch (error) {
      return reply(401, { error: error?.message || 'Unable to verify this request.' }, env.ALLOWED_ORIGIN)
    }
  }
}


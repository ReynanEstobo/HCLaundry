import 'dotenv/config'
import http from 'node:http'
import { URL } from 'node:url'
import { authenticate } from './middleware/authenticate.js'
import { handleData } from './controllers/dataController.js'
import { login, signUp, getMe, updatePassword } from './controllers/authController.js'
import { getPublicSettings, trackOrder } from './controllers/publicController.js'
import { sendEmail, sendSms } from './services/notificationService.js'
import { askGemini } from './services/aiService.js'
import { events } from './services/realtimeService.js'
import { resourceRoutes } from './routes/resourceRoutes.js'

const port = Number(process.env.PORT || 3001)

function write(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || 'http://localhost:5173', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk })
    request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })) } })
    request.on('error', reject)
  })
}

function streamEvents(request, response) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || 'http://localhost:5173' })
  response.write(': connected\n\n')
  const forward = event => response.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`)
  events.on('change', forward)
  const ping = setInterval(() => response.write(': ping\n\n'), 25000)
  request.on('close', () => { clearInterval(ping); events.off('change', forward) })
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return write(response, 204, {})
  const url = new URL(request.url, `http://${request.headers.host}`)
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '')
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') return write(response, 200, { status: 'ok' })
    if (request.method === 'GET' && url.pathname === '/api/events') return streamEvents(request, response)
    if (request.method === 'POST' && path === 'auth/login') return write(response, 200, await login(await readBody(request)))
    if (request.method === 'POST' && path === 'auth/signup') { await authenticate(request); return write(response, 200, await signUp(await readBody(request))) }
    if (request.method === 'GET' && path === 'auth/me') return write(response, 200, await getMe(await authenticate(request)))
    if (request.method === 'PATCH' && path === 'auth/password') return write(response, 200, await updatePassword(await readBody(request)))
    if (request.method === 'POST' && path === 'notifications/email') return write(response, 200, await sendEmail(await readBody(request)))
    if (request.method === 'POST' && path === 'notifications/sms') return write(response, 200, await sendSms(await readBody(request)))
    if (request.method === 'POST' && path === 'ai/generate') { await authenticate(request); return write(response, 200, await askGemini((await readBody(request)).prompt)) }
    if (request.method === 'GET' && path === 'public/orders/track') return write(response, 200, await trackOrder(url.searchParams.get('q')))
    if (request.method === 'GET' && path === 'public/settings') return write(response, 200, await getPublicSettings())

    const table = resourceRoutes.get(path)
    if (table && request.method === 'POST') {
      await authenticate(request)
      return write(response, 200, await handleData(table, await readBody(request)))
    }
    return write(response, 404, { error: 'Endpoint not found' })
  } catch (error) {
    console.error(error)
    return write(response, error.status || 500, { error: error.message || 'Internal server error', details: error.details })
  }
})

server.listen(port, () => console.log(`4J Laundry backend listening on http://localhost:${port}`))

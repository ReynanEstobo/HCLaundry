import nodemailer from 'nodemailer'

function requireValue(value, label) {
  if (!value) throw Object.assign(new Error(`${label} is not configured`), { status: 500 })
  return value
}

export async function sendEmail({ to, subject, body }) {
  if (!to || !subject || !body) throw Object.assign(new Error('Missing required fields'), { status: 400 })
  const from = requireValue(process.env.GMAIL_EMAIL, 'Gmail email')
  const pass = requireValue(process.env.GMAIL_APP_PASSWORD, 'Gmail app password')
  const lines = body.split('\n').map(line => line ? `<p style="margin:0 0 8px">${line}</p>` : '<br/>').join('')
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px"><div style="text-align:center;margin-bottom:24px"><h2 style="margin:0;color:#111827;font-size:20px">🧺 4J Laundry</h2></div><div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e5e7eb"><h3 style="margin:0 0 16px;color:#111827;font-size:16px">${subject}</h3><div style="color:#374151;font-size:14px;line-height:1.6">${lines}</div></div></div>`
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: from, pass } })
  await transporter.sendMail({ from: `"4J Laundry" <${from}>`, to, subject, text: body, html })
  return { success: true, message: 'Email sent successfully' }
}

export async function sendSms({ phone, message }) {
  if (!phone || !message) throw Object.assign(new Error('Missing required fields: phone, message'), { status: 400 })
  const apiKey = requireValue(process.env.SEMAPHORE_API_KEY, 'Semaphore API key')
  const number = phone.startsWith('0') ? `63${phone.slice(1)}` : phone
  const params = new URLSearchParams({ apikey: apiKey, number, message, sendername: process.env.SEMAPHORE_SENDER_NAME || '4JLaundry' })
  const response = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.message || 'Semaphore API error'), { status: 502, details: data })
  return { success: true, message: 'SMS sent successfully', data }
}

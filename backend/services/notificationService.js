import nodemailer from 'nodemailer'
import { runtimeValue } from '../config/supabase.js'

function requireValue(value, label) {
  if (!value) throw Object.assign(new Error(`${label} is not configured`), { status: 500 })
  return value
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function emailHtml(subject, body) {
  const lines = String(body).split('\n').map(line => line
    ? `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`
    : '<br/>').join('')
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px"><div style="text-align:center;margin-bottom:24px"><h2 style="margin:0;color:#111827;font-size:20px">🧺 H&C Laundry</h2></div><div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e5e7eb"><h3 style="margin:0 0 16px;color:#111827;font-size:16px">${escapeHtml(subject)}</h3><div style="color:#374151;font-size:14px;line-height:1.6">${lines}</div></div></div>`
}

async function sendViaAppsScript({ relayUrl, relaySecret, to, subject, body, html }) {
  const response = await fetch(relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: relaySecret, to, subject, body, html }),
  })
  let data = null
  try { data = await response.json() } catch { /* The status check below handles non-JSON responses. */ }
  if (!response.ok || !data?.success) {
    throw Object.assign(new Error('Email relay could not deliver the message.'), { status: 502 })
  }
}

export async function sendEmail({ to, subject, body }) {
  if (!to || !subject || !body) throw Object.assign(new Error('Missing required fields'), { status: 400 })
  const html = emailHtml(subject, body)
  const relayUrl = runtimeValue('GOOGLE_APPS_SCRIPT_EMAIL_URL')
  const relaySecret = runtimeValue('EMAIL_RELAY_SECRET')

  // Cloudflare Workers use the HTTPS Apps Script relay. It avoids blocked
  // SMTP sockets and keeps the relay secret server-side. Local Node use may
  // still fall back to Gmail SMTP when no relay is configured.
  if (relayUrl || relaySecret) {
    await sendViaAppsScript({
      relayUrl: requireValue(relayUrl, 'Google Apps Script relay URL'),
      relaySecret: requireValue(relaySecret, 'Google Apps Script relay secret'),
      to, subject, body, html,
    })
    return { success: true, message: 'Email sent successfully' }
  }

  // `runtimeValue` reads process.env while developing locally and Cloudflare
  // Worker secrets after deployment. Never pass either value to the client.
  const from = requireValue(runtimeValue('GMAIL_EMAIL'), 'Gmail email')
  const pass = requireValue(runtimeValue('GMAIL_APP_PASSWORD'), 'Gmail app password')
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: from, pass },
  })
  await transporter.sendMail({ from: `"H&C Laundry" <${from}>`, to, subject, text: body, html })
  return { success: true, message: 'Email sent successfully' }
}

export async function sendSms({ phone, message }) {
  if (!phone || !message) throw Object.assign(new Error('Missing required fields: phone, message'), { status: 400 })
  const apiKey = requireValue(runtimeValue('SEMAPHORE_API_KEY'), 'Semaphore API key')
  const number = phone.startsWith('0') ? `63${phone.slice(1)}` : phone
  const params = new URLSearchParams({ apikey: apiKey, number, message, sendername: runtimeValue('SEMAPHORE_SENDER_NAME') || 'HCLaundry' })
  const response = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.message || 'Semaphore API error'), { status: 502, details: data })
  return { success: true, message: 'SMS sent successfully', data }
}

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

// Use table-based, inline styles because they render consistently in Gmail,
// Outlook, and mobile email clients. All message content stays escaped.
function brandedEmailHtml(subject, body) {
  const lines = String(body).split('\n').map(line => line
    ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`
    : '<div style="height:8px;line-height:8px">&nbsp;</div>').join('')
  const safeSubject = escapeHtml(subject)
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#eef5fa;color:#172033;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${safeSubject}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef5fa;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(24,72,105,.14)">
          <tr><td style="padding:26px 32px;background:#1196cf;color:#ffffff">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.18);text-align:center;vertical-align:middle;font-weight:800;font-size:16px;letter-spacing:.4px">H&amp;C</td>
              <td style="padding-left:12px;vertical-align:middle"><div style="font-size:20px;font-weight:700;line-height:1.1">H&amp;C Laundry</div><div style="margin-top:4px;font-size:12px;line-height:1.2;opacity:.88">Management System</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:32px">
            <h1 style="margin:0 0 20px;color:#172033;font-size:21px;line-height:1.35">${safeSubject}</h1>
            <div style="color:#46556d;font-size:14px;line-height:1.65">${lines}</div>
          </td></tr>
          <tr><td style="padding:0 32px"><div style="height:1px;background:#e5edf4;font-size:1px;line-height:1px">&nbsp;</div></td></tr>
          <tr><td style="padding:20px 32px 26px;color:#74839a;font-size:12px;line-height:1.55">
            <strong style="color:#52637c">Automated message</strong><br>
            This email was generated automatically by H&amp;C Laundry. Please do not reply to this message.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
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
  const text = `${String(body).trim()}\n\n---\nThis is an automated email from H&C Laundry. Please do not reply to this message.`
  const html = brandedEmailHtml(subject, body)
  const relayUrl = runtimeValue('GOOGLE_APPS_SCRIPT_EMAIL_URL')
  const relaySecret = runtimeValue('EMAIL_RELAY_SECRET')

  // Cloudflare Workers use the HTTPS Apps Script relay. It avoids blocked
  // SMTP sockets and keeps the relay secret server-side. Local Node use may
  // still fall back to Gmail SMTP when no relay is configured.
  if (relayUrl || relaySecret) {
    await sendViaAppsScript({
      relayUrl: requireValue(relayUrl, 'Google Apps Script relay URL'),
      relaySecret: requireValue(relaySecret, 'Google Apps Script relay secret'),
      to, subject, body: text, html,
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
  await transporter.sendMail({ from: `"H&C Laundry" <${from}>`, to, subject, text, html })
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

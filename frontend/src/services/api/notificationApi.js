import { apiFetch } from './client'

export const sendEmail = payload => apiFetch('/api/notifications/email', { method: 'POST', body: JSON.stringify(payload) })
export const sendSms = payload => apiFetch('/api/notifications/sms', { method: 'POST', body: JSON.stringify(payload) })

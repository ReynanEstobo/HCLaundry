// Optional development utility. Never commit credentials; configure .env first.
import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function createDefaultUser() {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
    body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, email_confirm: true }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Unable to create user')
  console.log(`Created ${data.email}`)
}

createDefaultUser().catch(error => { console.error(error.message); process.exitCode = 1 })

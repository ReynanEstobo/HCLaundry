import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { requestEmailChange, confirmEmailChange } from '../backend/controllers/emailChangeController.js'
import { authClient, database, configureRuntimeEnv } from '../backend/config/supabase.js'

test('email change: real SQL enforces verification, ownership, expiry, replay protection and preserves permissions', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE staff (id UUID PRIMARY KEY, auth_id UUID UNIQUE, email TEXT, contact_email TEXT,
      role TEXT, branch_id UUID, deleted_at TIMESTAMPTZ, must_change_password BOOLEAN DEFAULT false);
    CREATE TABLE password_change_otps (auth_user_id UUID, consumed_at TIMESTAMPTZ);
    CREATE TABLE audit_logs (action TEXT, table_name TEXT, record_id UUID, actor_staff_id UUID,
      branch_id UUID, before_data JSONB, after_data JSONB);
  `)
  const migration = await readFile(new URL('../supabase_migrations/20260909_account_email_change.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Safe to rerun before deployment.
  const userId = randomUUID(), staffId = randomUUID(), otherUser = randomUUID(), branch = randomUUID()
  async function reset(role = 'staff') {
    await db.exec('TRUNCATE email_change_otps, password_change_otps, audit_logs, staff CASCADE')
    await db.query('INSERT INTO staff(id,auth_id,email,contact_email,role,branch_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [staffId,userId,'login@example.com','old@example.com',role,role === 'admin' ? null : branch])
  }
  async function begin(newEmail = 'new@example.com') {
    const id = randomUUID()
    const { rows } = await db.query('SELECT begin_account_email_change($1,$2,$3,$4,$5) AS result', [userId,id,'old@example.com',newEmail,'hash'])
    return { id, ...rows[0].result }
  }
  async function confirm(id, hash = 'hash', actor = userId) {
    return (await db.query('SELECT confirm_account_email_change($1,$2,$3) AS result',[actor,id,hash])).rows[0].result
  }
  for (const role of ['staff','admin']) await t.test(`${role}: successful change is atomic and does not change login or branch`, async () => {
    await reset(role)
    await db.query('INSERT INTO password_change_otps VALUES ($1,NULL)',[userId])
    const issued = await begin()
    assert.equal(issued.success,true)
    assert.deepEqual(await confirm(issued.id),{ success:true,contactEmail:'new@example.com' })
    const row = (await db.query('SELECT * FROM staff')).rows[0]
    assert.equal(row.email,'login@example.com')
    assert.equal(row.contact_email,'new@example.com')
    assert.equal(row.role,role)
    assert.equal(row.branch_id,role === 'admin' ? null : branch)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n,1)
    assert.ok((await db.query('SELECT consumed_at FROM password_change_otps')).rows[0].consumed_at)
    assert.ok((await confirm(issued.id)).error)
  })
  await t.test('wrong account, five invalid attempts, expiry and resends reject stale codes',async () => {
    await reset()
    const issued = await begin()
    assert.ok((await confirm(issued.id,'hash',otherUser)).error)
    for(let i=0;i<5;i++) assert.match((await confirm(issued.id,'wrong')).error,/Invalid/)
    assert.ok((await confirm(issued.id)).error)
    const expired = await begin()
    await db.query("UPDATE email_change_otps SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id])
    assert.ok((await confirm(expired.id)).error)
    const old = await begin(), fresh = await begin()
    assert.ok((await confirm(old.id)).error)
    assert.equal((await confirm(fresh.id)).success,true)
  })
  await t.test('duplicate email and changed profile cannot overwrite account data',async () => {
    await reset()
    await db.query('INSERT INTO staff(id,auth_id,contact_email) VALUES ($1,$2,$3)',[randomUUID(),otherUser,'new@example.com'])
    const issued = await begin()
    assert.match((await confirm(issued.id)).error,/cannot be used/)
    await db.query("UPDATE staff SET contact_email='changed@example.com' WHERE id=$1",[staffId])
    assert.match((await confirm(issued.id)).error,/email changed/)
  })
  await t.test('rate limiting is per account and temporary/deleted accounts cannot bind emails',async () => {
    await reset()
    for(let i=0;i<5;i++) assert.equal((await begin()).success,true)
    assert.match((await begin()).error,/Too many/)
    await db.query('UPDATE staff SET must_change_password=true WHERE id=$1',[staffId])
    assert.match((await begin()).error,/activated/)
    await db.query('UPDATE staff SET must_change_password=false, deleted_at=now() WHERE id=$1',[staffId])
    assert.ok((await begin()).error)
  })
  await t.test('browser roles cannot execute email change functions or read OTP hashes',async () => {
    const { rows } = await db.query(`SELECT
      has_function_privilege('authenticated','confirm_account_email_change(uuid,uuid,text)','EXECUTE') AS execute,
      has_table_privilege('anon','email_change_otps','SELECT') AS read`)
    assert.deepEqual(rows[0],{execute:false,read:false})
  })
})

test('email change API: password is required, sends only to requested email, binds challenge to authenticated user', async t => {
  const userId = randomUUID(), staffId = randomUUID()
  const identity = { user:{id:userId,email:'login@example.com'},staffId,role:'admin' }
  const authDescriptor = Object.getOwnPropertyDescriptor(authClient,'auth')
  const originalFrom = database.from, originalRpc = database.rpc, originalFetch = globalThis.fetch
  let acceptPassword = false, rpcCalls = [], sent
  configureRuntimeEnv({PASSWORD_OTP_SECRET:'test-only-hash-key',GOOGLE_APPS_SCRIPT_EMAIL_URL:'https://relay.example.test',EMAIL_RELAY_SECRET:'test-only-relay-key'})
  Object.defineProperty(authClient,'auth',{configurable:true,value:{signInWithPassword:async () => acceptPassword ? {data:{user:{id:userId}}} : {error:{message:'invalid'}}}})
  database.from = () => ({select(){return this},eq(){return this},is(){return this},maybeSingle:async()=>({data:{contact_email:'old@example.com'}})})
  database.rpc = async (name,args) => { rpcCalls.push({name,args}); return {data:{success:true,contactEmail:'new@example.com'}} }
  globalThis.fetch = async (_url, options) => { sent = JSON.parse(options.body); return Response.json({success:true}) }
  t.after(() => { Object.defineProperty(authClient,'auth',authDescriptor); database.from=originalFrom;database.rpc=originalRpc;globalThis.fetch=originalFetch;configureRuntimeEnv(null) })
  await assert.rejects(requestEmailChange({newEmail:'new@example.com',currentPassword:'wrong'},identity),/incorrect/)
  assert.equal(rpcCalls.length,0)
  await assert.rejects(requestEmailChange({newEmail:'x@accounts.iclaundry.local',currentPassword:'pw'},identity),/valid new email/)
  await assert.rejects(requestEmailChange({}, {...identity,role:'unassigned'}),/active/)
  acceptPassword = true
  const result = await requestEmailChange({newEmail:'New@Example.com',currentPassword:'correct'},identity)
  assert.equal(sent.to,'new@example.com')
  assert.ok(result.challengeId)
  assert.match(rpcCalls[0].args.p_code_hash,/^[0-9a-f]{64}$/)
  const otp = sent.body.match(/code is: (\d{6})/)[1]
  await confirmEmailChange({challengeId:result.challengeId,otp,authUserId:randomUUID()},identity)
  assert.equal(rpcCalls[1].args.p_auth_user_id,userId)
  assert.equal(rpcCalls[1].args.p_code_hash,rpcCalls[0].args.p_code_hash)
  database.rpc = async () => ({data:{error:'Invalid verification code.'}})
  await assert.rejects(confirmEmailChange({challengeId:result.challengeId,otp},identity),/Invalid verification/)
})

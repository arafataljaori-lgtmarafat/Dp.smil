import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const base = process.env.PHASE2_SECURITY_API_BASE ?? 'http://127.0.0.1:3012/api/v1';
const outbox = process.env.PHASE2_SECURITY_OUTBOX ?? '/tmp/dentpilot-phase2-security-outbox';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for the disabled-account HTTP probe.');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `disabled-http-${suffix}@example.invalid`;
const password = 'disabled-http-password';

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => undefined);
  return { response, body };
}

function expectStatus(result, status, label) {
  if (result.response.status !== status) throw new Error(`${label}: expected ${status}, got ${result.response.status}`);
}

async function actionToken() {
  const messages = await Promise.all((await readdir(outbox)).filter((file) => file.endsWith('verify_email.json')).map(async (file) => JSON.parse(await readFile(join(outbox, file), 'utf8'))));
  const message = messages.find((candidate) => candidate.to === email);
  const token = message && new URL(message.actionUrl).searchParams.get('token');
  if (!token) throw new Error('Verification token not found in test outbox.');
  return token;
}

const registration = await request('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, displayName: 'Disabled HTTP test' }) });
expectStatus(registration, 201, 'registration');
const verification = await request('/auth/verify-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: await actionToken() }) });
expectStatus(verification, 204, 'verification');
const login = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
expectStatus(login, 201, 'login');
const token = login.body?.data?.token;
if (typeof token !== 'string') throw new Error('Login did not return an opaque token.');

const psqlUrl = new URL(databaseUrl);
psqlUrl.search = '';
await execFileAsync('psql', [psqlUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE "users" SET "status" = 'disabled' WHERE "normalizedEmail" = '${email}'`]);

const account = await request('/account/me', { headers: { authorization: `Bearer ${token}` } });
expectStatus(account, 401, 'disabled account request');
if (account.body?.error?.code !== 'ACCOUNT_DISABLED') throw new Error('Disabled account did not return ACCOUNT_DISABLED.');
const cases = await request('/cases', { headers: { authorization: `Bearer ${token}` } });
expectStatus(cases, 401, 'disabled protected resource request');
if (cases.body?.error?.code !== 'ACCOUNT_DISABLED' || 'cases' in (cases.body ?? {})) throw new Error('Disabled session reached protected resource response.');

console.log(JSON.stringify({ status: 'ok', disabledSessionRejected: true, protectedResourcesWithheld: true }, null, 2));

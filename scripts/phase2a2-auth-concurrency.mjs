import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.PHASE2A2_API_BASE ?? 'http://127.0.0.1:3009/api/v1';
const outbox = process.env.PHASE2A2_OUTBOX ?? '/home/ubuntu/dentpilot-smile/apps/api/.local/email-outbox';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `concurrency-${suffix}@example.invalid`;
const password = 'concurrent-auth-original-password';

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function latestToken(purpose) {
  const files = (await readdir(outbox)).filter((file) => file.endsWith(`${purpose}.json`)).sort();
  const file = files.at(-1);
  if (!file) throw new Error(`Missing ${purpose} outbox message.`);
  const payload = JSON.parse(await readFile(join(outbox, file), 'utf8'));
  const token = new URL(payload.actionUrl).searchParams.get('token');
  if (!token) throw new Error(`Missing ${purpose} token.`);
  return token;
}

function counts(results) {
  return results.reduce((value, result) => ({ ...value, [result.status]: (value[result.status] ?? 0) + 1 }), {});
}

const registrations = await Promise.all(Array.from({ length: 8 }, () => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName: 'Concurrent Auth User' }) })));
if (counts(registrations)[201] !== 1 || counts(registrations)[409] !== 7) throw new Error(`Unexpected concurrent registration results: ${JSON.stringify(counts(registrations))}`);

const verificationToken = await latestToken('verify_email');
const verifications = await Promise.all(Array.from({ length: 8 }, () => request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verificationToken }) })));
if (counts(verifications)[204] !== 1 || (counts(verifications)[401] ?? 0) !== 7) throw new Error(`Unexpected concurrent verification results: ${JSON.stringify(counts(verifications))}`);

const forgot = await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
if (forgot.status !== 202) throw new Error(`Forgot password expected 202, got ${forgot.status}`);
const resetToken = await latestToken('reset_password');
const resets = await Promise.all(Array.from({ length: 8 }, () => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, newPassword: 'concurrent-auth-replacement-password' }) })));
if (counts(resets)[204] !== 1 || (counts(resets)[401] ?? 0) !== 7) throw new Error(`Unexpected concurrent reset results: ${JSON.stringify(counts(resets))}`);

console.log(JSON.stringify({ status: 'ok', registration: counts(registrations), verification: counts(verifications), reset: counts(resets) }, null, 2));

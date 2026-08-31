import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.PHASE2A2_API_BASE ?? 'http://127.0.0.1:3009/api/v1';
const outbox = process.env.PHASE2A2_OUTBOX ?? '/home/ubuntu/dentpilot-smile/apps/api/.local/email-outbox';
const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'security-probe-password';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WQAAAABJRU5ErkJggg==', 'base64');

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}

function expect(result, status, label) {
  if (result.response.status !== status) throw new Error(`${label}: expected ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
}

function json(method, body, token) {
  return { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) };
}

async function actionToken(email, purpose) {
  const messages = await Promise.all((await readdir(outbox)).filter((name) => name.endsWith(`${purpose}.json`)).map(async (name) => JSON.parse(await readFile(join(outbox, name), 'utf8'))));
  const message = messages.filter((candidate) => candidate.to === email).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const token = message && new URL(message.actionUrl).searchParams.get('token');
  if (!token) throw new Error(`Expected ${purpose} email for ${email}.`);
  return token;
}

async function verifiedUser(label) {
  const email = `${label}-${nonce}@example.invalid`;
  expect(await request('/auth/register', json('POST', { email, password, displayName: label })), 201, `${label} register`);
  expect(await request('/auth/verify-email', json('POST', { token: await actionToken(email, 'verify_email') })), 204, `${label} verify`);
  const login = await request('/auth/login', json('POST', { email, password }));
  expect(login, 201, `${label} login`);
  const token = login.body?.data?.token;
  if (typeof token !== 'string') throw new Error(`${label} login did not return token.`);
  return { email, token };
}

const health = await request('/health');
expect(health, 200, 'public health');
const allowedOrigin = await request('/health', { headers: { origin: 'http://localhost:8081' } });
expect(allowedOrigin, 200, 'allowed CORS origin');
if (allowedOrigin.response.headers.get('access-control-allow-origin') !== 'http://localhost:8081') throw new Error('Configured CORS origin was not reflected.');
if (!allowedOrigin.response.headers.get('x-frame-options')) throw new Error('Helmet response header is missing.');
const deniedOrigin = await request('/health', { headers: { origin: 'https://untrusted.example.invalid' } });
expect(deniedOrigin, 200, 'unlisted origin request');
if (deniedOrigin.response.headers.get('access-control-allow-origin')) throw new Error('Unlisted CORS origin was allowed.');
expect(await request('/cases'), 401, 'missing bearer default deny');
expect(await request('/cases', { headers: { authorization: 'Bearer malformed' } }), 401, 'malformed bearer');
expect(await request('/cases', { headers: { authorization: 'Basic not-a-bearer-token' } }), 401, 'wrong auth scheme');
expect(await request('/cases', { headers: { authorization: `Bearer ${'x'.repeat(43)}` } }), 401, 'random bearer');

const unknown = await request('/auth/login', json('POST', { email: `unknown-${nonce}@example.invalid`, password }));
const userA = await verifiedUser('user-a');
const wrongPassword = await request('/auth/login', json('POST', { email: userA.email, password: 'wrong-password' }));
expect(unknown, 401, 'unknown login');
expect(wrongPassword, 401, 'wrong-password login');
if (unknown.body?.error?.code !== 'INVALID_CREDENTIALS' || wrongPassword.body?.error?.code !== 'INVALID_CREDENTIALS') throw new Error('Login enumeration behavior is not equivalent.');
const forgotKnown = await request('/auth/forgot-password', json('POST', { email: userA.email }));
const forgotUnknown = await request('/auth/forgot-password', json('POST', { email: `forgot-unknown-${nonce}@example.invalid` }));
expect(forgotKnown, 202, 'known forgot-password');
expect(forgotUnknown, 202, 'unknown forgot-password');

const userB = await verifiedUser('user-b');
const accountB = await request('/account/me', { headers: { authorization: `Bearer ${userB.token}` } });
expect(accountB, 200, 'B account');
const userBId = accountB.body?.data?.id;
if (typeof userBId !== 'string') throw new Error('B account response has no id.');
const forgedCaseRequest = json('POST', { displayLabel: 'Security probe A case', referenceCode: `PROBE-${nonce}`, ownerUserId: userBId, userId: userBId }, userA.token);
forgedCaseRequest.headers['x-owner-user-id'] = userBId;
const createdCase = await request('/cases', forgedCaseRequest);
expect(createdCase, 201, 'A case creation');
const caseId = createdCase.body?.id;
if (typeof caseId !== 'string') throw new Error('A case response has no id.');
expect(await request(`/cases/${caseId}`, { headers: { authorization: `Bearer ${userB.token}` } }), 404, 'cross-user case isolation');
expect(await request(`/cases/${caseId}`, { headers: { authorization: `Bearer ${userA.token}` } }), 200, 'forged ownership values ignored');

const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'security-probe.png');
const uploaded = await request(`/cases/${caseId}/media`, { method: 'POST', headers: { authorization: `Bearer ${userA.token}` }, body: form });
expect(uploaded, 201, 'A media upload');
const mediaId = uploaded.body?.id;
if (typeof mediaId !== 'string') throw new Error('Media response has no id.');
expect(await request(`/media/${mediaId}/content`), 401, 'unauthenticated media');
expect(await request(`/media/${mediaId}/content`, { headers: { authorization: `Bearer ${userB.token}` } }), 404, 'cross-user media isolation');
const ownMedia = await request(`/media/${mediaId}/content`, { headers: { authorization: `Bearer ${userA.token}` } });
expect(ownMedia, 200, 'owner media read');
if (ownMedia.response.headers.get('cache-control') !== 'private, no-store' || ownMedia.response.headers.get('x-content-type-options') !== 'nosniff') throw new Error('Protected media cache or MIME hardening headers missing.');

const ownSessions = await request('/account/sessions', { headers: { authorization: `Bearer ${userA.token}` } });
expect(ownSessions, 200, 'own session list');
if (JSON.stringify(ownSessions.body).includes('tokenHash') || JSON.stringify(ownSessions.body).includes(userA.token)) throw new Error('Session listing exposed a token secret.');
const otherSessions = await request('/account/sessions', { headers: { authorization: `Bearer ${userB.token}` } });
expect(otherSessions, 200, 'B session list');
const otherSessionId = otherSessions.body?.data?.[0]?.sessionId;
if (typeof otherSessionId !== 'string') throw new Error('B session not listed.');
expect(await request(`/account/sessions/${otherSessionId}`, { method: 'DELETE', headers: { authorization: `Bearer ${userA.token}` } }), 404, 'cross-user session revoke isolation');
expect(await request('/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${userA.token}` } }), 204, 'logout');
expect(await request('/account/me', { headers: { authorization: `Bearer ${userA.token}` } }), 401, 'logout revoked bearer');

console.log(JSON.stringify({ status: 'ok', caseId, mediaId, checked: ['cors-allowlist', 'helmet', 'default-deny', 'malformed-bearer', 'wrong-scheme', 'random-bearer', 'ownership-injection', 'login-enumeration', 'forgot-enumeration', 'case-isolation', 'media-isolation', 'session-isolation', 'logout', 'media-headers'] }, null, 2));

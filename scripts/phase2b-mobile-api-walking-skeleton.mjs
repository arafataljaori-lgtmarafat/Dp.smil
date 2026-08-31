import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.PHASE2B_API_BASE ?? 'http://127.0.0.1:3010/api/v1';
const outbox = process.env.PHASE2B_OUTBOX ?? '/tmp/dentpilot-phase2b-outbox';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `mobile-${suffix}@example.invalid`;
const password = 'mobile-initial-password';
const changedPassword = 'mobile-changed-password';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+FF0X6QAAAABJRU5ErkJggg==', 'base64');

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}

function expectStatus(result, status, label) {
  if (result.response.status !== status) throw new Error(`${label}: expected ${status}, received ${result.response.status}: ${JSON.stringify(result.body)}`);
}

function json(method, body, token) {
  return { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) };
}

async function actionToken(purpose) {
  const messages = await Promise.all((await readdir(outbox)).filter((name) => name.endsWith(`${purpose}.json`)).map(async (name) => JSON.parse(await readFile(join(outbox, name), 'utf8'))));
  const message = messages.filter((candidate) => candidate.to === email).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const token = message && new URL(message.actionUrl).searchParams.get('token');
  if (!token) throw new Error(`No ${purpose} token was delivered for test account.`);
  return token;
}

const registration = await request('/auth/register', json('POST', { email, password, displayName: 'Mobile API walking skeleton' }));
expectStatus(registration, 201, 'registration');
if ('token' in (registration.body?.data ?? {})) throw new Error('Registration exposed a session token.');
const verification = await request('/auth/verify-email', json('POST', { token: await actionToken('verify_email') }));
expectStatus(verification, 204, 'email verification');
const firstLogin = await request('/auth/login', json('POST', { email, password }));
expectStatus(firstLogin, 201, 'first login');
const firstToken = firstLogin.body?.data?.token;
if (typeof firstToken !== 'string') throw new Error('Login returned no opaque token.');
const account = await request('/account/me', { headers: { authorization: `Bearer ${firstToken}` } });
expectStatus(account, 200, 'account bootstrap');
if (account.body?.data?.email !== email || 'tokenHash' in account.body.data) throw new Error('Account bootstrap response is not safe.');
const profile = await request('/account/me', json('PATCH', { displayName: 'Updated mobile account' }, firstToken));
expectStatus(profile, 200, 'display name update');

const secondLogin = await request('/auth/login', json('POST', { email, password }));
expectStatus(secondLogin, 201, 'second session login');
const secondToken = secondLogin.body?.data?.token;
if (typeof secondToken !== 'string') throw new Error('Second login returned no opaque token.');
const sessions = await request('/account/sessions', { headers: { authorization: `Bearer ${firstToken}` } });
expectStatus(sessions, 200, 'session listing');
if (JSON.stringify(sessions.body).includes('tokenHash') || JSON.stringify(sessions.body).includes(firstToken) || JSON.stringify(sessions.body).includes(secondToken)) throw new Error('Session list exposed a secret.');
const secondSession = sessions.body?.data?.find((session) => !session.currentSession)?.sessionId;
if (typeof secondSession !== 'string') throw new Error('Second session did not appear in session list.');
const revocation = await request(`/account/sessions/${secondSession}`, { method: 'DELETE', headers: { authorization: `Bearer ${firstToken}` } });
expectStatus(revocation, 204, 'owned session revocation');
const revokedSession = await request('/account/me', { headers: { authorization: `Bearer ${secondToken}` } });
expectStatus(revokedSession, 401, 'revoked second session');

const createdCase = await request('/cases', json('POST', { displayLabel: 'Mobile authenticated case', referenceCode: `MOB-${suffix}` }, firstToken));
expectStatus(createdCase, 201, 'case creation');
const caseId = createdCase.body?.id;
if (typeof caseId !== 'string') throw new Error('Case creation returned no id.');
const uploadSession = await request(`/cases/${caseId}/media-uploads`, {
  method: 'POST',
  headers: { authorization: `Bearer ${firstToken}`, 'idempotency-key': `phase3b-mobile-upload-${suffix}` },
});
expectStatus(uploadSession, 201, 'source upload session creation');
const uploadId = uploadSession.body?.uploadId;
if (typeof uploadId !== 'string') throw new Error('Media upload session returned no upload id.');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'mobile-source.png');
const media = await request(`/media-uploads/${uploadId}/content`, { method: 'POST', headers: { authorization: `Bearer ${firstToken}` }, body: form });
expectStatus(media, 201, 'streaming source upload');
const sourceMediaId = media.body?.mediaId;
if (typeof sourceMediaId !== 'string' || media.body?.status !== 'committed') throw new Error('Streaming media upload did not commit a source id.');
const project = await request(`/cases/${caseId}/projects`, json('POST', { sourceMediaId }, firstToken));
expectStatus(project, 201, 'project creation');
const projectId = project.body?.id;
if (typeof projectId !== 'string') throw new Error('Project creation returned no id.');
const idempotencyKey = `phase2b-${randomUUID()}`;
const generation = await request(`/projects/${projectId}/generations`, { method: 'POST', headers: { authorization: `Bearer ${firstToken}`, 'idempotency-key': idempotencyKey } });
expectStatus(generation, 201, 'generation request');
const jobId = generation.body?.id;
if (typeof jobId !== 'string') throw new Error('Generation request returned no id.');
const duplicate = await request(`/projects/${projectId}/generations`, { method: 'POST', headers: { authorization: `Bearer ${firstToken}`, 'idempotency-key': idempotencyKey } });
expectStatus(duplicate, 201, 'generation idempotency retry');
if (duplicate.body?.id !== jobId || duplicate.body?.created !== false) throw new Error('Generation retry was not idempotent.');
let result;
for (let attempt = 0; attempt < 40; attempt += 1) {
  result = await request(`/generations/${jobId}`, { headers: { authorization: `Bearer ${firstToken}` } });
  expectStatus(result, 200, 'generation status');
  if (result.body?.job?.status === 'succeeded' || result.body?.job?.status === 'failed') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (result?.body?.job?.status !== 'succeeded' || !result.body.version?.resultMediaUrl) throw new Error('Mock generation did not succeed.');
const protectedResult = await request(result.body.version.resultMediaUrl.replace('/api/v1', ''), { headers: { authorization: `Bearer ${firstToken}` } });
expectStatus(protectedResult, 200, 'protected generated media');

const passwordChange = await request('/account/change-password', json('POST', { currentPassword: password, newPassword: changedPassword }, firstToken));
expectStatus(passwordChange, 204, 'change password');
const invalidated = await request('/account/me', { headers: { authorization: `Bearer ${firstToken}` } });
expectStatus(invalidated, 401, 'password change invalidated current token');
const relogin = await request('/auth/login', json('POST', { email, password: changedPassword }));
expectStatus(relogin, 201, 'login with changed password');
const finalToken = relogin.body?.data?.token;
if (typeof finalToken !== 'string') throw new Error('Re-login returned no opaque token.');
const logoutAll = await request('/auth/logout-all', { method: 'POST', headers: { authorization: `Bearer ${finalToken}` } });
expectStatus(logoutAll, 204, 'logout all');
const afterLogoutAll = await request('/account/me', { headers: { authorization: `Bearer ${finalToken}` } });
expectStatus(afterLogoutAll, 401, 'logout all invalidated current token');

console.log(JSON.stringify({ status: 'ok', caseId, sourceMediaId, projectId, jobId, verifiedAccount: true, sessionIsolation: true, generationStatus: result.body.job.status, passwordChangeForcedRelogin: true, logoutAllInvalidatedCurrentDevice: true }, null, 2));

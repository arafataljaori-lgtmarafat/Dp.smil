import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.PHASE2A2_API_BASE ?? 'http://127.0.0.1:3009/api/v1';
const outbox = process.env.PHASE2A2_OUTBOX ?? '/home/ubuntu/dentpilot-smile/apps/api/.local/email-outbox';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `walk-${suffix}@example.invalid`;
const password = 'walking-skeleton-original-password';
const replacementPassword = 'walking-skeleton-replacement-password';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WQAAAABJRU5ErkJggg==', 'base64');

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}

function jsonOptions(method, body, bearer) {
  return { method, headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) };
}

async function actionToken(purpose) {
  const names = (await readdir(outbox)).filter((name) => name.endsWith(`${purpose}.json`)).sort();
  const latest = names.at(-1);
  if (!latest) throw new Error(`No ${purpose} outbox message was found.`);
  const message = JSON.parse(await readFile(join(outbox, latest), 'utf8'));
  const token = new URL(message.actionUrl).searchParams.get('token');
  if (!token) throw new Error(`Outbox ${purpose} message has no token.`);
  return token;
}

function expectStatus(result, status, label) {
  if (result.response.status !== status) throw new Error(`${label}: expected ${status}, received ${result.response.status}: ${JSON.stringify(result.body)}`);
}

const register = await request('/auth/register', jsonOptions('POST', { email, password, displayName: 'Authenticated walking skeleton' }));
expectStatus(register, 201, 'registration');
const verify = await request('/auth/verify-email', jsonOptions('POST', { token: await actionToken('verify_email') }));
expectStatus(verify, 204, 'verification');
const login = await request('/auth/login', jsonOptions('POST', { email, password }));
expectStatus(login, 201, 'login');
const bearer = login.body?.data?.token;
if (typeof bearer !== 'string') throw new Error('Login did not return an opaque session token.');

const denied = await request('/cases');
expectStatus(denied, 401, 'default deny');
const me = await request('/account/me', { headers: { authorization: `Bearer ${bearer}` } });
expectStatus(me, 200, 'authenticated account');

const caseResult = await request('/cases', jsonOptions('POST', { displayLabel: 'Authenticated phase 2A.2 case', referenceCode: `AUTH-${suffix}` }, bearer));
expectStatus(caseResult, 201, 'authenticated case creation');
const caseId = caseResult.body?.id;
if (typeof caseId !== 'string') throw new Error('Case creation returned no id.');

const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'auth-source.png');
const mediaResult = await request(`/cases/${caseId}/media`, { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: form });
expectStatus(mediaResult, 201, 'authenticated media upload');
const sourceMediaId = mediaResult.body?.id;
if (typeof sourceMediaId !== 'string') throw new Error('Media upload returned no id.');

const projectResult = await request(`/cases/${caseId}/projects`, jsonOptions('POST', { sourceMediaId }, bearer));
expectStatus(projectResult, 201, 'authenticated project creation');
const projectId = projectResult.body?.id;
if (typeof projectId !== 'string') throw new Error('Project creation returned no id.');

const idempotencyKey = `phase2a2-auth-${randomUUID()}`;
const generation = await request(`/projects/${projectId}/generations`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': idempotencyKey } });
expectStatus(generation, 201, 'authenticated generation creation');
const jobId = generation.body?.id;
if (typeof jobId !== 'string' || generation.body?.created !== true) throw new Error('Generation creation did not return a new job.');
const duplicate = await request(`/projects/${projectId}/generations`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'idempotency-key': idempotencyKey } });
expectStatus(duplicate, 201, 'authenticated generation idempotency retry');
if (duplicate.body?.id !== jobId || duplicate.body?.created !== false) throw new Error('HTTP idempotency retry was not stable.');

let status;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const result = await request(`/generations/${jobId}`, { headers: { authorization: `Bearer ${bearer}` } });
  expectStatus(result, 200, 'authenticated generation polling');
  status = result.body;
  if (status?.job?.status === 'succeeded' || status?.job?.status === 'failed') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (status?.job?.status !== 'succeeded' || !status.version?.resultMediaUrl) throw new Error(`Generation did not succeed: ${JSON.stringify(status)}`);
const output = await request(status.version.resultMediaUrl.startsWith('/api/v1/') ? status.version.resultMediaUrl.replace('/api/v1', '') : status.version.resultMediaUrl, { headers: { authorization: `Bearer ${bearer}` } });
expectStatus(output, 200, 'protected generated media retrieval');

const forgot = await request('/auth/forgot-password', jsonOptions('POST', { email }));
expectStatus(forgot, 202, 'forgot password');
const reset = await request('/auth/reset-password', jsonOptions('POST', { resetToken: await actionToken('reset_password'), newPassword: replacementPassword }));
expectStatus(reset, 204, 'password reset');
const revoked = await request('/account/me', { headers: { authorization: `Bearer ${bearer}` } });
expectStatus(revoked, 401, 'reset revoked prior session');
const relogin = await request('/auth/login', jsonOptions('POST', { email, password: replacementPassword }));
expectStatus(relogin, 201, 'login with reset password');

console.log(JSON.stringify({ status: 'ok', email, caseId, sourceMediaId, projectId, jobId, duplicateJobId: duplicate.body.id, generationStatus: status.job.status }, null, 2));

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.PHASE3C_API_BASE ?? 'http://127.0.0.1:3012/api/v1';
const outbox = process.env.PHASE3C_OUTBOX ?? '/tmp/dentpilot-phase3c-outbox';
const suffix = crypto.randomUUID();
const email = `phase3c-${suffix}@example.invalid`;
const password = 'phase3c-real-media-password';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+FF0X6QAAAABJRU5ErkJggg==', 'base64');

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = response.status === 204 ? '' : await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}
function expectStatus(result, expected, label) {
  if (result.response.status !== expected) throw new Error(`${label}: expected ${expected}, received ${result.response.status}: ${JSON.stringify(result.body)}`);
}
function json(method, body, token) {
  return { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) };
}
async function verificationToken() {
  const messages = await Promise.all((await readdir(outbox)).filter((name) => name.endsWith('verify_email.json')).map(async (name) => JSON.parse(await readFile(join(outbox, name), 'utf8'))));
  const message = messages.filter((item) => item.to === email).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const token = message && new URL(message.actionUrl).searchParams.get('token');
  if (!token) throw new Error('No verification token found for Phase 3C account.');
  return token;
}

const registration = await request('/auth/register', json('POST', { email, password, displayName: 'Phase 3C real workflow' }));
expectStatus(registration, 201, 'register');
expectStatus(await request('/auth/verify-email', json('POST', { token: await verificationToken() })), 204, 'verify');
const login = await request('/auth/login', json('POST', { email, password }));
expectStatus(login, 201, 'login');
const token = login.body?.data?.token;
if (typeof token !== 'string') throw new Error('Login returned no session token.');
const caseResult = await request('/cases', json('POST', { displayLabel: 'Phase 3C media case', referenceCode: `P3C-${suffix.slice(0, 8)}` }, token));
expectStatus(caseResult, 201, 'create case');
const caseId = caseResult.body?.id;
if (typeof caseId !== 'string') throw new Error('Case creation did not return an id.');

const uploadKey = crypto.randomUUID();
const created = await request(`/cases/${caseId}/media-uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': uploadKey } });
expectStatus(created, 201, 'create upload session');
const uploadId = created.body?.uploadId;
if (typeof uploadId !== 'string' || created.body?.status !== 'created') throw new Error('Upload session was not created safely.');
const sameSession = await request(`/cases/${caseId}/media-uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': uploadKey } });
expectStatus(sameSession, 201, 'idempotent upload-session retry');
if (sameSession.body?.uploadId !== uploadId) throw new Error('Same upload idempotency key did not recover the durable session.');

const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'phase3c-source.png');
const committedResponse = await fetch(`${base}/media-uploads/${uploadId}/content`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
if (!committedResponse.ok) throw new Error(`content commit failed with ${committedResponse.status}`);
// Injection point: the real backend has committed; the client deliberately discards this successful response.
const responseLoss = new Error('SIMULATED_RESPONSE_LOSS_AFTER_REAL_COMMIT');
if (responseLoss.message.length === 0) throw responseLoss;

const recovered = await request(`/media-uploads/${uploadId}`, { headers: { authorization: `Bearer ${token}` } });
expectStatus(recovered, 200, 'recover upload status after response loss');
if (recovered.body?.status !== 'committed' || typeof recovered.body?.mediaId !== 'string') throw new Error('Uncertain outcome did not recover committed media id.');
const sourceMediaId = recovered.body.mediaId;
const workspace = await request(`/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } });
expectStatus(workspace, 200, 'refetch workspace');
const sources = workspace.body?.media?.filter((media) => media.kind === 'source') ?? [];
if (sources.length !== 1 || sources[0]?.id !== sourceMediaId) throw new Error('Response-loss recovery created duplicate source media.');
const downloaded = await fetch(`${base}/media/${sourceMediaId}/content`, { headers: { authorization: `Bearer ${token}` } });
if (!downloaded.ok) throw new Error(`Protected source download failed with ${downloaded.status}`);
if (Buffer.compare(png, Buffer.from(await downloaded.arrayBuffer())) !== 0) throw new Error('Authenticated source bytes did not match the uploaded bytes.');

const project = await request(`/cases/${caseId}/projects`, json('POST', { sourceMediaId }, token));
expectStatus(project, 201, 'create project');
const projectId = project.body?.id;
if (typeof projectId !== 'string') throw new Error('Project creation returned no id.');
const generationKey = crypto.randomUUID();
const generation = await request(`/projects/${projectId}/generations`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': generationKey } });
expectStatus(generation, 201, 'request generation');
const jobId = generation.body?.id;
if (typeof jobId !== 'string') throw new Error('Generation request returned no id.');
const duplicateGeneration = await request(`/projects/${projectId}/generations`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': generationKey } });
expectStatus(duplicateGeneration, 201, 'generation idempotency retry');
if (duplicateGeneration.body?.id !== jobId || duplicateGeneration.body?.created !== false) throw new Error('Generation retry was not idempotent.');
let status;
for (let attempt = 0; attempt < 40; attempt += 1) {
  status = await request(`/generations/${jobId}`, { headers: { authorization: `Bearer ${token}` } });
  expectStatus(status, 200, 'generation status');
  if (status.body?.job?.status === 'succeeded' || status.body?.job?.status === 'failed') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (status?.body?.job?.status !== 'succeeded' || !status.body?.version?.resultMediaUrl) throw new Error('Generation did not produce a protected result.');
const result = await fetch(`${base.replace(/\/api\/v1$/, '')}${status.body.version.resultMediaUrl}`, { headers: { authorization: `Bearer ${token}` } });
if (!result.ok) throw new Error(`Protected generation result failed with ${result.status}`);
expectStatus(await request('/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } }), 204, 'logout');
console.log(JSON.stringify({ status: 'ok', scenario: 'real-minio-media-workflow-with-response-loss', caseId, uploadId, sourceMediaId, projectId, jobId, sourceShaIntegrity: true, duplicateSourceMedia: false }, null, 2));

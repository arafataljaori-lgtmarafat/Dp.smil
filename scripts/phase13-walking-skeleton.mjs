import { randomUUID } from 'node:crypto';

const baseUrl = process.env.PHASE13_API_BASE_URL ?? 'http://127.0.0.1:3004/api/v1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WQAAAABJRU5ErkJggg==', 'base64');

async function request(path, options = {}) {
  const target = path.startsWith('/api/v1/') ? `${new URL(baseUrl).origin}${path}` : `${baseUrl}${path}`;
  const response = await fetch(target, options);
  const text = await response.text();
  let body;
  try {
    body = text.length === 0 ? null : JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return { response, body };
}

const caseResult = await request('/cases', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ displayLabel: 'Phase 1.3 end-to-end fictional case', referenceCode: 'E2E-PHASE-13' }),
});
const caseId = caseResult.body.id;
if (typeof caseId !== 'string') throw new Error('Case creation returned no id.');

const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'phase13-source.png');
const mediaResult = await request(`/cases/${caseId}/media`, { method: 'POST', body: form });
const sourceMediaId = mediaResult.body.id;
if (typeof sourceMediaId !== 'string') throw new Error('Media upload returned no id.');

const projectResult = await request(`/cases/${caseId}/projects`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sourceMediaId }),
});
const projectId = projectResult.body.id;
if (typeof projectId !== 'string') throw new Error('Project creation returned no id.');

const idempotencyKey = `phase13-e2e-${randomUUID()}`;
const generationResult = await request(`/projects/${projectId}/generations`, {
  method: 'POST',
  headers: { 'idempotency-key': idempotencyKey },
});
const generationJobId = generationResult.body.id;
if (typeof generationJobId !== 'string' || generationResult.body.created !== true) {
  throw new Error('Initial generation request did not create a job.');
}
const duplicateGenerationResult = await request(`/projects/${projectId}/generations`, {
  method: 'POST',
  headers: { 'idempotency-key': idempotencyKey },
});
if (duplicateGenerationResult.body.id !== generationJobId || duplicateGenerationResult.body.created !== false) {
  throw new Error(`HTTP idempotency retry was not stable: ${JSON.stringify(duplicateGenerationResult.body)}`);
}

let generation;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const result = await request(`/generations/${generationJobId}`);
  generation = result.body;
  if (generation.job.status === 'succeeded' || generation.job.status === 'failed') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (generation?.job.status !== 'succeeded' || generation.version === null || generation.version === undefined) {
  throw new Error(`Generation did not succeed: ${JSON.stringify(generation)}`);
}

const output = await request(generation.version.resultMediaUrl);
if (!(output.response.headers.get('content-type') ?? '').startsWith('image/png')) {
  throw new Error(`Generated output content type was unexpected: ${output.response.headers.get('content-type')}`);
}

const workspace = await request(`/cases/${caseId}`);
const auditTypes = workspace.body.audits.map((event) => event.eventType);
for (const required of ['CaseCreated', 'MediaUploaded', 'CreationProjectCreated', 'GenerationRequested', 'GenerationStarted', 'GenerationSucceeded']) {
  if (!auditTypes.includes(required)) throw new Error(`Workspace history omitted ${required}.`);
}
if (!workspace.body.generations.some((job) => job.id === generationJobId && job.status === 'succeeded')) {
  throw new Error('Workspace did not expose the succeeded generation job.');
}

console.log(JSON.stringify({
  caseId,
  sourceMediaId,
  projectId,
  generationJobId,
  duplicateGenerationJobId: duplicateGenerationResult.body.id,
  versionId: generation.version.id,
  auditTypes,
}, null, 2));

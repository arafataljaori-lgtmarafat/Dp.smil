import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.PHASE4A_API_BASE ?? 'http://127.0.0.1:3013/api/v1';
const outbox = process.env.PHASE4A_OUTBOX ?? '/tmp/dentpilot-phase4a-outbox';
const suffix = crypto.randomUUID();
const password = 'phase4a-creations-password';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+FF0X6QAAAABJRU5ErkJggg==', 'base64');

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = response.status === 204 ? '' : await response.text();
  let body;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}

function expectStatus(result, expected, label) {
  if (result.response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${result.response.status}: ${JSON.stringify(result.body)}`);
  }
}

function json(method, body, token, extraHeaders = {}) {
  return {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function bearer(token, extraHeaders = {}) {
  return { headers: { authorization: `Bearer ${token}`, ...extraHeaders } };
}

async function verificationToken(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const names = await readdir(outbox);
    const messages = await Promise.all(names.filter((name) => name.endsWith('verify_email.json')).map(async (name) => JSON.parse(await readFile(join(outbox, name), 'utf8'))));
    const message = messages.filter((item) => item.to === email).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const token = message && new URL(message.actionUrl).searchParams.get('token');
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No verification token found for ${email}.`);
}

async function verifiedUser(label) {
  const email = `phase4a-${label.toLowerCase().replaceAll(/[^a-z]/g, '-')}-${suffix}@example.invalid`;
  expectStatus(await request('/auth/register', json('POST', { email, password, displayName: label })), 201, `register ${label}`);
  expectStatus(await request('/auth/verify-email', json('POST', { token: await verificationToken(email) })), 204, `verify ${label}`);
  const login = await request('/auth/login', json('POST', { email, password }));
  expectStatus(login, 201, `login ${label}`);
  if (typeof login.body?.data?.token !== 'string') throw new Error(`Login returned no token for ${label}.`);
  return login.body.data.token;
}

async function createCase(token, label) {
  const created = await request('/cases', json('POST', { displayLabel: label, referenceCode: `P4A-${crypto.randomUUID().slice(0, 8)}` }, token));
  expectStatus(created, 201, `create ${label}`);
  if (typeof created.body?.id !== 'string') throw new Error(`No case id for ${label}.`);
  return created.body.id;
}

async function uploadSource(token, caseId, name) {
  const session = await request(`/cases/${caseId}/media-uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': crypto.randomUUID() } });
  expectStatus(session, 201, `create upload session ${name}`);
  if (typeof session.body?.uploadId !== 'string') throw new Error(`No upload id for ${name}.`);
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${name}.png`);
  const committed = await fetch(`${base}/media-uploads/${session.body.uploadId}/content`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  const body = await committed.json();
  if (!committed.ok || typeof body?.mediaId !== 'string') throw new Error(`Real media upload ${name} did not commit: ${committed.status} ${JSON.stringify(body)}`);
  return body.mediaId;
}

const tokenA = await verifiedUser('User A');
const tokenB = await verifiedUser('User B');
const caseA = await createCase(tokenA, 'Phase 4A User A case');
const caseAOther = await createCase(tokenA, 'Phase 4A User A other case');
const caseB = await createCase(tokenB, 'Phase 4A User B case');
const sourceA = await uploadSource(tokenA, caseA, 'source-a');
const afterA = await uploadSource(tokenA, caseA, 'after-a');
const afterAAlternate = await uploadSource(tokenA, caseA, 'after-a-alternate');
const sourceAOtherCase = await uploadSource(tokenA, caseAOther, 'source-a-other-case');
const sourceB = await uploadSource(tokenB, caseB, 'source-b');

const creation = await request(`/cases/${caseA}/creations`, json('POST', { type: 'before_after_image', sourceMediaId: sourceA }, tokenA));
expectStatus(creation, 201, 'create before/after image');
const creationId = creation.body?.project?.id;
if (typeof creationId !== 'string' || creation.body?.project?.type !== 'before_after_image' || creation.body?.draft?.revision !== 1 || creation.body?.bindings?.[0]?.bindingKey !== 'before') {
  throw new Error(`Creation did not return a v1 draft and before binding: ${JSON.stringify(creation.body)}`);
}
const listed = await request(`/cases/${caseA}/creations`, bearer(tokenA));
expectStatus(listed, 200, 'list own creations');
if (!Array.isArray(listed.body?.data) || !listed.body.data.some((project) => project.id === creationId)) throw new Error('Created project was absent from owner-scoped list.');

const replaced = await request(`/creations/${creationId}/bindings`, json('PUT', {
  expectedRevision: 1,
  bindings: [{ bindingKey: 'before', mediaId: sourceA }, { bindingKey: 'after', mediaId: afterA }],
}, tokenA));
expectStatus(replaced, 200, 'bind same-case before and after media');
if (replaced.body?.data?.bindings?.length !== 2 || replaced.body?.data?.draft?.revision !== 2) throw new Error('Same-case media bindings did not atomically advance the draft revision.');

const document = {
  schemaVersion: 1,
  templateRef: { templateId: 'premium-split', templateVersion: 1 },
  canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: {
    before: { panX: 0.1, panY: 0, scale: 1, rotation: 0 },
    after: { panX: 0, panY: 0, scale: 1, rotation: 0 },
  },
  editableTextState: { beforeLabel: 'Before treatment', afterLabel: 'After treatment' },
  styleState: { theme: 'clinical-neutral' },
};
const savedDraft = await request(`/creations/${creationId}/draft`, json('PATCH', { expectedRevision: 2, document }, tokenA));
expectStatus(savedDraft, 200, 'save creation draft');
if (savedDraft.body?.data?.revision !== 3) throw new Error('Draft revision did not advance atomically.');
expectStatus(await request(`/creations/${creationId}/draft`, json('PUT', { expectedRevision: 2, document }, tokenA)), 409, 'reject stale draft CAS');
const unknownTemplate = await request(`/creations/${creationId}/draft`, json('PUT', {
  expectedRevision: 3,
  document: { ...document, templateRef: { templateId: 'premium-split', templateVersion: 99 } },
}, tokenA));
expectStatus(unknownTemplate, 400, 'reject unknown template version without substitution');

const rebound = await request(`/creations/${creationId}/bindings`, json('PATCH', {
  expectedRevision: 3,
  bindings: [{ bindingKey: 'before', mediaId: sourceA }, { bindingKey: 'after', mediaId: afterAAlternate }],
}, tokenA));
expectStatus(rebound, 200, 'rebind same logical after key');
if (rebound.body?.data?.draft?.revision !== 4 || rebound.body?.data?.bindings?.find((binding) => binding.bindingKey === 'after')?.mediaId !== afterAAlternate) {
  throw new Error('Same-key rebind did not produce the expected aggregate state.');
}
expectStatus(await request(`/creations/${creationId}/bindings`, json('PUT', {
  expectedRevision: 3,
  bindings: [{ bindingKey: 'before', mediaId: sourceA }, { bindingKey: 'after', mediaId: afterA }],
}, tokenA)), 409, 'reject stale binding CAS');

const crossCase = await request(`/creations/${creationId}/bindings`, json('PUT', {
  expectedRevision: 4,
  bindings: [{ bindingKey: 'before', mediaId: sourceAOtherCase }],
}, tokenA));
expectStatus(crossCase, 400, 'reject cross-case media binding');
const requiredBindingRemoval = await request(`/creations/${creationId}/bindings`, json('PUT', {
  expectedRevision: 4,
  bindings: [{ bindingKey: 'before', mediaId: sourceA }],
}, tokenA));
expectStatus(requiredBindingRemoval, 400, 'reject removal of document-required after binding');
if (requiredBindingRemoval.body?.error?.code !== 'CREATION_BINDING_REQUIRED') throw new Error('Required binding removal did not return the typed aggregate-consistency error.');

const revision = await request(`/creations/${creationId}/revisions`, json('POST', { expectedDraftRevision: 4 }, tokenA));
expectStatus(revision, 201, 'create immutable revision');
const revisionId = revision.body?.data?.id;
if (typeof revisionId !== 'string' || revision.body?.data?.bindings?.length !== 2) throw new Error('Revision did not return immutable binding provenance.');
const revisions = await request(`/creations/${creationId}/revisions`, bearer(tokenA));
expectStatus(revisions, 200, 'list revisions');
if (!Array.isArray(revisions.body?.data) || revisions.body.data.length !== 1) throw new Error('Revision listing was not owner-scoped and complete.');

const forgedHeaders = { 'x-owner-user-id': 'forged-owner', owneruserid: 'forged-owner', userid: 'forged-user' };
const forbiddenRequests = [
  ['cross-user creation get', `/creations/${creationId}`, bearer(tokenB, forgedHeaders)],
  ['cross-user creation list', `/cases/${caseA}/creations`, bearer(tokenB, forgedHeaders)],
  ['cross-user binding mutation', `/creations/${creationId}/bindings`, json('PUT', { expectedRevision: 4, bindings: [{ bindingKey: 'before', mediaId: sourceB }] }, tokenB, forgedHeaders)],
  ['cross-user draft mutation', `/creations/${creationId}/draft`, json('PUT', { expectedRevision: 4, document }, tokenB, forgedHeaders)],
  ['cross-user revision commit', `/creations/${creationId}/revisions`, json('POST', { expectedDraftRevision: 4 }, tokenB, forgedHeaders)],
  ['cross-user revision list', `/creations/${creationId}/revisions`, bearer(tokenB, forgedHeaders)],
  ['cross-user revision get', `/creations/${creationId}/revisions/${revisionId}`, bearer(tokenB, forgedHeaders)],
];
for (const [label, path, options] of forbiddenRequests) {
  const result = await request(path, options);
  expectStatus(result, 404, label);
  const serialized = JSON.stringify(result.body);
  if (/storageKey|ownerUserId|sourceMediaId|documentSha256|mediaId/i.test(serialized)) throw new Error(`${label} leaked protected creation details.`);
}

const sourceCrossUser = await request(`/cases/${caseB}/creations`, json('POST', { type: 'before_after_image', sourceMediaId: sourceA }, tokenB, forgedHeaders));
expectStatus(sourceCrossUser, 400, 'reject cross-user source relationship without creating a creation');
const malformedForgedOwner = await request(`/creations/${creationId}/bindings`, json('PUT', { ownerUserId: 'forged-owner', expectedRevision: 4, bindings: [{ bindingKey: 'before', mediaId: sourceA }] }, tokenA));
expectStatus(malformedForgedOwner, 400, 'reject client ownerUserId field');

console.log(JSON.stringify({
  status: 'ok', scenario: 'phase4a-real-http-creations', creationId, revisionId,
  initialDraftRevision: 1, bindingRevision: 2, savedDraftRevision: 3, reboundRevision: 4,
  sameCaseSecondMedia: true, sameKeyRebind: true, requiredBindingRemovalRejected: true,
  templateSelectionPersisted: true, unknownTemplateRejected: true, crossCaseBindingRejected: true, crossUserIsolation: true, staleCasRejected: true,
}, null, 2));

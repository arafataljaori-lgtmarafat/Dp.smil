import {
  canonicalVideoExportRequestPayload,
  currentVideoRendererContractVersion,
  HttpSmileSimulationProvider,
  HeadlessCanvasRenderer,
  VideoExportService,
} from '../packages/application/dist/index.js';
import { createHash } from 'node:crypto';

console.log('====================================================');
console.log(' DentPilot Phase 5 & 6 E2E Integration Suite ');
console.log('====================================================\n');

async function runE2eSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      failed++;
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      passed++;
      console.log(`✓ PASS: ${message}`);
    }
  }

  // 1. Test Video Export Identity & Idempotency Serialization
  console.log('[1/4] Testing Video Export Identity Canonicalization...');
  const identity1 = {
    ownerUserId: '00000000-0000-0000-0000-000000000001',
    projectId: '00000000-0000-0000-0000-000000000002',
    revisionId: '00000000-0000-0000-0000-000000000003',
    documentSha256: 'a'.repeat(64),
    templateId: 'classic-reveal',
    templateVersion: 1,
    boundAssets: [
      { bindingKey: 'before', mediaId: 'm1', sha256: 'b'.repeat(64) },
      { bindingKey: 'after', mediaId: 'm2', sha256: 'c'.repeat(64) },
    ],
    renderProfileKey: 'export',
    rendererContractVersion: currentVideoRendererContractVersion(),
  };

  const identity2 = {
    ...identity1,
    boundAssets: [
      { bindingKey: 'after', mediaId: 'm2', sha256: 'c'.repeat(64) },
      { bindingKey: 'before', mediaId: 'm1', sha256: 'b'.repeat(64) },
    ],
  };

  const payload1 = canonicalVideoExportRequestPayload(identity1);
  const payload2 = canonicalVideoExportRequestPayload(identity2);

  assert(payload1 === payload2, 'Unordered bound assets produce identical canonical JSON payload');

  const hash1 = createHash('sha256').update(payload1).digest('hex');
  assert(hash1.length === 64, 'Derived request fingerprint is a valid 64-character SHA-256 string');

  // 2. Test Headless Canvas 2D Engine
  console.log('\n[2/4] Testing Headless Canvas 2D Frame Rendering Engine...');
  const renderer = new HeadlessCanvasRenderer();
  const samplePlan = {
    template: { id: 'classic-reveal', version: 1, aspectRatio: 'portrait_4_5' },
    canvas: { width: 500, height: 500 },
    styleToken: 'clinical-neutral',
    commands: [
      { type: 'background', id: 'bg', zIndex: 0, colorToken: 'canvas' },
      { type: 'shape', id: 's1', zIndex: 1, rect: { x: 50, y: 50, width: 400, height: 400 }, fillToken: 'accent', cornerRadius: 16 },
      { type: 'text', id: 't1', zIndex: 2, text: 'Clinical Test', rect: { x: 60, y: 60, width: 300, height: 40 }, colorToken: 'white', fontSize: 24, align: 'left' },
    ],
  };

  const rawBytes = await renderer.renderFrame(samplePlan, 500, 500);
  assert(rawBytes instanceof Uint8Array, 'Headless renderer returns Uint8Array buffer');
  assert(rawBytes.length === 500 * 500 * 4, 'Raw buffer matches RGBA 500x500 resolution (1,000,000 bytes)');

  // 3. Test Video Export Service Idempotency
  console.log('\n[3/4] Testing Video Export Service Idempotency...');
  const mockRepo = {
    jobs: new Map(),
    async insertJobAndVersion(job, version) {
      this.jobs.set(job.requestFingerprint, job);
    },
    async findJobByFingerprint(fp) {
      return this.jobs.get(fp) ?? null;
    },
  };
  const mockUow = {
    transaction: async (work) => work({ videoExports: mockRepo }),
  };
  const mockDigest = {
    sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex'),
  };
  const mockQueue = { dispatchExport: async () => {} };
  let idCount = 0;
  const mockIds = { next: () => `uuid-${++idCount}` };
  const mockClock = { now: () => new Date() };

  const service = new VideoExportService(mockUow, mockDigest, mockQueue, mockIds, mockClock);

  const req1 = await service.requestExport(identity1);
  assert(req1.reused === false, 'First export request creates new VideoExportJob record');

  const req2 = await service.requestExport(identity2);
  assert(req2.reused === true, 'Subsequent export request with identical parameters reuses existing Job ID');
  assert(req1.jobId === req2.jobId, 'Reused request returns original Job ID');

  // 4. Test HTTP AI Provider Adapter
  console.log('\n[4/4] Testing HTTP Smile AI Provider Integration...');
  const fakeAiOutput = Buffer.from('FAKE_PNG_BYTES').toString('base64');
  globalThis.fetch = async (url, init) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        imageBase64: fakeAiOutput,
        width: 1200,
        height: 900,
        providerVersion: 'e2e-ai-v1',
      }),
    };
  };

  const aiProvider = new HttpSmileSimulationProvider({
    endpointUrl: 'https://ai.mock.local/simulate',
    apiKey: 'e2e-secret-key',
  });

  const aiResult = await aiProvider.generate({
    sourceBytes: new Uint8Array([1, 2, 3]),
    sourceMimeType: 'image/png',
    sourceSha256: 'a'.repeat(64),
    sourceMediaId: 'm1',
    generationContractVersion: 'v1',
    correlationId: 'corr-e2e',
  });

  assert(aiResult.width === 1200 && aiResult.height === 900, 'AI Provider parses dimensions correctly');
  assert(aiResult.providerVersion === 'e2e-ai-v1', 'AI Provider parses model version string');

  console.log(`\n====================================================`);
  console.log(` ALL CHECKS PASSED: ${passed} Passed | ${failed} Failed`);
  console.log(`====================================================\n`);
}

runE2eSuite().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});

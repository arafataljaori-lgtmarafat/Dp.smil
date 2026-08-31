import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const controllerPath = fileURLToPath(new URL('../src/controllers/media.controller.ts', import.meta.url));

describe('MediaController streaming upload invariant', () => {
  it('does not buffer multipart upload bodies in the HTTP route', async () => {
    const source = await readFile(controllerPath, 'utf8');
    expect(source).not.toMatch(/\btoBuffer\s*\(/);
    expect(source).toContain('@Inject(StreamingMediaIngestService)');
    expect(source).toContain('request.files()');
    expect(source).toContain('Exactly one file part is required');
    expect(source).toContain('this.streamingIngest.ingest(');
  });
});

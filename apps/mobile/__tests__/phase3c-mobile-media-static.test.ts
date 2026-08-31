import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');

async function source(path: string): Promise<string> {
  return readFile(join(mobileRoot, path), 'utf8');
}

describe('Phase 3C mobile media static safety', () => {
  it('removes the legacy direct upload route while retaining only the Phase 3B session endpoint', async () => {
    const [client, mediaApi] = await Promise.all([source('src/api/client.ts'), source('src/media/media-api.ts')]);
    expect(`${client}\n${mediaApi}`).not.toMatch(/\/cases\/\$\{caseId\}\/media(?!-uploads)/);
    expect(mediaApi).toContain('/cases/${caseId}/media-uploads');
    expect(mediaApi).toContain('/media-uploads/${uploadId}/content');
  });

  it('does not allow mobile media requests to choose server ownership or storage fields or encode patient bytes', async () => {
    const mediaSource = await Promise.all([
      source('src/media/media-api.ts'), source('src/media/media-picker.ts'), source('src/media/media-upload-orchestrator.ts'), source('src/media/media-upload-state.ts'),
    ]);
    const joined = mediaSource.join('\n');
    expect(joined).not.toMatch(/ownerUserId|storageKey|processingToken|targetMediaId|readAsStringAsync|\.base64\b|\{\s*uri\s*,\s*name\s*,\s*type\s*\}\s+as\s+never/);
    expect(await source('src/media/media-picker.ts')).toContain('base64: false');
  });
});

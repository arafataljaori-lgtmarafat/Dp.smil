import sharp from 'sharp';

import type {
  SmileSimulationProviderInput,
  SmileSimulationProviderOutput,
  SmileSimulationProviderPort,
} from '@dentpilot/application';

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const replacements: Readonly<Record<string, string>> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return replacements[character] ?? character;
  });
}

export class MockSmileSimulationProvider implements SmileSimulationProviderPort {
  public readonly key = 'mock-smile-simulation';

  public async generate(input: SmileSimulationProviderInput): Promise<SmileSimulationProviderOutput> {
    const shortHash = input.sourceSha256.slice(0, 12);
    const svg = `<svg width="1200" height="900" viewBox="0 0 1200 900" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="900" fill="#10202A"/>
      <rect x="48" y="48" width="1104" height="804" rx="20" fill="#F4F0E8"/>
      <rect x="80" y="80" width="1040" height="170" rx="12" fill="#B42318"/>
      <text x="600" y="165" font-family="Arial, sans-serif" font-size="72" font-weight="700" text-anchor="middle" fill="#FFFFFF">MOCK OUTPUT</text>
      <text x="600" y="375" font-family="Arial, sans-serif" font-size="52" font-weight="700" text-anchor="middle" fill="#10202A">NOT A CLINICAL SIMULATION</text>
      <line x1="190" y1="445" x2="1010" y2="445" stroke="#B42318" stroke-width="8"/>
      <text x="600" y="540" font-family="Arial, sans-serif" font-size="34" text-anchor="middle" fill="#44525A">Architecture validation artifact only</text>
      <text x="600" y="610" font-family="Arial, sans-serif" font-size="28" text-anchor="middle" fill="#44525A">Source checksum: ${escapeXml(shortHash)}</text>
      <text x="600" y="742" font-family="Arial, sans-serif" font-size="30" text-anchor="middle" fill="#B42318">NO DIAGNOSIS · NO TREATMENT PLAN · NO PREDICTION</text>
    </svg>`;
    const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
      bytes,
      mimeType: 'image/png',
      width: 1200,
      height: 900,
      providerVersion: 'phase1-deterministic-card-v1',
      parameters: {
        mode: 'architecture_validation',
        sourceChecksumPrefix: shortHash,
      },
    };
  }
}

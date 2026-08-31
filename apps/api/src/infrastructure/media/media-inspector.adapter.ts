import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { MediaValidationError } from '@dentpilot/domain';
import type { DigestPort, MediaInspectorPort } from '@dentpilot/application';

function detectMimeType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';

  if (isJpeg) return 'image/jpeg';
  if (isPng) return 'image/png';
  if (isWebp) return 'image/webp';
  throw new MediaValidationError('Image signature is not an accepted format.');
}

export class SharpMediaInspectorAdapter implements MediaInspectorPort {
  public async inspect(bytes: Uint8Array): Promise<{
    readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    readonly width: number;
    readonly height: number;
  }> {
    const mimeType = detectMimeType(bytes);
    try {
      const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: 36_000_000 }).metadata();
      if (metadata.width === undefined || metadata.height === undefined) {
        throw new MediaValidationError('Image dimensions could not be read.');
      }
      return { mimeType, width: metadata.width, height: metadata.height };
    } catch (cause) {
      if (cause instanceof MediaValidationError) {
        throw cause;
      }
      throw new MediaValidationError('Image could not be decoded safely.');
    }
  }
}

export class NodeSha256Adapter implements DigestPort {
  public sha256(bytes: Uint8Array): Promise<string> {
    return Promise.resolve(createHash('sha256').update(bytes).digest('hex'));
  }
}

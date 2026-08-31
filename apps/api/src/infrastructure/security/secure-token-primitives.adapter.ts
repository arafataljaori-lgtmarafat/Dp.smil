import { createHash, randomBytes } from 'node:crypto';

import type { SessionTokenGeneratorPort, TokenDigestPort } from '@dentpilot/application';

export class SecureSessionTokenGenerator implements SessionTokenGeneratorPort {
  public generate(): string {
    return randomBytes(32).toString('base64url');
  }
}

export class Sha256TokenDigest implements TokenDigestPort {
  public digest(plaintextToken: string): Promise<string> {
    return Promise.resolve(createHash('sha256').update(plaintextToken, 'utf8').digest('hex'));
  }
}

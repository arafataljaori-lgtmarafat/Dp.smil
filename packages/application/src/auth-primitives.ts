import type { AccountActionTokenPurpose } from '@dentpilot/domain';

import type { ClockPort, SessionTokenGeneratorPort, TokenDigestPort } from './ports.js';

export interface AuthTokenLifetimes {
  readonly sessionTtlSeconds: number;
  readonly emailVerificationTokenTtlSeconds: number;
  readonly passwordResetTokenTtlSeconds: number;
}

export interface IssuedOpaqueToken {
  readonly plaintextToken: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export class OpaqueAuthTokenFactory {
  public constructor(
    private readonly tokens: SessionTokenGeneratorPort,
    private readonly digest: TokenDigestPort,
    private readonly clock: ClockPort,
    private readonly lifetimes: AuthTokenLifetimes,
  ) {}

  public async issueSession(): Promise<IssuedOpaqueToken> {
    return this.issueForSeconds(this.lifetimes.sessionTtlSeconds);
  }

  public async issueAccountAction(purpose: AccountActionTokenPurpose): Promise<IssuedOpaqueToken> {
    const seconds = purpose === 'verify_email'
      ? this.lifetimes.emailVerificationTokenTtlSeconds
      : this.lifetimes.passwordResetTokenTtlSeconds;
    return this.issueForSeconds(seconds);
  }

  private async issueForSeconds(seconds: number): Promise<IssuedOpaqueToken> {
    const plaintextToken = this.tokens.generate();
    const tokenHash = await this.digest.digest(plaintextToken);
    const expiresAt = new Date(this.clock.now().getTime() + seconds * 1000);
    return { plaintextToken, tokenHash, expiresAt };
  }
}

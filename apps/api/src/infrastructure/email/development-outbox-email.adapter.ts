import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { EmailDeliveryPort } from '@dentpilot/application';

export class DevelopmentOutboxEmailAdapter implements EmailDeliveryPort {
  public constructor(private readonly outboxRoot: string) {}

  public async sendAccountAction(input: {
    readonly to: string;
    readonly displayName: string;
    readonly purpose: 'verify_email' | 'reset_password';
    readonly actionUrl: string;
  }): Promise<void> {
    await mkdir(this.outboxRoot, { recursive: true, mode: 0o700 });
    const filename = `${Date.now()}-${crypto.randomUUID()}-${input.purpose}.json`;
    const body = {
      to: input.to,
      displayName: input.displayName,
      purpose: input.purpose,
      actionUrl: input.actionUrl,
      createdAt: new Date().toISOString(),
    };
    await writeFile(join(this.outboxRoot, filename), `${JSON.stringify(body)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

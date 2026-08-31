import type { AccountActionEmailPurpose } from '@dentpilot/application';

export class AccountActionLinkFactory {
  public constructor(private readonly actionUrlBase: string) {}

  public create(purpose: AccountActionEmailPurpose, plaintextToken: string): string {
    const url = new URL(this.actionUrlBase);
    url.searchParams.set('purpose', purpose);
    url.searchParams.set('token', plaintextToken);
    return url.toString();
  }
}

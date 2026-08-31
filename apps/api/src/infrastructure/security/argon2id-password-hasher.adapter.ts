import { Algorithm, hash, verify } from '@node-rs/argon2';

import type { PasswordHasherPort } from '@dentpilot/application';

export interface Argon2idParameters {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

export class Argon2idPasswordHasher implements PasswordHasherPort {
  public constructor(private readonly parameters: Argon2idParameters) {}

  public async hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: this.parameters.memoryCost,
      timeCost: this.parameters.timeCost,
      parallelism: this.parameters.parallelism,
      outputLen: 32,
    });
  }

  public async verify(password: string, encodedHash: string): Promise<boolean> {
    return verify(encodedHash, password);
  }

  public needsRehash(encodedHash: string): boolean {
    const parameters = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/u.exec(encodedHash);
    if (parameters === null) return true;
    return (
      Number(parameters[1]) !== this.parameters.memoryCost ||
      Number(parameters[2]) !== this.parameters.timeCost ||
      Number(parameters[3]) !== this.parameters.parallelism
    );
  }
}

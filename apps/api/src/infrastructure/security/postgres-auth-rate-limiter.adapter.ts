import { createHmac } from 'node:crypto';

import type { AuthRateLimiterPort, RateLimitKeyDeriverPort } from '@dentpilot/application';

import type { PrismaService } from '../persistence/prisma.service.js';

export class HmacSha256RateLimitKeyDeriver implements RateLimitKeyDeriverPort {
  public constructor(private readonly secret: string) {}

  public derive(logicalPreimage: string): string {
    return createHmac('sha256', this.secret).update(logicalPreimage, 'utf8').digest('hex');
  }
}

type BucketRow = { count: number; windowEnd: Date };

export class PostgresAuthRateLimiter implements AuthRateLimiterPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async consume(input: {
    readonly scope: string;
    readonly keyHash: string;
    readonly now: Date;
    readonly windowSeconds: number;
    readonly limit: number;
  }): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number; readonly count: number }> {
    const windowMs = input.windowSeconds * 1000;
    const windowStart = new Date(Math.floor(input.now.getTime() / windowMs) * windowMs);
    const windowEnd = new Date(windowStart.getTime() + windowMs);

    try {
      await this.prisma.authRateLimitBucket.deleteMany({ where: { windowEnd: { lt: input.now } } });
      const rows = await this.prisma.$queryRaw<BucketRow[]>`
        INSERT INTO "auth_rate_limit_buckets" ("scope", "keyHash", "windowStart", "windowEnd", "count")
        VALUES (${input.scope}, ${input.keyHash}, ${windowStart}, ${windowEnd}, 1)
        ON CONFLICT ("scope", "keyHash", "windowStart")
        DO UPDATE SET "count" = "auth_rate_limit_buckets"."count" + 1
        RETURNING "count", "windowEnd"
      `;
      const bucket = rows[0];
      if (!bucket) throw new Error('Auth rate-limit upsert returned no bucket.');
      return {
        allowed: bucket.count <= input.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowEnd.getTime() - input.now.getTime()) / 1000)),
        count: bucket.count,
      };
    } catch (error) {
      throw new Error('Authentication rate limiting unavailable.', { cause: error });
    }
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaUploadRecoveryBootstrap } from '../src/infrastructure/media/media-upload-recovery.bootstrap.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe('MediaUploadRecoveryBootstrap', () => {
  it('runs bounded cycles, prevents overlap, retries after failure, and stops scheduling on shutdown', async () => {
    vi.useFakeTimers();
    const first = deferred<void>();
    const reconcile = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new Error('temporary storage outage'))
      .mockResolvedValue(undefined);
    const bootstrap = new MediaUploadRecoveryBootstrap(
      { MEDIA_RECONCILIATION_INTERVAL_SECONDS: 5, MEDIA_RECONCILIATION_BATCH_SIZE: 7 } as never,
      { reconcile } as never,
    );

    bootstrap.onApplicationBootstrap();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenLastCalledWith(expect.any(Date), 7);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(reconcile).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reconcile).toHaveBeenCalledTimes(3);

    await bootstrap.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconcile).toHaveBeenCalledTimes(3);
  });
});

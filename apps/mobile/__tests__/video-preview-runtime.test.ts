import { createVideoPreviewRuntime, type MonotonicClock, type VideoFrameScheduler } from '../src/creation/video-preview-runtime';
import { VideoPreviewMonotonicClockError, VideoPreviewRuntimeInputError } from '../src/creation/video-preview-errors';

class FakeClock implements MonotonicClock {
  public value = 0;
  public nowMs(): number { return this.value; }
}

class FakeScheduler implements VideoFrameScheduler {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();
  public readonly cancelled: number[] = [];

  public requestFrame(callback: () => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  public cancelFrame(requestId: number): void {
    this.cancelled.push(requestId);
    this.callbacks.delete(requestId);
  }

  public runNext(): void {
    const next = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (next === undefined) throw new Error('No animation frame is scheduled.');
    this.callbacks.delete(next[0]);
    next[1]();
  }

  public firstCallback(): () => void {
    const callback = this.callbacks.values().next().value as (() => void) | undefined;
    if (callback === undefined) throw new Error('No animation frame is scheduled.');
    return callback;
  }

  public get pendingCount(): number { return this.callbacks.size; }
}

describe('video preview runtime (G1)', () => {
  function createRuntime(durationMs = 4_500) {
    const clock = new FakeClock();
    const scheduler = new FakeScheduler();
    return { clock, scheduler, runtime: createVideoPreviewRuntime({ durationMs, clock, scheduler }) };
  }

  it('advances from an injected monotonic clock and schedules at most one frame', () => {
    const { clock, scheduler, runtime } = createRuntime();
    runtime.play();
    expect(runtime.getState()).toEqual({ phase: 'playing', playheadMs: 0, durationMs: 4_500 });
    expect(scheduler.pendingCount).toBe(1);

    clock.value = 17;
    scheduler.runNext();
    expect(runtime.getState().playheadMs).toBe(17);
    expect(scheduler.pendingCount).toBe(1);

    clock.value = 46;
    scheduler.runNext();
    expect(runtime.getState().playheadMs).toBe(46);
  });

  it('pauses deterministically, cancels its frame, and resumes without elapsed background time', () => {
    const { clock, scheduler, runtime } = createRuntime();
    runtime.play();
    clock.value = 100;
    runtime.pause();
    expect(runtime.getState()).toMatchObject({ phase: 'paused', playheadMs: 100 });
    expect(scheduler.pendingCount).toBe(0);

    clock.value = 10_000;
    runtime.play();
    clock.value = 10_040;
    scheduler.runNext();
    expect(runtime.getState()).toMatchObject({ phase: 'playing', playheadMs: 140 });
  });

  it('supports seek and scrub without creating temporal math outside the playhead', () => {
    const { clock, scheduler, runtime } = createRuntime();
    runtime.seek(1_234.4);
    expect(runtime.getState()).toMatchObject({ phase: 'paused', playheadMs: 1_234 });
    runtime.beginScrub();
    runtime.seek(5_000);
    expect(runtime.getState()).toMatchObject({ phase: 'completed', playheadMs: 4_500 });
    runtime.endScrub({ resume: true });
    expect(runtime.getState().phase).toBe('completed');

    runtime.beginScrub();
    runtime.seek(200);
    runtime.endScrub({ resume: true });
    expect(runtime.getState()).toMatchObject({ phase: 'playing', playheadMs: 200 });
    clock.value = 11;
    scheduler.runNext();
    expect(runtime.getState().playheadMs).toBe(211);
  });

  it('completes exactly at duration and replay starts a fresh cancellable session', () => {
    const { clock, scheduler, runtime } = createRuntime(100);
    runtime.play();
    clock.value = 100;
    scheduler.runNext();
    expect(runtime.getState()).toEqual({ phase: 'completed', playheadMs: 100, durationMs: 100 });
    expect(scheduler.pendingCount).toBe(0);

    runtime.replay();
    expect(runtime.getState()).toEqual({ phase: 'playing', playheadMs: 0, durationMs: 100 });
    expect(scheduler.pendingCount).toBe(1);
  });

  it('ignores a stale callback that fires after cancellation and disposes all resources', () => {
    const { scheduler, runtime } = createRuntime();
    runtime.play();
    const stale = scheduler.firstCallback();
    runtime.pause();
    stale();
    expect(runtime.getState()).toMatchObject({ phase: 'paused', playheadMs: 0 });
    runtime.dispose();
    runtime.play();
    expect(scheduler.pendingCount).toBe(0);
  });

  it('rejects invalid duration and backwards clocks', () => {
    const clock = new FakeClock();
    const scheduler = new FakeScheduler();
    expect(() => createVideoPreviewRuntime({ durationMs: 0, clock, scheduler })).toThrow(VideoPreviewRuntimeInputError);
    const runtime = createVideoPreviewRuntime({ durationMs: 100, clock, scheduler });
    runtime.play();
    clock.value = -1;
    expect(() => scheduler.runNext()).toThrow(VideoPreviewMonotonicClockError);
  });
});

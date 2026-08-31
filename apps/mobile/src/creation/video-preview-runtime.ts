import { VideoPreviewMonotonicClockError, VideoPreviewRuntimeInputError } from './video-preview-errors';

export type VideoPreviewPhase = 'paused' | 'playing' | 'scrubbing' | 'completed';

export type VideoPreviewState = {
  readonly phase: VideoPreviewPhase;
  readonly playheadMs: number;
  readonly durationMs: number;
};

export interface MonotonicClock {
  nowMs(): number;
}

export interface VideoFrameScheduler {
  requestFrame(callback: () => void): number;
  cancelFrame(requestId: number): void;
}

export type VideoPreviewRuntime = {
  getState(): VideoPreviewState;
  subscribe(listener: (state: VideoPreviewState) => void): () => void;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  beginScrub(): void;
  endScrub(input?: { readonly resume: boolean }): void;
  replay(): void;
  dispose(): void;
};

type RuntimeDependencies = {
  readonly durationMs: number;
  readonly clock: MonotonicClock;
  readonly scheduler: VideoFrameScheduler;
  readonly initialPlayheadMs?: number;
};

function assertDuration(durationMs: number): void {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new VideoPreviewRuntimeInputError('Video preview duration must be a positive safe integer number of milliseconds.');
  }
}

function clampPlayhead(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs)) throw new VideoPreviewRuntimeInputError('Video preview playhead must be finite.');
  return Math.min(durationMs, Math.max(0, Math.round(timeMs)));
}

/**
 * Pure playback coordinator. It deliberately knows nothing about templates, motion, or
 * rendering: consumers evaluate the canonical Stage 1 evaluator at `playheadMs`.
 */
export function createVideoPreviewRuntime(dependencies: RuntimeDependencies): VideoPreviewRuntime {
  assertDuration(dependencies.durationMs);
  const durationMs = dependencies.durationMs;
  const initialPlayheadMs = clampPlayhead(dependencies.initialPlayheadMs ?? 0, durationMs);
  let state: VideoPreviewState = {
    phase: initialPlayheadMs === durationMs ? 'completed' : 'paused',
    playheadMs: initialPlayheadMs,
    durationMs,
  };
  let lastClockMs: number | null = null;
  let scheduledRequestId: number | null = null;
  let scheduleGeneration = 0;
  let disposed = false;
  const listeners = new Set<(next: VideoPreviewState) => void>();

  const notify = (): void => {
    for (const listener of listeners) listener(state);
  };

  const readClock = (): number => {
    const nowMs = dependencies.clock.nowMs();
    if (!Number.isFinite(nowMs)) throw new VideoPreviewMonotonicClockError('The video preview clock returned a non-finite time.');
    if (lastClockMs !== null && nowMs < lastClockMs) throw new VideoPreviewMonotonicClockError('The video preview clock moved backwards.');
    return nowMs;
  };

  const cancelScheduledFrame = (): void => {
    scheduleGeneration += 1;
    if (scheduledRequestId !== null) dependencies.scheduler.cancelFrame(scheduledRequestId);
    scheduledRequestId = null;
  };

  const advanceToClock = (): void => {
    if (state.phase !== 'playing') return;
    const nowMs = readClock();
    const previousClockMs = lastClockMs ?? nowMs;
    lastClockMs = nowMs;
    const nextPlayheadMs = clampPlayhead(state.playheadMs + (nowMs - previousClockMs), durationMs);
    if (nextPlayheadMs === durationMs) {
      state = { ...state, playheadMs: durationMs, phase: 'completed' };
      cancelScheduledFrame();
      notify();
      return;
    }
    if (nextPlayheadMs !== state.playheadMs) {
      state = { ...state, playheadMs: nextPlayheadMs };
      notify();
    }
  };

  const requestNextFrame = (): void => {
    if (disposed || state.phase !== 'playing' || scheduledRequestId !== null) return;
    const currentGeneration = scheduleGeneration;
    scheduledRequestId = dependencies.scheduler.requestFrame(() => {
      if (currentGeneration !== scheduleGeneration || disposed || state.phase !== 'playing') return;
      scheduledRequestId = null;
      advanceToClock();
      requestNextFrame();
    });
  };

  const stop = (phase: Exclude<VideoPreviewPhase, 'playing'>): void => {
    if (state.phase === 'playing') advanceToClock();
    cancelScheduledFrame();
    lastClockMs = null;
    if (state.phase !== phase) {
      state = { ...state, phase };
      notify();
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play: () => {
      if (disposed || state.phase === 'playing') return;
      if (state.playheadMs === durationMs) state = { ...state, playheadMs: 0, phase: 'paused' };
      lastClockMs = readClock();
      state = { ...state, phase: 'playing' };
      notify();
      requestNextFrame();
    },
    pause: () => {
      if (disposed || state.phase !== 'playing') return;
      stop(state.playheadMs === durationMs ? 'completed' : 'paused');
    },
    seek: (timeMs) => {
      if (disposed) return;
      if (state.phase === 'playing') advanceToClock();
      const playheadMs = clampPlayhead(timeMs, durationMs);
      const phase: VideoPreviewPhase = playheadMs === durationMs ? 'completed' : state.phase === 'completed' ? 'paused' : state.phase;
      if (playheadMs !== state.playheadMs || phase !== state.phase) {
        state = { ...state, playheadMs, phase };
        notify();
      }
      if (state.phase === 'playing') lastClockMs = readClock();
    },
    beginScrub: () => {
      if (disposed || state.phase === 'scrubbing') return;
      if (state.phase === 'playing') advanceToClock();
      cancelScheduledFrame();
      lastClockMs = null;
      state = { ...state, phase: 'scrubbing' };
      notify();
    },
    endScrub: (input = { resume: false }) => {
      if (disposed || state.phase !== 'scrubbing') return;
      state = { ...state, phase: state.playheadMs === durationMs ? 'completed' : 'paused' };
      notify();
      if (input.resume && state.phase !== 'completed') {
        lastClockMs = readClock();
        state = { ...state, phase: 'playing' };
        notify();
        requestNextFrame();
      }
    },
    replay: () => {
      if (disposed) return;
      cancelScheduledFrame();
      state = { ...state, playheadMs: 0, phase: 'paused' };
      notify();
      lastClockMs = readClock();
      state = { ...state, phase: 'playing' };
      notify();
      requestNextFrame();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelScheduledFrame();
      listeners.clear();
      lastClockMs = null;
    },
  };
}

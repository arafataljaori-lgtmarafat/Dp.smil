export type PlaybackState = 'IDLE' | 'LOADING' | 'READY' | 'PLAYING' | 'PAUSED' | 'ENDED' | 'ERROR';

export type PlaybackMetrics = {
  readonly state: PlaybackState;
  readonly playheadMs: number;
  readonly durationMs: number;
  readonly error: Error | null;
};

export interface MonotonicClock {
  nowMs(): number;
}

export interface FrameHandle {
  readonly id: unknown;
}

export interface FrameScheduler {
  request(callback: (nowMs: number) => void): FrameHandle;
  cancel(handle: FrameHandle): void;
}

export class PlaybackClock {
  private _state: PlaybackState = 'IDLE';
  private _playheadMs: number = 0;
  private _durationMs: number = 0;
  private _clockAnchorMs: number | null = null;
  private _playheadAnchorMs: number = 0;
  private _error: Error | null = null;
  
  private _frameHandle: FrameHandle | null = null;
  private readonly _clock: MonotonicClock;
  private readonly _scheduler: FrameScheduler;
  private readonly _onTick: (metrics: PlaybackMetrics) => void;

  constructor(
    clock: MonotonicClock,
    scheduler: FrameScheduler,
    onTick: (metrics: PlaybackMetrics) => void
  ) {
    this._clock = clock;
    this._scheduler = scheduler;
    this._onTick = onTick;
    this.loop = this.loop.bind(this);
  }

  public get metrics(): PlaybackMetrics {
    return {
      state: this._state,
      playheadMs: this._playheadMs,
      durationMs: this._durationMs,
      error: this._error,
    };
  }

  private notify() {
    this._onTick(this.metrics);
  }

  private cancelLoop() {
    if (this._frameHandle) {
      this._scheduler.cancel(this._frameHandle);
      this._frameHandle = null;
    }
  }

  private loop(nowMs: number) {
    if (this._state !== 'PLAYING') {
      this.cancelLoop();
      return;
    }
    
    if (this._clockAnchorMs !== null) {
      const deltaMs = Math.max(0, nowMs - this._clockAnchorMs);
      const advanced = this._playheadAnchorMs + deltaMs;
      
      if (advanced >= this._durationMs) {
        this._playheadMs = this._durationMs;
        this._clockAnchorMs = null;
        this._state = 'ENDED';
        this.cancelLoop();
      } else {
        this._playheadMs = Math.round(advanced);
      }
    }
    
    this.notify();

    if (this._state === 'PLAYING') {
      this._frameHandle = this._scheduler.request(this.loop);
    }
  }

  public load(durationMs: number): void {
    if (this._state !== 'IDLE' && this._state !== 'ERROR') return;
    if (durationMs < 0 || !Number.isInteger(durationMs)) {
      this.fail(new Error('Duration must be a positive integer.'));
      return;
    }
    this.cancelLoop();
    this._durationMs = durationMs;
    this._playheadMs = 0;
    this._playheadAnchorMs = 0;
    this._clockAnchorMs = null;
    this._state = 'LOADING';
    this.notify();
  }

  public ready(): void {
    if (this._state !== 'LOADING') return;
    this._state = 'READY';
    this.notify();
  }

  public play(): void {
    if (this._state === 'PLAYING') return;
    if (this._state !== 'READY' && this._state !== 'PAUSED') return;
    const now = this._clock.nowMs();
    this._clockAnchorMs = now;
    this._playheadAnchorMs = this._playheadMs;
    this._state = 'PLAYING';
    
    this.cancelLoop();
    this._frameHandle = this._scheduler.request(this.loop);
    this.notify();
  }

  public pause(): void {
    if (this._state !== 'PLAYING') return;
    const now = this._clock.nowMs();
    
    // Commit semantic time
    if (this._clockAnchorMs !== null) {
        const delta = Math.max(0, now - this._clockAnchorMs);
        this._playheadMs = Math.round(Math.min(this._durationMs, this._playheadAnchorMs + delta));
    }
    this._playheadAnchorMs = this._playheadMs;
    this._clockAnchorMs = null;
    this._state = 'PAUSED';
    
    this.cancelLoop();
    this.notify();
  }

  public seek(targetMs: number): void {
    if (this._state === 'IDLE' || this._state === 'LOADING' || this._state === 'ERROR') return;
    const clamped = Math.max(0, Math.min(this._durationMs, Math.round(targetMs)));
    
    this._playheadMs = clamped;
    this._playheadAnchorMs = clamped;

    if (this._state === 'PLAYING') {
        this._clockAnchorMs = this._clock.nowMs();
    } else if (this._state === 'ENDED' && clamped < this._durationMs) {
        this._state = 'PAUSED';
    }
    
    this.notify();
  }

  public replay(): void {
    if (this._state !== 'ENDED' && this._state !== 'READY' && this._state !== 'PAUSED') return;
    this._playheadMs = 0;
    this._playheadAnchorMs = 0;
    this._clockAnchorMs = this._clock.nowMs();
    this._state = 'PLAYING';
    
    this.cancelLoop();
    this._frameHandle = this._scheduler.request(this.loop);
    this.notify();
  }

  public fail(error: Error): void {
    this.cancelLoop();
    this._error = error;
    this._state = 'ERROR';
    this.notify();
  }

  public teardown(): void {
    this.cancelLoop();
    this._state = 'IDLE';
    this._clockAnchorMs = null;
    this.notify();
  }
}

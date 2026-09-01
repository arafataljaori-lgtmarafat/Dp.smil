import { PlaybackClock, PlaybackMetrics, MonotonicClock, FrameScheduler, FrameHandle } from '../src/creation/video-playback-clock';

class MockClock implements MonotonicClock {
  public time: number = 0;
  nowMs(): number { return this.time; }
}

class MockScheduler implements FrameScheduler {
  public callback: ((nowMs: number) => void) | null = null;
  public active: boolean = false;
  
  request(cb: (nowMs: number) => void): FrameHandle {
    this.callback = cb;
    this.active = true;
    return { id: 1 };
  }
  
  cancel(handle: FrameHandle): void {
    this.active = false;
    this.callback = null;
  }
  
  fire(nowMs: number) {
    if (this.active && this.callback) {
      this.callback(nowMs);
    }
  }
}

describe('PlaybackClock (Stage 3 Forensic Update)', () => {
  let clock: MockClock;
  let scheduler: MockScheduler;
  let ticks: PlaybackMetrics[];
  let player: PlaybackClock;

  beforeEach(() => {
    clock = new MockClock();
    scheduler = new MockScheduler();
    ticks = [];
    player = new PlaybackClock(clock, scheduler, (m) => ticks.push(m));
  });

  it('rejects illegal seeks before mutation', () => {
    // IDLE state -> seek is ignored, no mutation
    player.seek(500);
    expect(player.metrics.playheadMs).toBe(0);

    player.load(1000);
    player.ready();
    
    player.seek(500);
    expect(player.metrics.playheadMs).toBe(500);
  });

  it('pause commits exact semantic time before stopping scheduler', () => {
    player.load(1000);
    player.ready();
    
    clock.time = 100;
    player.play(); // clockAnchor = 100
    
    // Time passes to 137, but no frame callback fires
    clock.time = 137;
    
    // Pause should capture the exact semantic time (37ms) even though loop didn't run
    player.pause();
    
    expect(player.metrics.playheadMs).toBe(37);
    expect(scheduler.active).toBe(false);
  });

  it('scheduler only exists while playing', () => {
    player.load(1000);
    player.ready();
    expect(scheduler.active).toBe(false);
    
    player.play();
    expect(scheduler.active).toBe(true);
    
    player.pause();
    expect(scheduler.active).toBe(false);
    
    player.play();
    expect(scheduler.active).toBe(true);
    
    player.teardown();
    expect(scheduler.active).toBe(false);
  });

  it('clamps out of range seeks', () => {
    player.load(1000);
    player.ready();
    
    player.seek(-500);
    expect(player.metrics.playheadMs).toBe(0);
    
    player.seek(1500);
    expect(player.metrics.playheadMs).toBe(1000);
  });

  it('handles playing seeks by correctly updating anchors', () => {
    player.load(1000);
    player.ready();
    
    clock.time = 100;
    player.play();
    
    clock.time = 200;
    scheduler.fire(200);
    expect(player.metrics.playheadMs).toBe(100);
    
    // Seek while playing
    clock.time = 250;
    player.seek(500); // Should re-anchor internally
    
    clock.time = 300;
    scheduler.fire(300);
    expect(player.metrics.playheadMs).toBe(550); // 500 + (300 - 250)
  });

  it('seeking backwards from ended resets state to paused', () => {
    player.load(1000);
    player.ready();
    
    clock.time = 100;
    player.play();
    
    clock.time = 1200;
    scheduler.fire(1200);
    expect(player.metrics.state).toBe('ENDED');
    expect(player.metrics.playheadMs).toBe(1000);
    expect(scheduler.active).toBe(false);
    
    player.seek(500);
    expect(player.metrics.state).toBe('PAUSED');
    expect(player.metrics.playheadMs).toBe(500);
  });

  it('fails gracefully', () => {
    player.load(-1);
    expect(player.metrics.state).toBe('ERROR');
    expect(player.metrics.error?.message).toMatch(/positive integer/);
  });
});

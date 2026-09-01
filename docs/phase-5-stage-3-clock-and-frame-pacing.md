# Clock and Frame Pacing

The scheduler explicitly enforces a single `requestAnimationFrame` loop per active playback session. The frame callback is suspended immediately upon PAUSED, ENDED, or backgrounding events. Pause actions precisely commit the exact semantic time before yielding the scheduler, avoiding double-count drift or visual jumping.

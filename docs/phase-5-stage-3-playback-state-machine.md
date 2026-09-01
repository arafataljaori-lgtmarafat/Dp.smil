# Playback State Machine

The pure TS `PlaybackClock` implements a rigorous state machine (IDLE -> LOADING -> READY -> PLAYING -> PAUSED -> ENDED) completely decoupled from wall-clock rendering. Illegal state transitions are rejected *before* partial mutation. Seek operations strictly validate bounds and correctly commit semantic anchors during active transitions.

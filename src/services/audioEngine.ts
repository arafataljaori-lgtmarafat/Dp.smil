import { AudioConfig, AudioTrackId } from "../types";

class DentalAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private currentSource: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private scheduledInterval: number | null = null;
  private customAudioBuffer: AudioBuffer | null = null;
  private customAudioUrlLoaded: string | null = null;

  public init() {
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public getAudioContext(): AudioContext | null {
    this.init();
    return this.ctx;
  }

  public async loadCustomAudio(url: string): Promise<AudioBuffer | null> {
    this.init();
    if (!this.ctx || !url) return null;
    if (this.customAudioUrlLoaded === url && this.customAudioBuffer) {
      return this.customAudioBuffer;
    }
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arrayBuffer);
      this.customAudioBuffer = decoded;
      this.customAudioUrlLoaded = url;
      return decoded;
    } catch (e) {
      console.warn("Could not decode custom audio", e);
      return null;
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.scheduledInterval) {
      window.clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
    }
    if (this.currentSource) {
      try {
        (this.currentSource as AudioBufferSourceNode).stop?.();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }
  }

  public start(config: AudioConfig, durationSeconds: number, startTimeOffset = 0) {
    this.init();
    this.stop();
    if (!this.ctx || config.trackId === "none" || config.volume <= 0) {
      return;
    }

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(config.volume * 0.7, this.ctx.currentTime);
    gain.connect(this.ctx.destination);
    this.gainNode = gain;
    this.isPlaying = true;

    if (config.trackId === "custom" && config.customAudioUrl && this.customAudioBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.customAudioBuffer;
      source.loop = true;
      source.connect(gain);
      const offset = startTimeOffset % this.customAudioBuffer.duration;
      source.start(0, offset);
      this.currentSource = source;
      return;
    }

    // Procedural Dental Audio Synths
    this.playSynthesizedTrack(config.trackId, gain, durationSeconds, startTimeOffset);
  }

  private playSynthesizedTrack(
    trackId: AudioTrackId,
    dest: GainNode,
    totalDuration: number,
    startOffset: number
  ) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bpm = trackId === "luxury-aesthetics" ? 112 : trackId === "modern-health" ? 124 : 96;
    const beatSec = 60 / bpm;

    // Chords progression for uplifting clinical aesthetic video
    // Clean, reassuring Major 7th and Add9 chords
    const chords = [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 392.0],  // Gadd9
    ];

    const chordLength = beatSec * 4; // 1 measure per chord
    const remainingTime = Math.max(0.5, totalDuration - startOffset);
    const steps = Math.ceil(remainingTime / beatSec);

    for (let i = 0; i < steps; i++) {
      const scheduledTime = now + i * beatSec;
      const progressSec = startOffset + i * beatSec;
      const chordIndex = Math.floor((progressSec / chordLength) % chords.length);
      const currentChord = chords[chordIndex];

      // Soft ambient chord pad on bar starts
      if (i % 4 === 0) {
        currentChord.forEach((freq, noteIdx) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq * (noteIdx === 0 ? 0.5 : 1), scheduledTime);

          noteGain.gain.setValueAtTime(0.001, scheduledTime);
          noteGain.gain.exponentialRampToValueAtTime(0.04, scheduledTime + 0.3);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, scheduledTime + chordLength * 0.95);

          osc.connect(noteGain);
          noteGain.connect(dest);
          osc.start(scheduledTime);
          osc.stop(scheduledTime + chordLength);
        });
      }

      // Melodic gentle pluck / marimba note
      const noteOffset = (i % 4) % currentChord.length;
      const melodyFreq = currentChord[noteOffset] * 2;
      const pluckOsc = this.ctx.createOscillator();
      const pluckGain = this.ctx.createGain();

      pluckOsc.type = trackId === "modern-health" ? "triangle" : "sine";
      pluckOsc.frequency.setValueAtTime(melodyFreq, scheduledTime);

      pluckGain.gain.setValueAtTime(0.001, scheduledTime);
      pluckGain.gain.linearRampToValueAtTime(0.035, scheduledTime + 0.04);
      pluckGain.gain.exponentialRampToValueAtTime(0.0001, scheduledTime + 0.35);

      pluckOsc.connect(pluckGain);
      pluckGain.connect(dest);
      pluckOsc.start(scheduledTime);
      pluckOsc.stop(scheduledTime + 0.4);

      // Subtle heartbeat or luxury soft kick on beats
      if (trackId === "luxury-aesthetics" || trackId === "modern-health" || trackId === "lounge-pulse") {
        if (i % 2 === 0) {
          const kickOsc = this.ctx.createOscillator();
          const kickGain = this.ctx.createGain();
          kickOsc.type = "sine";
          kickOsc.frequency.setValueAtTime(110, scheduledTime);
          kickOsc.frequency.exponentialRampToValueAtTime(35, scheduledTime + 0.12);

          kickGain.gain.setValueAtTime(0.05, scheduledTime);
          kickGain.gain.exponentialRampToValueAtTime(0.0001, scheduledTime + 0.14);

          kickOsc.connect(kickGain);
          kickGain.connect(dest);
          kickOsc.start(scheduledTime);
          kickOsc.stop(scheduledTime + 0.15);
        }
      }
    }
  }

  // Create an offline rendered AudioBuffer to feed directly into the video export stream
  public async renderAudioBufferForExport(
    config: AudioConfig,
    durationSeconds: number
  ): Promise<AudioBuffer | null> {
    if (config.trackId === "none" || config.volume <= 0) return null;

    if (config.trackId === "custom" && config.customAudioUrl) {
      const buffer = await this.loadCustomAudio(config.customAudioUrl);
      if (buffer) return buffer;
    }

    const sampleRate = 44100;
    const totalSamples = Math.floor(sampleRate * durationSeconds);
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(config.volume * 0.75, 0);
    gain.connect(offlineCtx.destination);

    const bpm = config.trackId === "luxury-aesthetics" ? 112 : config.trackId === "modern-health" ? 124 : 96;
    const beatSec = 60 / bpm;
    const chords = [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 392.0],  // Gadd9
    ];
    const chordLength = beatSec * 4;
    const steps = Math.ceil(durationSeconds / beatSec);

    for (let i = 0; i < steps; i++) {
      const scheduledTime = i * beatSec;
      if (scheduledTime >= durationSeconds) break;
      const chordIndex = Math.floor((scheduledTime / chordLength) % chords.length);
      const currentChord = chords[chordIndex];

      if (i % 4 === 0) {
        currentChord.forEach((freq, noteIdx) => {
          const osc = offlineCtx.createOscillator();
          const noteGain = offlineCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq * (noteIdx === 0 ? 0.5 : 1), scheduledTime);
          noteGain.gain.setValueAtTime(0.001, scheduledTime);
          noteGain.gain.exponentialRampToValueAtTime(0.04, scheduledTime + 0.3);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSeconds, scheduledTime + chordLength * 0.95));
          osc.connect(noteGain);
          noteGain.connect(gain);
          osc.start(scheduledTime);
          osc.stop(Math.min(durationSeconds, scheduledTime + chordLength));
        });
      }

      const noteOffset = (i % 4) % currentChord.length;
      const melodyFreq = currentChord[noteOffset] * 2;
      const pluckOsc = offlineCtx.createOscillator();
      const pluckGain = offlineCtx.createGain();
      pluckOsc.type = config.trackId === "modern-health" ? "triangle" : "sine";
      pluckOsc.frequency.setValueAtTime(melodyFreq, scheduledTime);
      pluckGain.gain.setValueAtTime(0.001, scheduledTime);
      pluckGain.gain.linearRampToValueAtTime(0.035, scheduledTime + 0.04);
      pluckGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSeconds, scheduledTime + 0.35));
      pluckOsc.connect(pluckGain);
      pluckGain.connect(gain);
      pluckOsc.start(scheduledTime);
      pluckOsc.stop(Math.min(durationSeconds, scheduledTime + 0.4));
    }

    try {
      return await offlineCtx.startRendering();
    } catch (e) {
      console.warn("Failed to render offline audio", e);
      return null;
    }
  }
}

export const audioEngine = new DentalAudioEngine();

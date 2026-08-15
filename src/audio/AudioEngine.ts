// ============================================================
// NEON ARCADE RACER — Procedural Audio Engine
// Web Audio API — no external audio files needed
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import type { ScoreSystem } from '../scoring/ScoreSystem';
import { PLAYER_MAX_SPEED } from '../constants';
import { clamp, lerp } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

// A-minor pentatonic scale (Hz)
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
// Chord progression (index into SCALE)
const CHORDS = [
  [0, 2, 4],  // Am
  [5, 0, 2],  // F (relative)
  [2, 4, 6],  // C
  [4, 6, 1],  // G (relative)
];

interface MusicLayer {
  osc:  OscillatorNode;
  gain: GainNode;
  targetVol: number;
}

export class AudioEngine {
  private ctx!:         AudioContext;
  private masterGain!:  GainNode;
  private initialized = false;
  private muted = false;

  // Engine sound
  private engineOsc!:  OscillatorNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;

  // Drift screech
  private driftOsc:  OscillatorNode | null = null;
  private driftGain: GainNode | null = null;
  private driftNoise: AudioBufferSourceNode | null = null;

  // Music layers
  private bassLayers:  MusicLayer[] = [];
  private padLayers:   MusicLayer[] = [];
  private arpLayers:   MusicLayer[] = [];

  // State
  private currentChordIdx = 0;
  private chordTimer      = 0;
  private CHORD_DURATION  = 4.0;  // seconds per chord
  private isDriftingPrev  = false;
  private musicTimer      = 0;
  private arpTimer        = 0;
  private arpNoteIdx      = 0;
  private ARPInteral      = 0.12;

  // Global music state
  private musicIntensity  = 0;  // 0 → 1

  constructor() {}

  /** Must be called after a user gesture (browser autoplay policy) */
  init(scene: Phaser.Scene): void {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.45;
      this.masterGain.connect(this.ctx.destination);

      this.initEngine();
      this.initMusic();
      this.initialized = true;
    } catch (e) {
      console.warn('AudioEngine: Web Audio not available', e);
    }
  }

  private initEngine(): void {
    // Engine: sawtooth oscillator through lowpass filter
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineFilter.Q.value = 2;

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 80;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.12;

    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();
  }

  private initMusic(): void {
    // Bass layer: root note sawtooth
    for (let i = 0; i < 2; i++) {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const detune = i * 5;
      osc.detune.value = detune;
      gain.gain.value = 0;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.bassLayers.push({ osc, gain, targetVol: 0 });
    }

    // Pad layer: detuned square waves for chord
    for (let i = 0; i < 3; i++) {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.detune.value = (i - 1) * 8;  // slight detune for richness
      gain.gain.value = 0;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      filter.Q.value = 1;

      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.08;

      osc.connect(filter);
      filter.connect(padGain);
      padGain.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.padLayers.push({ osc, gain, targetVol: 0 });
    }

    // Arp layer: triangle wave arpeggio
    for (let i = 0; i < 2; i++) {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.detune.value = i * 1200; // 1 octave up for second layer
      gain.gain.value = 0;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 400;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.arpLayers.push({ osc, gain, targetVol: 0 });
    }
  }

  private makeNoise(duration = 0.1): AudioBufferSourceNode {
    const bufSize = Math.ceil(this.ctx.sampleRate * duration);
    const buf     = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  update(dt: number, player: Player, score: ScoreSystem): void {
    if (!this.initialized || this.muted) return;

    const speed     = player.speed;
    const speedFrac = clamp(speed / PLAYER_MAX_SPEED, 0, 1);
    const mult      = score.totalMultiplier;
    this.musicTimer += dt;
    this.chordTimer += dt;

    // Engine pitch follows speed
    const targetFreq = 70 + speedFrac * 220;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
    // Engine filter opens at high speed
    const targetFilter = 200 + speedFrac * 800;
    this.engineFilter.frequency.setTargetAtTime(targetFilter, this.ctx.currentTime, 0.2);
    // Engine volume
    const targetEngVol = player.crashed ? 0 : 0.06 + speedFrac * 0.10;
    this.engineGain.gain.setTargetAtTime(targetEngVol, this.ctx.currentTime, 0.1);

    // Music intensity based on speed + multiplier
    const targetIntensity = clamp(speedFrac * 0.7 + mult * 0.04, 0, 1);
    this.musicIntensity = lerp(this.musicIntensity, targetIntensity, dt * 0.8);

    // Chord progression
    if (this.chordTimer >= this.CHORD_DURATION) {
      this.chordTimer = 0;
      this.currentChordIdx = (this.currentChordIdx + 1) % CHORDS.length;
      this.updateChord();
    }

    // Layer volumes based on intensity
    const bassVol = this.musicIntensity > 0.1 ? 0.18 * this.musicIntensity : 0;
    const padVol  = this.musicIntensity > 0.2 ? 0.06 * this.musicIntensity : 0;
    const arpVol  = this.musicIntensity > 0.4 ? 0.08 * this.musicIntensity : 0;

    for (const l of this.bassLayers) {
      l.gain.gain.setTargetAtTime(bassVol, this.ctx.currentTime, 0.5);
    }
    for (const l of this.padLayers) {
      l.gain.gain.setTargetAtTime(padVol, this.ctx.currentTime, 0.5);
    }

    // Arpeggiator
    if (this.musicIntensity > 0.4) {
      this.arpTimer += dt;
      const arpSpeed = lerp(this.ARPInteral, this.ARPInteral * 0.5, this.musicIntensity);
      if (this.arpTimer >= arpSpeed) {
        this.arpTimer = 0;
        this.tickArp(arpVol);
      }
    } else {
      for (const l of this.arpLayers) {
        l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      }
    }

    // Drift screech
    const isDrifting = player.isDrifting;
    if (isDrifting && !this.isDriftingPrev) this.startDrift();
    if (!isDrifting && this.isDriftingPrev)  this.stopDrift();
    this.isDriftingPrev = isDrifting;

    // Update drift volume based on speed
    if (this.driftGain) {
      const vol = speedFrac * 0.18;
      this.driftGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    }
  }

  private updateChord(): void {
    const chord = CHORDS[this.currentChordIdx];
    // Update bass (root note)
    const rootFreq = SCALE[chord[0]] / 2;  // Octave down
    for (const l of this.bassLayers) {
      l.osc.frequency.setTargetAtTime(rootFreq, this.ctx.currentTime, 0.3);
    }
    // Update pad notes
    for (let i = 0; i < this.padLayers.length; i++) {
      const noteIdx = chord[i % chord.length];
      const freq = SCALE[noteIdx];
      this.padLayers[i].osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.3);
    }
  }

  private tickArp(volume: number): void {
    const chord  = CHORDS[this.currentChordIdx];
    const noteIdx= chord[this.arpNoteIdx % chord.length];
    this.arpNoteIdx = (this.arpNoteIdx + 1) % chord.length;

    const freq = SCALE[noteIdx] * 2;  // Arp plays an octave up
    for (const l of this.arpLayers) {
      l.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
      // Envelope: quick attack, decay
      l.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      l.gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      l.gain.gain.setTargetAtTime(0, this.ctx.currentTime + 0.06, 0.04);
    }
  }

  private startDrift(): void {
    if (!this.initialized) return;
    // Noise + oscillator for screech
    const noiseNode = this.makeNoise(10);
    const filter    = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 8;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.15;

    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noiseNode.start();

    this.driftNoise = noiseNode;
    this.driftGain  = gain;
  }

  private stopDrift(): void {
    if (this.driftGain) {
      this.driftGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
    if (this.driftNoise) {
      const n = this.driftNoise;
      setTimeout(() => { try { n.stop(); } catch {} }, 500);
      this.driftNoise = null;
      this.driftGain  = null;
    }
  }

  // ---- One-shot SFX ----

  playNearMiss(): void {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    // Ascending three-note sweep
    for (let i = 0; i < 3; i++) {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 400 + i * 200;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now + i * 0.05);
      gain.gain.setTargetAtTime(0.15, now + i * 0.05, 0.02);
      gain.gain.setTargetAtTime(0, now + i * 0.05 + 0.08, 0.04);
      osc.connect(gain).connect(this.masterGain);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.2);
    }
  }

  playCrash(): void {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    // Low frequency thud + noise burst
    const noise = this.makeNoise(0.8);
    const filter= this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    const gain  = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.8);

    // Low "thud"
    const osc = this.ctx.createOscillator();
    const g2  = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    g2.gain.setValueAtTime(0.4, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(g2).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  playPowerUpCollect(): void {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g   = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.04);
      g.gain.setTargetAtTime(0.12, now + i * 0.04, 0.01);
      g.gain.setTargetAtTime(0, now + i * 0.04 + 0.1, 0.04);
      osc.connect(g).connect(this.masterGain);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.25);
    });
  }

  playBoost(): void {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    // Whoosh: filtered noise sweep
    const noise = this.makeNoise(0.5);
    const filter= this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + 0.4);
    filter.Q.value = 3;
    const gain  = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.6);
  }

  playShockwave(): void {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const noise = this.makeNoise(0.5);
    const filter= this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.6);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : 0.45,
        this.ctx.currentTime, 0.1
      );
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  destroy(): void {
    try {
      this.engineOsc?.stop();
      for (const l of [...this.bassLayers, ...this.padLayers, ...this.arpLayers]) {
        l.osc.stop();
      }
      this.ctx?.close();
    } catch {}
  }
}

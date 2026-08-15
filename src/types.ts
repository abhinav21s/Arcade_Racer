// ============================================================
// NEON ARCADE RACER — Shared Types & Interfaces
// ============================================================

import type { PowerUpType } from './powerups/PowerUpTypes';

// ---- Road ----
export interface SegmentColors {
  grass: number;
  road:  number;
  rumble: number;
  lane:  number;
}

export interface RoadSprite {
  type: 'building' | 'lamp' | 'barrier';
  side: 'left' | 'right';
  offset: number;   // lateral offset from road edge (0=edge, 1=far)
  textureKey: string;
  scale: number;
}

export interface RoadSegment {
  index:   number;
  curve:   number;   // Per-segment lateral curve delta (world units)
  hill:    number;   // Per-segment vertical hill delta (world units)
  colors:  SegmentColors;
  sprites: RoadSprite[];
}

export interface ProjectedPoint {
  x:     number;   // Screen X of road center
  y:     number;   // Screen Y
  w:     number;   // Screen half-width of road
  scale: number;   // Perspective scale factor
}

// ---- Player ----
export type DriftState = 'none' | 'entering' | 'drifting' | 'exiting';
export type PowerUpState = {
  type: PowerUpType;
  timeLeft: number;
  maxTime: number;
} | null;

export interface PlayerState {
  speed:          number;     // Current speed (world units/sec)
  lateralPos:     number;     // Position on road, -1=left edge, 0=center, 1=right edge
  lateralVel:     number;     // Lateral velocity for drift physics
  cameraZ:        number;     // World Z position (camera/player depth)
  driftState:     DriftState;
  driftAngle:     number;     // Visual lean angle (radians)
  driftAccum:     number;     // Accumulated drift seconds (for scoring)
  crashed:        boolean;
  crashTimer:     number;
  invincible:     boolean;
  invincibleTimer:number;
  activePowerUp:  PowerUpState;
  skinIndex:      number;
}

// ---- Traffic ----
export type TrafficCarType = 'slow' | 'mid' | 'fast';

export interface TrafficCarData {
  id:          number;
  type:        TrafficCarType;
  worldZ:      number;    // World Z position
  lane:        number;    // Lane index 0-3
  lateralPos:  number;    // Lateral position (-1 to 1)
  speed:       number;    // World units/sec
  active:      boolean;
  nearMissScored: boolean;
  width:       number;    // Car width fraction of road
}

// ---- Power-up ----
export interface PowerUpData {
  id:         number;
  type:       PowerUpType;
  worldZ:     number;
  lanePos:    number;     // Lateral position on road (-0.75 to 0.75)
  collected:  boolean;
  active:     boolean;
}

// ---- Score ----
export interface ScoreData {
  score:      number;
  combo:      number;
  multiplier: number;
  distance:   number;
  bestCombo:  number;
}

// ---- High Score ----
export interface HighScoreEntry {
  score:    number;
  distance: number;
  date:     string;
  skin:     number;
}

// ---- Game Event Bus (typed) ----
export type GameEventKey =
  | 'playerCrash'
  | 'playerNearMiss'
  | 'playerDriftStart'
  | 'playerDriftEnd'
  | 'powerUpCollect'
  | 'powerUpExpire'
  | 'shockwave'
  | 'comboUpdate'
  | 'boostStart'
  | 'boostEnd';

export interface GameEvents {
  playerCrash:     { pos: number };
  playerNearMiss:  { combo: number };
  playerDriftStart:{};
  playerDriftEnd:  { duration: number };
  powerUpCollect:  { type: PowerUpType };
  powerUpExpire:   { type: PowerUpType };
  shockwave:       {};
  comboUpdate:     { combo: number; multiplier: number };
  boostStart:      { type: 'nitro' | 'overdrive' };
  boostEnd:        {};
}

// ---- Skin ----
export interface SkinDefinition {
  id:          number;
  name:        string;
  carColor:    number;
  trailColor:  number;
  unlockScore: number;
}

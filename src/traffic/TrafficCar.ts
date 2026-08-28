// ============================================================
// NEON ARCADE RACER — Traffic Car (Single AI Car)
// ============================================================

import type { TrafficCarType } from '../types';

export interface TrafficCar {
  id:             number;
  type:           TrafficCarType;
  worldZ:         number;    // World Z position
  lane:           number;    // Target lane index 0–3
  lateralPos:     number;    // Current lateral position [-1, 1]
  targetLateralPos: number;  // Target lateral position when changing lanes
  laneChangeTimer: number;   // Timer until next lane change decision
  blinkerTimer:   number;    // Flashing turn signal timer
  isChangingLane: boolean;
  speed:          number;    // World units per second
  active:         boolean;
  nearMissScored: boolean;   // Has near-miss been scored for current player approach
  carWidth:       number;    // Fraction of road width (collision detection)
  color:          number;    // Primary neon color
  accentColor:    number;    // Secondary/light color
  isKnockedOut:   boolean;   // Flung off road from impact/overdrive
  knockoutVx:     number;    // Knockout lateral velocity
  knockoutVz:     number;    // Knockout forward velocity
}

export const TRAFFIC_CAR_CONFIGS: Record<TrafficCarType, {
  name:        string;
  speedMin:    number;
  speedMax:    number;
  carWidth:    number;
  w:           number;   // Base display width in px (1:1 with PlayerCar at bumper distance)
  h:           number;   // Base display height in px
  color:       number;
  accentColor: number;
}> = {
  // TRUCK — Massive semi-truck / big rig (1.45x wider, 1.8x taller than player car)
  slow: {
    name:        'TRUCK',
    speedMin:    1100,
    speedMax:    1700,
    carWidth:    0.28,  // widest — occupies large lane presence
    w:           122,   // towering wide footprint
    h:           84,    // tall box container
    color:       0x00ccff,
    accentColor: 0x00ffff,
  },
  // SUV — Bulky crossover / urban utility (1.17x wider, 1.26x taller than player car)
  mid: {
    name:        'SUV',
    speedMin:    1900,
    speedMax:    2600,
    carWidth:    0.20,
    w:           98,
    h:           58,
    color:       0xff6600,
    accentColor: 0xffaa00,
  },
  // SPORTS CAR / RIVAL RACER — Exact 1:1 scale with player's supercar
  fast: {
    name:        'SPORTS CAR',
    speedMin:    2700,
    speedMax:    3400,
    carWidth:    0.16,
    w:           84,    // Identical width to player car (84px)
    h:           46,    // Identical height to player car (46px)
    color:       0xff0066,
    accentColor: 0xffff00,
  },
};

/** Lane-to-lateral-position mapping (4 lanes) */
export function laneTolateralPos(lane: number): number {
  // Road split into 4 lanes: centers at -0.75, -0.25, 0.25, 0.75
  return -0.75 + lane * 0.5;
}

/** Get collision half-width for a traffic car type */
export function getCarHalfWidth(type: TrafficCarType): number {
  return TRAFFIC_CAR_CONFIGS[type].carWidth / 2;
}

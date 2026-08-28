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
  w:           number;   // Display width
  h:           number;   // Display height
  color:       number;
  accentColor: number;
}> = {
  slow: {
    name:        'CYBER BUS',
    speedMin:    1200,
    speedMax:    1800,
    carWidth:    0.22,
    w:           58,
    h:           42,
    color:       0x00ccff,
    accentColor: 0x00ffff,
  },
  mid: {
    name:        'CYBER SUV',
    speedMin:    2000,
    speedMax:    2600,
    carWidth:    0.18,
    w:           48,
    h:           32,
    color:       0xff6600,
    accentColor: 0xffaa00,
  },
  fast: {
    name:        'CYBER SUPERCAR',
    speedMin:    2700,
    speedMax:    3300,
    carWidth:    0.15,
    w:           44,
    h:           24,
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

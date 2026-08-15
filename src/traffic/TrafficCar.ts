// ============================================================
// NEON ARCADE RACER — Traffic Car (Single AI Car)
// ============================================================

import type { TrafficCarType } from '../types';

export interface TrafficCar {
  id:           number;
  type:         TrafficCarType;
  worldZ:       number;    // World Z position (advances at car's speed)
  lane:         number;    // Lane index 0–3
  lateralPos:   number;    // Lateral position [-1, 1] (center of lane)
  speed:        number;    // World units per second
  active:       boolean;
  nearMissScored: boolean; // Has near-miss been scored for current player approach
  carWidth:     number;    // Fraction of road width (collision detection)
  color:        number;    // Neon color
  accentColor:  number;    // Secondary/headlight color
}

export const TRAFFIC_CAR_CONFIGS: Record<TrafficCarType, {
  speedMin: number;
  speedMax: number;
  carWidth: number;
  w: number;   // Display width
  h: number;   // Display height
  color: number;
  accentColor: number;
}> = {
  slow: {
    speedMin: 40,
    speedMax: 80,
    carWidth: 0.18,
    w: 48,
    h: 28,
    color:       0x00ccff,
    accentColor: 0x0044ff,
  },
  mid: {
    speedMin: 90,
    speedMax: 150,
    carWidth: 0.16,
    w: 44,
    h: 24,
    color:       0xff6600,
    accentColor: 0xffaa00,
  },
  fast: {
    speedMin: 160,
    speedMax: 220,
    carWidth: 0.14,
    w: 40,
    h: 20,
    color:       0xffff00,
    accentColor: 0xff9900,
  },
};

/** Lane-to-lateral-position mapping (4 lanes) */
export function laneTolateralPos(lane: number): number {
  // Lanes 0–3, road is [-1, 1]
  // Road split into 4 lanes: centers at -0.75, -0.25, 0.25, 0.75
  return -0.75 + lane * 0.5;
}

/** Get collision half-width for a traffic car type */
export function getCarHalfWidth(type: TrafficCarType): number {
  return TRAFFIC_CAR_CONFIGS[type].carWidth / 2;
}

// ============================================================
// NEON ARCADE RACER — Procedural Road Generator
// ============================================================

import type { RoadSegment, RoadSprite, SegmentColors } from './RoadTypes';
import { COLORS } from '../constants';

// Color palette pairs (index → [A, B])
const COLOR_PAIRS: SegmentColors[] = [
  { grass: COLORS.GRASS_A, road: COLORS.ROAD_A, rumble: COLORS.RUMBLE_A, lane: COLORS.LANE_MARK },
  { grass: COLORS.GRASS_B, road: COLORS.ROAD_B, rumble: COLORS.RUMBLE_B, lane: COLORS.LANE_MARK },
];

// Procedural generation parameters
interface GenParams {
  curveLength:  number;  // Segments for this curve section
  curveStrength:number;  // Curve delta per segment (positive=right, negative=left)
  hillLength:   number;  // Segments for this hill
  hillStrength: number;  // Hill delta per segment
}

export class RoadGenerator {
  private segments: RoadSegment[] = [];

  // Track generation "cursor"
  private genIndex = 0;
  private curCurve = 0;
  private curHill  = 0;

  // Procedural state machine
  private sectionCountdown = 0;
  private targetCurve = 0;
  private targetHill  = 0;
  private sectionLen  = 80;

  constructor() {
    // Start with a guaranteed straight section for the starting grid
    this.targetCurve = 0;
    this.targetHill = 0;
    this.curCurve = 0;
    this.curHill = 0;
    this.sectionCountdown = 80; // First 80 segments are completely straight
    // Pre-generate a massive buffer of 5000 segments (1,000,000 world units) on startup
    this.populate(5000);
  }

  /** Generate enough segments to fill up to index `upTo` */
  private populate(upTo: number): void {
    while (this.genIndex <= upTo) {
      this.generateOne();
    }
  }

  /** Ensure segments are available from index start to start+count */
  ensureAvailable(start: number, count: number): void {
    if (start + count + 100 >= this.segments.length) {
      this.populate(this.segments.length + 2000);
    }
  }

  private generateOne(): void {
    const i = this.genIndex;

    // Advance procedural section machine
    if (this.sectionCountdown <= 0) {
      this.sectionLen = 60 + Math.floor(Math.random() * 120);
      this.sectionCountdown = this.sectionLen;

      // Decide next curve
      const r = Math.random();
      if (r < 0.35) {
        this.targetCurve = 0;  // straight
      } else if (r < 0.65) {
        this.targetCurve = (0.3 + Math.random() * 0.9) * (Math.random() < 0.5 ? 1 : -1);
      } else {
        this.targetCurve = (1.2 + Math.random() * 1.5) * (Math.random() < 0.5 ? 1 : -1);
      }

      // Decide next hill
      const rh = Math.random();
      if (rh < 0.4) {
        this.targetHill = 0;
      } else {
        this.targetHill = (0.5 + Math.random() * 1.5) * (Math.random() < 0.5 ? 1 : -1);
      }

      // Brief straight sections between turns
      if (Math.abs(this.curCurve) > 0.5) {
        this.targetCurve = this.targetCurve * 0.3; // ease out of sharp curve
      }
    }
    this.sectionCountdown--;

    // Smoothly blend toward targets
    this.curCurve += (this.targetCurve - this.curCurve) * 0.015;
    this.curHill  += (this.targetHill  - this.curHill ) * 0.012;

    // Color alternation (every 3 segments)
    const colorIdx = Math.floor(i / 3) % 2;
    const colors = { ...COLOR_PAIRS[colorIdx] };

    // Roadside sprites & Cyberpunk scenery
    const sprites: RoadSprite[] = [];

    // 1. Neon Highway Streetlamps (rhythmic passing)
    if (i % 8 === 0) {
      sprites.push({
        type: 'lamp',
        side: 'left',
        offset: 0.04,
        scale: 1.0,
      });
      sprites.push({
        type: 'lamp',
        side: 'right',
        offset: 0.04,
        scale: 1.0,
      });
    }

    // 2. Reflective Curve Beacons along turns
    if (Math.abs(this.curCurve) > 0.4 && i % 3 === 0) {
      sprites.push({
        type: 'beacon',
        side: this.curCurve > 0 ? 'right' : 'left',
        offset: 0.01,
        scale: 0.8,
      });
    }

    // 3. Cyber Highway Overhead Laser Gantries / Archways (spectacular fly-under)
    if (i > 30 && i % 42 === 0) {
      sprites.push({
        type: 'arch',
        side: 'center',
        offset: 0,
        scale: 1.25,
      });
    }

    // 4. Holographic Neon Roadside Billboards
    if (i > 15 && i % 24 === 0) {
      sprites.push({
        type: 'billboard',
        side: i % 48 === 0 ? 'left' : 'right',
        offset: 0.22 + Math.random() * 0.15,
        scale: 1.1 + Math.random() * 0.4,
      });
    }

    // 5. Cyberpunk Mega-Structures & High-Rises
    if (i % 6 === 0) {
      const btype: RoadSprite['type'] = Math.random() < 0.5 ? 'building_a' : 'building_b';
      sprites.push({
        type: btype,
        side: Math.random() < 0.5 ? 'left' : 'right',
        offset: 0.28 + Math.random() * 0.55,
        scale: 0.85 + Math.random() * 0.75,
      });
    }

    this.segments.push({
      index: i,
      curve: this.curCurve,
      hill:  this.curHill,
      colors,
      sprites,
    });

    this.genIndex++;
  }

  /** Get segment by absolute index, generating if needed */
  getSegment(index: number): RoadSegment {
    const i = Math.max(0, index);
    if (i >= this.segments.length) {
      this.populate(i + 10);
    }
    return this.segments[Math.min(i, this.segments.length - 1)];
  }

  /** Get segment by world Z position */
  getSegmentAtZ(worldZ: number, segmentLength: number): RoadSegment {
    return this.getSegment(Math.floor(worldZ / segmentLength));
  }

  /** Total generated segment count */
  get length(): number {
    return this.segments.length;
  }
}

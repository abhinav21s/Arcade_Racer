// ============================================================
// NEON ARCADE RACER — Pseudo-3D Road Renderer (OutRun-style)
// ============================================================
//
// Projection math:
//   depth    = distance from camera in world units (must be > 0)
//   scale    = CAMERA_DEPTH / depth
//   screenX  = W/2 + scale * (roadWorldX) * W/2
//   screenY  = H/2 + scale * CAMERA_HEIGHT * H/2
//   roadHalfW= scale * ROAD_WIDTH * W/2
//
// Renders from far→near (painter's algorithm). Each segment pair
// forms a trapezoid between "far" and "near" screen rows.
// ============================================================

import Phaser from 'phaser';
import type { RoadGenerator } from './RoadGenerator';
import type { RoadSegment, ProjectedPoint, RoadSprite } from './RoadTypes';
import {
  CAMERA_HEIGHT, CAMERA_DEPTH, ROAD_WIDTH,
  SEGMENT_LENGTH, DRAW_LENGTH, NUM_LANES,
  GAME_WIDTH, GAME_HEIGHT, COLORS, TEX
} from '../constants';
import { lerp } from '../utils/Math';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const HORIZON_Y = H * 0.42;   // Horizon sits here (sky/road split)

export class RoadRenderer {
  private scene:        Phaser.Scene;
  private gfx:          Phaser.GameObjects.Graphics; // main road draw
  private roadDetailGfx:Phaser.GameObjects.Graphics; // crisp lanes and guardrails above tar
  private skyGfx:       Phaser.GameObjects.Graphics; // sky background
  private spriteLayer:  Phaser.GameObjects.Container;
  private cityLayer:    Phaser.GameObjects.Graphics; // neon city silhouette
  private cameraLagX = 0;
  private cameraZoom = 1;

  // Projected points buffer (re-used every frame)
  private projPoints: ProjectedPoint[] = new Array(DRAW_LENGTH + 2);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Sky (static background)
    this.skyGfx = scene.add.graphics();
    this.drawSky();

    // Neon city silhouette (behind road)
    this.cityLayer = scene.add.graphics();
    this.drawCityline();

    // Main road graphics (redrawn every frame)
    this.gfx = scene.add.graphics();
    this.roadDetailGfx = scene.add.graphics().setDepth(2);

    // Sprite layer for roadside props (on top of road)
    this.spriteLayer = scene.add.container(0, 0);

    // Pre-fill sprite pool (simple Graphics objects for buildings/lamps)
    // We draw them procedurally via Graphics each frame for simplicity
  }

  private drawSky(): void {
    const g = this.skyGfx;
    g.clear();
    // Vertical gradient via multiple horizontal bands
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const y = (HORIZON_Y + 30) * t;
      const h = (HORIZON_Y + 30) / steps + 1;
      // Interpolate from dark navy (top) to dark purple (horizon)
      const r = Math.round(lerp(0x05, 0x0d, t));
      const gr = Math.round(lerp(0x05, 0x00, t));
      const b = Math.round(lerp(0x10, 0x28, t));
      const color = (r << 16) | (gr << 8) | b;
      g.fillStyle(color, 1);
      g.fillRect(0, Math.floor(y), W, Math.ceil(h) + 1);
    }
    // Stars
    g.fillStyle(0xffffff, 0.7);
    for (let s = 0; s < 120; s++) {
      const sx = Math.random() * W;
      const sy = Math.random() * (HORIZON_Y - 20);
      const size = Math.random() < 0.15 ? 2 : 1;
      g.fillRect(sx, sy, size, size);
    }
  }

  private drawCityline(): void {
    const g = this.cityLayer;
    g.clear();
    const baseY = HORIZON_Y + 20;
    // Procedural neon city buildings behind horizon
    const seed = 12345;
    let x = -100;
    const buildColors = [0x00004d, 0x0d0040, 0x060020, 0x100038];
    const neonColors  = [0x00ffff, 0xff00ff, 0x9900ff, 0x0066ff, 0xff6600];

    let rng = seed;
    const rand = () => { rng = (rng * 16807 + 0) % 2147483647; return (rng - 1) / 2147483646; };

    while (x < W + 200) {
      const bw = 30 + rand() * 80;
      const bh = 40 + rand() * 120;
      const bc = buildColors[Math.floor(rand() * buildColors.length)];
      g.fillStyle(bc, 1);
      g.fillRect(x, baseY - bh, bw - 2, bh + 10);

      // Neon accent lines on buildings
      g.lineStyle(1, neonColors[Math.floor(rand() * neonColors.length)], 0.6);
      for (let row = 0; row < 5; row++) {
        const ly = baseY - bh + 8 + row * (bh / 5);
        if (ly > baseY) break;
        g.lineBetween(x + 3, ly, x + bw - 5, ly);
      }

      // Random neon windows
      g.fillStyle(neonColors[Math.floor(rand() * neonColors.length)], 0.9);
      for (let wr = 0; wr < 4; wr++) {
        const wx = x + 5 + rand() * (bw - 15);
        const wy = baseY - bh + 10 + rand() * (bh - 20);
        g.fillRect(wx, wy, 4, 3);
      }

      x += bw + 2 + rand() * 15;
    }
  }

  /** Main render call — called every frame from GameScene */
  render(
    generator:       RoadGenerator,
    cameraZ:         number,       // Player world Z position
    playerLateral:   number,       // Player lateral pos [-1, 1]
    speedFraction:   number,       // speed / maxSpeed [0, 1]
    timeSlowFactor:  number = 1,   // 1 = normal, <1 = slowed (Time Slow power-up)
  ): void {
    const g = this.gfx;
    g.clear();

    const cameraSegIdx = Math.floor(cameraZ / SEGMENT_LENGTH);
    // Sub-segment offset: how far into current segment (0→1)
    const segOffset = (cameraZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;

    generator.ensureAvailable(cameraSegIdx, DRAW_LENGTH + 5);

    // A small delayed lateral follow and speed zoom makes the road feel attached to
    // the car without moving the HUD or introducing input latency.
    const targetLagX = -playerLateral * 72;
    this.cameraLagX = lerp(this.cameraLagX, targetLagX, 0.10);
    const targetZoom = 1 + Math.min(speedFraction, 1.55) * 0.09;
    this.cameraZoom = lerp(this.cameraZoom, targetZoom, 0.07);

    // ---- First Pass: Accumulate curve/hill and project ----
    let accumCurve = 0;  // Accumulated lateral curve offset (world units)
    let accumHill  = 0;  // Accumulated vertical hill offset

    for (let i = 0; i <= DRAW_LENGTH; i++) {
      const seg = generator.getSegment(cameraSegIdx + i);
      // Depth from camera (account for sub-segment position)
      const depth = (i + 1 - segOffset) * SEGMENT_LENGTH;

      if (depth <= 0.01) {
        this.projPoints[i] = { x: W / 2, y: H + 100, w: ROAD_WIDTH * 10, scale: 0 };
        continue;
      }

      const scale = CAMERA_DEPTH / depth;
      // Road center offset from camera X = (accumulated curve) - (player lateral in world)
      const roadCenterX = accumCurve - playerLateral * ROAD_WIDTH;
      const baseX = W / 2 + scale * roadCenterX * (W / 2);
      const baseY = H / 2 + scale * (CAMERA_HEIGHT - accumHill) * (H / 2);
      const screenX = Math.round(W / 2 + (baseX - W / 2) * this.cameraZoom + this.cameraLagX);
      const screenY = Math.round(HORIZON_Y + (baseY - HORIZON_Y) * this.cameraZoom);
      const screenHW = Math.round(scale * ROAD_WIDTH * (W / 2) * this.cameraZoom);

      this.projPoints[i] = { x: screenX, y: screenY, w: screenHW, scale };

      // Accumulate for next segment
      accumCurve += seg.curve * 2.5;
      accumHill  += seg.hill  * 8;
    }

    // ---- Second Pass: Draw from far to near (painter's algorithm) ----
    let maxScreenY = H; // Track the lowest drawn Y to avoid overdraw

    for (let i = DRAW_LENGTH - 1; i >= 0; i--) {
      const near = this.projPoints[i];     // Closer to camera → lower on screen (larger Y)
      const far  = this.projPoints[i + 1]; // Farther → higher on screen (smaller Y)
      const seg  = generator.getSegment(cameraSegIdx + i);

      const topY    = Math.floor(far.y);
      const bottomY = Math.min(Math.ceil(near.y), maxScreenY);

      if (topY >= bottomY || bottomY < HORIZON_Y || topY > H) continue;
      const clampedTop = Math.max(topY, Math.floor(HORIZON_Y));
      if (clampedTop >= bottomY) continue;

      // t factors for interpolation at clamped edges
      const span = near.y - far.y;
      const tTop = span > 0 ? (clampedTop - far.y) / span : 0;
      const tBot = span > 0 ? (bottomY - far.y) / span : 1;

      const topX  = lerp(far.x, near.x, tTop);
      const topW  = lerp(far.w, near.w, tTop);
      const botX  = lerp(far.x, near.x, tBot);
      const botW  = lerp(far.w, near.w, tBot);

      // ---- Grass ----
      g.fillStyle(seg.colors.grass, 1);
      g.fillRect(0, clampedTop, W, bottomY - clampedTop);

      // ---- Road surface (Zero-allocation path drawing) ----
      g.fillStyle(seg.colors.road, 1);
      g.beginPath();
      g.moveTo(botX - botW, bottomY);
      g.lineTo(botX + botW, bottomY);
      g.lineTo(topX + topW, clampedTop);
      g.lineTo(topX - topW, clampedTop);
      g.closePath();
      g.fillPath();

      // Asphalt core
      g.fillStyle(0x000000, 0.42);
      g.beginPath();
      g.moveTo(botX - botW * 0.80, bottomY);
      g.lineTo(botX + botW * 0.80, bottomY);
      g.lineTo(topX + topW * 0.80, clampedTop);
      g.lineTo(topX - topW * 0.80, clampedTop);
      g.closePath();
      g.fillPath();

      // ---- Rumble strips (neon glowing edges) ----
      const rumbleNear = botW * 0.055;
      const rumbleFar  = topW * 0.055;
      g.fillStyle(seg.colors.rumble, 1);
      // Left rumble
      g.beginPath();
      g.moveTo(botX - botW, bottomY);
      g.lineTo(botX - botW + rumbleNear, bottomY);
      g.lineTo(topX - topW + rumbleFar, clampedTop);
      g.lineTo(topX - topW, clampedTop);
      g.closePath();
      g.fillPath();
      // Right rumble
      g.beginPath();
      g.moveTo(botX + botW - rumbleNear, bottomY);
      g.lineTo(botX + botW, bottomY);
      g.lineTo(topX + topW, clampedTop);
      g.lineTo(topX + topW - rumbleFar, clampedTop);
      g.closePath();
      g.fillPath();

      // ---- Highway markings: white dashed lane dividers + double yellow centre ----
      const segIdx = cameraSegIdx + i;
      if (Math.floor(segIdx / 2) % 2 === 0) {
        g.fillStyle(0xf4f7ff, 0.94);
        for (let lane = 1; lane < NUM_LANES; lane++) {
          if (lane === NUM_LANES / 2) continue;
          const fraction = (lane / NUM_LANES) * 2 - 1;
          const markWNear = Math.max(botW * 0.028, 2);
          const markWFar  = Math.max(topW * 0.028, 1);
          const mXNear = botX + fraction * botW;
          const mXFar  = topX + fraction * topW;
          g.beginPath();
          g.moveTo(mXNear - markWNear, bottomY);
          g.lineTo(mXNear + markWNear, bottomY);
          g.lineTo(mXFar + markWFar, clampedTop);
          g.lineTo(mXFar - markWFar, clampedTop);
          g.closePath();
          g.fillPath();
          g.lineStyle(Math.max(1, markWNear * 0.25), COLORS.NEON_CYAN, 0.55);
          g.lineBetween(mXNear, bottomY, mXFar, clampedTop);
        }
      }

      // Continuous double-yellow centre line: a familiar road cue, rendered in neon.
      const centerGapNear = Math.max(botW * 0.026, 3);
      const centerGapFar  = Math.max(topW * 0.026, 1);
      const yellowWidthNear = Math.max(botW * 0.010, 1.5);
      g.lineStyle(yellowWidthNear * 2.2, COLORS.NEON_YELLOW, 0.28);
      g.lineBetween(botX - centerGapNear, bottomY, topX - centerGapFar, clampedTop);
      g.lineBetween(botX + centerGapNear, bottomY, topX + centerGapFar, clampedTop);
      g.lineStyle(yellowWidthNear, 0xffee55, 1);
      g.lineBetween(botX - centerGapNear, bottomY, topX - centerGapFar, clampedTop);
      g.lineBetween(botX + centerGapNear, bottomY, topX + centerGapFar, clampedTop);

      // High contrast outlines keep the road edge visible through the scenery.
      g.lineStyle(Math.max(1, rumbleNear * 0.14), 0xffffff, 0.45);
      g.lineBetween(botX - botW + rumbleNear * 0.45, bottomY, topX - topW + rumbleFar * 0.45, clampedTop);
      g.lineBetween(botX + botW - rumbleNear * 0.45, bottomY, topX + topW - rumbleFar * 0.45, clampedTop);

      // ---- Neon barrier edges (far sections) ----
      if (i > DRAW_LENGTH * 0.3) {
        const barrierAlpha = Math.min((i - DRAW_LENGTH * 0.3) / (DRAW_LENGTH * 0.3), 1) * 0.5;
        g.fillStyle(COLORS.BARRIER_FAR, barrierAlpha);
        const bw = Math.max(topW * 0.04, 1);
        g.fillRect(topX - topW - bw * 2, clampedTop, bw, bottomY - clampedTop);
        g.fillRect(topX + topW + bw,     clampedTop, bw, bottomY - clampedTop);
      }

      maxScreenY = clampedTop;
    }

    // ---- Crisp overlay: deliberately separate so road markings never get lost ----
    this.drawNeonHighwayDetails(cameraSegIdx);

    // ---- Draw roadside sprites ----
    this.drawRoadsideSprites(generator, cameraSegIdx, segOffset);

    // ---- Ground below road (fill any remaining gap) ----
    g.fillStyle(COLORS.GRASS_A, 1);
    if (maxScreenY < H) {
      // Already covered by road rendering
    }
  }

  /**
   * Draw a strong arcade-highway language above the road fill: solid neon rails,
   * cyan/white dashed lane dividers, and a magenta centre guide. The painter's
   * road segments remain responsible for hills and curves; this layer guarantees
   * the markings are readable at any speed.
   */
  private drawNeonHighwayDetails(cameraSegIdx: number): void {
    const g = this.roadDetailGfx;
    g.clear();

    for (let i = DRAW_LENGTH - 2; i >= 0; i--) {
      const near = this.projPoints[i];
      const far = this.projPoints[i + 1];
      if (!near || !far) continue;
      if (near.y < HORIZON_Y || far.y > H + 40 || near.y <= far.y) continue;

      const ny = Math.min(near.y, H + 30);
      const fy = Math.max(far.y, HORIZON_Y);
      const dash = Math.floor((cameraSegIdx + i) / 3) % 2 === 0;

      // Continuous, dual-colour safety rails at the outside of the road.
      const railWidth = Math.max(1, Math.min(8, near.w * 0.010));
      for (const side of [-1, 1]) {
        const nx = near.x + side * near.w * 0.98;
        const fx = far.x + side * far.w * 0.98;
        g.lineStyle(railWidth * 3, side < 0 ? COLORS.NEON_MAGENTA : COLORS.NEON_CYAN, 0.28);
        g.lineBetween(nx, ny, fx, fy);
        g.lineStyle(railWidth, 0xffffff, 0.9);
        g.lineBetween(nx, ny, fx, fy);
      }

      // Cyan-white dashed lane dividers. Four lanes means dividers at -0.5/+0.5.
      if (dash) {
        for (const lane of [-0.5, 0.5]) {
          const nx = near.x + lane * near.w;
          const fx = far.x + lane * far.w;
          const width = Math.max(1, Math.min(7, near.w * 0.009));
          g.lineStyle(width * 2.4, COLORS.NEON_CYAN, 0.25);
          g.lineBetween(nx, ny, fx, fy);
          g.lineStyle(width, 0xf7fbff, 0.96);
          g.lineBetween(nx, ny, fx, fy);
        }
      }

      // Solid double-yellow centre lane, kept distinct from every player skin.
      const centerOffsetNear = Math.max(2, Math.min(24, near.w * 0.025));
      const centerOffsetFar = Math.max(1, Math.min(8, far.w * 0.025));
      const centerWidth = Math.max(1, Math.min(6, near.w * 0.007));
      for (const side of [-1, 1]) {
        g.lineStyle(centerWidth * 3, COLORS.NEON_YELLOW, 0.28);
        g.lineBetween(near.x + side * centerOffsetNear, ny, far.x + side * centerOffsetFar, fy);
        g.lineStyle(centerWidth, 0xfff4a3, 1);
        g.lineBetween(near.x + side * centerOffsetNear, ny, far.x + side * centerOffsetFar, fy);
      }
    }
  }

  private drawRoadsideSprites(
    generator:    RoadGenerator,
    cameraSegIdx: number,
    segOffset:    number,
  ): void {
    const g = this.gfx;
    // Draw sprite-type objects (buildings, lamps) from far to near
    for (let i = DRAW_LENGTH - 1; i >= 0; i--) {
      const seg = generator.getSegment(cameraSegIdx + i);
      if (seg.sprites.length === 0) continue;

      const near = this.projPoints[i];
      const far  = this.projPoints[i + 1];
      if (!near || !far) continue;
      if (near.y < HORIZON_Y) continue;

      const midX = lerp(far.x, near.x, 0.5);
      const midW = lerp(far.w, near.w, 0.5);
      const midY = lerp(far.y, near.y, 0.5);
      const midScale = lerp(far.scale, near.scale, 0.5);

      for (const sprite of seg.sprites) {
        this.drawSprite(g, sprite, midX, midY, midW, midScale);
      }
    }
  }

  private drawSprite(
    g:      Phaser.GameObjects.Graphics,
    sprite: RoadSprite,
    roadX:  number,
    roadY:  number,
    roadW:  number,
    scale:  number,
  ): void {
    const sideMultiplier = sprite.side === 'left' ? -1 : 1;
    const spriteX = roadX + sideMultiplier * (roadW + roadW * sprite.offset * 2);
    const spriteH = 60 * scale * sprite.scale;
    const spriteW = 20 * scale * sprite.scale;

    if (roadY < HORIZON_Y || spriteH < 2) return;

    switch (sprite.type) {
      case 'lamp': {
        // Neon lamp post
        g.fillStyle(0x222244, 1);
        g.fillRect(spriteX - spriteW * 0.15, roadY - spriteH, spriteW * 0.3, spriteH);
        // Lamp head
        g.fillStyle(COLORS.NEON_CYAN, 0.9);
        g.fillRect(spriteX - spriteW * 0.6, roadY - spriteH, spriteW * 1.2, spriteH * 0.08);
        // Glow dot
        g.fillStyle(COLORS.NEON_CYAN, 0.6);
        const dotR = Math.max(spriteH * 0.06, 2);
        g.fillCircle(spriteX, roadY - spriteH + spriteH * 0.04, dotR);
        break;
      }
      case 'building_a': {
        const bw = spriteW * 2.5;
        const bh = spriteH * 1.4;
        // Building body
        g.fillStyle(0x0a0025, 1);
        g.fillRect(spriteX - bw / 2, roadY - bh, bw, bh);
        // Neon accent
        g.lineStyle(1, COLORS.NEON_PURPLE, 0.7);
        g.strokeRect(spriteX - bw / 2, roadY - bh, bw, bh);
        // Windows
        g.fillStyle(COLORS.NEON_BLUE, 0.5);
        const wrows = Math.max(2, Math.floor(bh / (spriteH * 0.2)));
        for (let r = 0; r < wrows; r++) {
          const wy = roadY - bh + bh * 0.1 + r * (bh * 0.15);
          if (wy > roadY) break;
          g.fillRect(spriteX - bw * 0.3, wy, bw * 0.2, Math.max(spriteH * 0.04, 2));
          g.fillRect(spriteX + bw * 0.1, wy, bw * 0.2, Math.max(spriteH * 0.04, 2));
        }
        break;
      }
      case 'building_b': {
        const bw = spriteW * 1.8;
        const bh = spriteH * 2;
        g.fillStyle(0x080020, 1);
        g.fillRect(spriteX - bw / 2, roadY - bh, bw, bh);
        g.lineStyle(1, COLORS.NEON_MAGENTA, 0.5);
        g.lineBetween(spriteX - bw / 2, roadY - bh, spriteX + bw / 2, roadY - bh);
        g.fillStyle(COLORS.NEON_MAGENTA, 0.4);
        const signH = Math.max(spriteH * 0.06, 2);
        g.fillRect(spriteX - bw * 0.35, roadY - bh + spriteH * 0.2, bw * 0.7, signH);
        break;
      }
      case 'barrier': {
        g.fillStyle(COLORS.NEON_CYAN, 0.8);
        g.fillRect(spriteX - spriteW * 0.3, roadY - spriteH * 0.3, spriteW * 0.6, spriteH * 0.3);
        break;
      }
    }
  }

  /** Return the projected screen X for a given lateral position on the road at the player's depth */
  getPlayerScreenX(playerLateral: number, depthIdx: number = 2): number {
    const p = this.projPoints[depthIdx];
    if (!p) return GAME_WIDTH / 2;
    return Math.round(p.x + playerLateral * p.w);
  }

  /** Road-plane Y at the player anchor point, so the car never appears to float. */
  getPlayerScreenY(depthIdx: number = 8): number {
    const p = this.projPoints[depthIdx];
    return p ? p.y : GAME_HEIGHT * 0.8;
  }

  /** Return road width (half) at player depth for collision/display */
  getRoadWidthAtDepth(depthIdx: number = 2): number {
    const p = this.projPoints[depthIdx];
    return p ? p.w : 100;
  }

  /** Get the projected position of a world-Z traffic car for rendering */
  getWorldZScreenPos(
    worldZ: number,
    cameraZ: number,
    lateral: number,
  ): { x: number; y: number; scale: number } | null {
    const depth = worldZ - cameraZ;
    if (depth <= 0 || depth > DRAW_LENGTH * SEGMENT_LENGTH) return null;

    const segAhead = Math.floor(depth / SEGMENT_LENGTH);
    if (segAhead >= DRAW_LENGTH || !this.projPoints[segAhead]) return null;

    const near = this.projPoints[segAhead];
    const far  = this.projPoints[segAhead + 1];
    if (!far) return null;

    const t = (depth - segAhead * SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const x = lerp(near.x, far.x, t) + lateral * lerp(near.w, far.w, t);
    const y = lerp(near.y, far.y, t);
    const s = lerp(near.scale, far.scale, t);

    return { x, y, scale: s };
  }

  destroy(): void {
    this.gfx.destroy();
    this.roadDetailGfx.destroy();
    this.skyGfx.destroy();
    this.cityLayer.destroy();
    this.spriteLayer.destroy();
  }
}

// ============================================================
// NEON ARCADE RACER — Player Car Visual Representation (Zero GC)
// ============================================================

import Phaser from 'phaser';
import type { Player } from './Player';
import { CAR_SKINS, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { lerp } from '../utils/Math';

const CAR_W = 84;
const CAR_H = 46;

export class PlayerCar {
  private scene:   Phaser.Scene;
  private player:  Player;
  private gfx:     Phaser.GameObjects.Graphics;   // Car body
  private trailGfx:Phaser.GameObjects.Graphics;   // Neon trail
  private glowGfx: Phaser.GameObjects.Graphics;   // Shadow & ground contact glow

  // Pre-allocated ring buffer for trail points (Zero memory allocation)
  private trailPoints: Array<{ x: number; y: number; age: number; active: boolean }> = Array.from(
    { length: 40 },
    () => ({ x: 0, y: 0, age: 0, active: false })
  );
  private trailHead = 0;

  // Shield visual
  private shieldGfx: Phaser.GameObjects.Graphics;
  private shieldAngle = 0;

  // Chromatic aberration overlays
  private chromaR: Phaser.GameObjects.Graphics;
  private chromaB: Phaser.GameObjects.Graphics;

  // Speed line graphics
  private speedLineGfx: Phaser.GameObjects.Graphics;

  private lastX = GAME_WIDTH / 2;
  private lastY = GAME_HEIGHT * 0.78;
  private flickerTimer = 0;
  private wheelSpin = 0;
  private roadRumbleTimer = 0;

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene  = scene;
    this.player = player;

    // Rendering order (depth): trail → glow/shadow → car → shield → chromatic
    this.trailGfx    = scene.add.graphics().setDepth(10);
    this.speedLineGfx= scene.add.graphics().setDepth(11);
    this.glowGfx     = scene.add.graphics().setDepth(12);
    this.gfx         = scene.add.graphics().setDepth(13);
    this.shieldGfx   = scene.add.graphics().setDepth(14);
    this.chromaR     = scene.add.graphics().setDepth(50).setAlpha(0);
    this.chromaB     = scene.add.graphics().setDepth(50).setAlpha(0);
  }

  update(dt: number, roadRenderer: {
    getPlayerScreenX: (lat: number, d: number) => number;
    getPlayerScreenY: (d: number) => number;
  }): void {
    const skin = CAR_SKINS[this.player.skinIndex] ?? CAR_SKINS[0];
    const speedFrac = this.player.speedFraction;

    const rawRoadX = roadRenderer.getPlayerScreenX(this.player.lateralPos, 3);
    const rawRoadY = roadRenderer.getPlayerScreenY(4);

    // 1:1 Immediate horizontal response — 0ms steering latency
    const carX = rawRoadX;

    this.roadRumbleTimer += dt * (15 + speedFrac * 35);
    const asphaltRumble = (Math.sin(this.roadRumbleTimer * 2.8) * 0.8 + Math.cos(this.roadRumbleTimer * 4.2) * 0.4) * speedFrac;
    
    const pitchOffset = (this.player.isBoostActive ? 2.5 : speedFrac * 1.5);
    // Position car with clear separation above bottom speedometer bar (clear view of rear and exhaust)
    const targetCarY = Math.min(rawRoadY - CAR_H * 0.45 + asphaltRumble + pitchOffset, GAME_HEIGHT - 108);
    const carY = lerp(this.lastY, targetCarY, Math.min(dt * 18, 1.0));

    this.wheelSpin += dt * (10 + speedFrac * 40);

    // ---- Trail ----
    this.updateTrail(dt, carX, carY, skin.trailColor);

    // ---- Speed lines ----
    this.drawSpeedLines(dt);

    // ---- Shadow & ground contact glow ----
    this.drawGlowAndShadow(carX, carY, skin.carColor, speedFrac);

    // ---- Car body ----
    this.drawCar(carX, carY, skin.carColor);

    // ---- Shield ----
    this.drawShield(dt, carX, carY);

    // ---- Chromatic aberration ----
    this.drawChromatic(dt, carX, carY, skin.carColor);

    this.lastX = carX;
    this.lastY = carY;
    this.flickerTimer += dt;
  }

  private updateTrail(dt: number, x: number, y: number, trailColor: number): void {
    const g = this.trailGfx;
    const isDrifting = this.player.isDrifting;
    const isBoost = this.player.isBoostActive;
    const maxAge = isDrifting ? 0.85 : isBoost ? 0.45 : 0.28;

    // Add new point into pre-allocated ring buffer
    if (this.player.speed > 50) {
      const p = this.trailPoints[this.trailHead];
      p.x = x;
      p.y = y + CAR_H * 0.35;
      p.age = 0;
      p.active = true;
      this.trailHead = (this.trailHead + 1) % this.trailPoints.length;
    }

    // Age in-place without array reallocation
    for (let i = 0; i < this.trailPoints.length; i++) {
      const p = this.trailPoints[i];
      if (p.active) {
        p.age += dt;
        if (p.age >= maxAge) p.active = false;
      }
    }

    g.clear();

    // Draw active trail points
    const len = this.trailPoints.length;
    for (let j = 0; j < len - 1; j++) {
      const idx0 = (this.trailHead - 1 - j + len) % len;
      const idx1 = (this.trailHead - 2 - j + len) % len;
      const p0 = this.trailPoints[idx0];
      const p1 = this.trailPoints[idx1];

      if (!p0.active || !p1.active) continue;

      const t = 1 - (p0.age / maxAge);
      const alpha = t * (isDrifting ? 1.0 : isBoost ? 0.75 : 0.55);
      const width = lerp(isDrifting ? 20 : isBoost ? 10 : 6, 1, p0.age / maxAge);

      const color = isDrifting
        ? (j % 2 === 0 ? COLORS.NEON_MAGENTA : COLORS.NEON_CYAN)
        : isBoost ? COLORS.NEON_YELLOW
        : trailColor;

      g.lineStyle(width, color, alpha);
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);

      if (alpha > 0.25) {
        const coreW = isDrifting ? Math.max(2, width * 0.4) : Math.max(1, width * 0.3);
        g.lineStyle(coreW, 0xffffff, alpha * (isDrifting ? 0.75 : 0.5));
        g.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
    }
  }

  private drawSpeedLines(dt: number): void {
    const g = this.speedLineGfx;
    g.clear();

    const speed = this.player.speedFraction;
    const isBoost = this.player.isBoostActive;
    // Only appear at top speeds (75%+) or during Nitro/Overdrive boost
    const intensity = isBoost ? 1.0 : Math.max(0, (speed - 0.75) / 0.25);
    if (intensity < 0.01) return;

    const lineCount = isBoost ? 14 : Math.floor(intensity * 8);
    const alpha = intensity * (isBoost ? 0.38 : 0.22);

    // Draw wind streaks strictly on the outer left and right screen borders
    for (let i = 0; i < lineCount; i++) {
      const isLeft = i % 2 === 0;
      const xMargin = (i % 4) * 35 + 25;
      const x1 = isLeft ? xMargin : GAME_WIDTH - xMargin;
      const y1 = Math.random() * (GAME_HEIGHT * 0.85);
      const len = 70 + Math.random() * 110 + intensity * 60;
      const x2 = isLeft ? x1 + (Math.random() - 0.3) * 15 : x1 - (Math.random() - 0.3) * 15;
      const y2 = y1 + len;

      const lineColor = i % 3 === 0 ? COLORS.NEON_CYAN : (i % 3 === 1 ? COLORS.NEON_MAGENTA : 0xffffff);
      g.lineStyle(1.2 + intensity * 0.8, lineColor, alpha * (0.5 + 0.5 * Math.random()));
      g.lineBetween(x1, y1, x2, y2);
    }
  }

  private drawGlowAndShadow(cx: number, cy: number, color: number, speedFrac: number): void {
    const g = this.glowGfx;
    g.clear();
    const boost = this.player.isBoostActive;
    const w = CAR_W;
    const h = CAR_H;
    const lean = this.player.driftAngle;
    const leanOffset = lean * w * 1.1;

    // 1. Asphalt shadow
    g.fillStyle(0x000000, 0.85);
    g.fillEllipse(cx + leanOffset * 0.2, cy + h * 0.46, w * 1.25, h * 0.38);

    // 2. Tire contact patches
    g.fillStyle(0x000000, 0.95);
    g.fillEllipse(cx - w * 0.44 + leanOffset, cy + h * 0.48, w * 0.24, 10);
    g.fillEllipse(cx + w * 0.44 + leanOffset, cy + h * 0.48, w * 0.24, 10);
    g.fillEllipse(cx - w * 0.38 + leanOffset, cy + h * 0.08, w * 0.20, 8);
    g.fillEllipse(cx + w * 0.38 + leanOffset, cy + h * 0.08, w * 0.20, 8);

    // 3. Multi-layer High-Intensity Neon Ground Underglow
    const radius = boost ? 75 : 52;
    const alpha  = boost ? 0.65 : 0.40;
    // Outer soft bloom
    g.fillStyle(color, alpha * 0.25);
    g.fillEllipse(cx + leanOffset * 0.3, cy + h * 0.38, radius * 3.0, radius * 0.85);
    // Mid glow
    g.fillStyle(color, alpha * 0.65);
    g.fillEllipse(cx + leanOffset * 0.3, cy + h * 0.40, radius * 1.9, radius * 0.50);
    // Intense hot center
    g.fillStyle(0xffffff, alpha * 0.45);
    g.fillEllipse(cx + leanOffset * 0.3, cy + h * 0.41, radius * 0.9, radius * 0.25);

    // 4. Dynamic tire friction sparks on speed / drift
    if (speedFrac > 0.35 || this.player.isDrifting) {
      const sparkCount = this.player.isDrifting ? 8 : 3;
      for (let s = 0; s < sparkCount; s++) {
        const side = s % 2 === 0 ? -1 : 1;
        const sx = cx + side * (w * 0.44) + leanOffset + (Math.random() - 0.5) * 10;
        const sy = cy + h * 0.48 + Math.random() * 8;
        g.fillStyle(this.player.isDrifting ? COLORS.NEON_YELLOW : color, 0.9);
        g.fillCircle(sx, sy, 1.5 + Math.random() * 2);
      }
    }
  }

  private drawCar(cx: number, cy: number, color: number): void {
    const skinIdx = this.player.skinIndex;
    switch (skinIdx) {
      case 1: this.drawMonsterTruck(cx, cy, color); break;
      case 2: this.drawFlatSports(cx, cy, color); break;
      case 3: this.drawSUV(cx, cy, color); break;
      case 4: this.drawF1(cx, cy, color); break;
      default: this.drawSedan(cx, cy, color); break;
    }
  }

  /** CAR 0 — NEON PINK: Default sleek neon sedan */
  private drawSedan(cx: number, cy: number, color: number): void {
    const g = this.gfx;
    g.clear();
    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 14) % 2 === 0;
    g.setAlpha(invincible ? 0.35 : 1);
    const lo = lean * CAR_W * 1.1;
    const w = CAR_W, h = CAR_H;
    const tireColor = 0x0a0a14;

    // Rear tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.54 + lo, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    g.fillRoundedRect(cx + w * 0.35 + lo, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    g.lineStyle(1.5, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.54 + lo, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    g.strokeRoundedRect(cx + w * 0.35 + lo, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    const sp = Math.sin(this.wheelSpin) * 4;
    g.lineStyle(1, 0xffffff, 0.7);
    g.lineBetween(cx - w * 0.44 + lo - 4, cy + h * 0.31 + sp, cx - w * 0.44 + lo + 4, cy + h * 0.31 - sp);
    g.lineBetween(cx + w * 0.44 + lo - 4, cy + h * 0.31 + sp, cx + w * 0.44 + lo + 4, cy + h * 0.31 - sp);

    // Front tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.46 + lo, cy - h * 0.36, w * 0.14, h * 0.32, 3);
    g.fillRoundedRect(cx + w * 0.32 + lo, cy - h * 0.36, w * 0.14, h * 0.32, 3);
    g.lineStyle(1, color, 0.7);
    g.strokeRoundedRect(cx - w * 0.46 + lo, cy - h * 0.36, w * 0.14, h * 0.32, 3);
    g.strokeRoundedRect(cx + w * 0.32 + lo, cy - h * 0.36, w * 0.14, h * 0.32, 3);

    // Body shell
    g.fillStyle(0x0e0e1a, 1);
    g.beginPath(); g.moveTo(cx - w * 0.46 + lo, cy - h * 0.3); g.lineTo(cx + w * 0.46 + lo, cy - h * 0.3);
    g.lineTo(cx + w * 0.44 + lo, cy + h * 0.42); g.lineTo(cx - w * 0.44 + lo, cy + h * 0.42); g.closePath(); g.fillPath();
    g.fillStyle(color, 1);
    g.beginPath(); g.moveTo(cx - w * 0.42 + lo, cy - h * 0.12); g.lineTo(cx + w * 0.42 + lo, cy - h * 0.12);
    g.lineTo(cx + w * 0.38 + lo, cy + h * 0.42); g.lineTo(cx - w * 0.38 + lo, cy + h * 0.42); g.closePath(); g.fillPath();
    g.lineStyle(2, 0xffffff, 0.45); g.strokePath();

    // Hood
    g.fillStyle(color, 0.9);
    g.beginPath(); g.moveTo(cx - w * 0.32 + lo, cy - h * 0.12); g.lineTo(cx + w * 0.32 + lo, cy - h * 0.12);
    g.lineTo(cx + w * 0.24 + lo, cy - h * 0.48); g.lineTo(cx - w * 0.24 + lo, cy - h * 0.48); g.closePath(); g.fillPath();
    g.lineStyle(1.5, 0xffffff, 0.6); g.strokePath();

    // Windshield
    g.fillStyle(0x020a14, 0.92);
    g.beginPath(); g.moveTo(cx - w * 0.25 + lo, cy - h * 0.10); g.lineTo(cx + w * 0.25 + lo, cy - h * 0.10);
    g.lineTo(cx + w * 0.18 + lo, cy - h * 0.40); g.lineTo(cx - w * 0.18 + lo, cy - h * 0.40); g.closePath(); g.fillPath();
    g.lineStyle(2, COLORS.NEON_CYAN, 0.85); g.strokePath();

    // Racing stripe
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(cx - w * 0.04 + lo, cy - h * 0.46, w * 0.08, h * 0.84);

    // Spoiler
    g.fillStyle(0x050510, 1);
    g.fillRoundedRect(cx - w * 0.46 + lo, cy + h * 0.34, w * 0.92, h * 0.10, 2);
    g.lineStyle(2.5, color, 1.0);
    g.lineBetween(cx - w * 0.47 + lo, cy + h * 0.34, cx + w * 0.47 + lo, cy + h * 0.34);

    // Headlights
    const lc = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lc, 1); g.fillCircle(cx - w * 0.26 + lo, cy - h * 0.46, 5); g.fillCircle(cx + w * 0.26 + lo, cy - h * 0.46, 5);
    g.fillStyle(lc, 0.4); g.fillCircle(cx - w * 0.26 + lo, cy - h * 0.46, 10); g.fillCircle(cx + w * 0.26 + lo, cy - h * 0.46, 10);
    g.fillStyle(lc, 0.08);
    g.fillTriangle(cx - w * 0.26 + lo, cy - h * 0.46, cx - w * 0.60 + lo, cy - h * 1.6, cx - w * 0.05 + lo, cy - h * 1.6);
    g.fillTriangle(cx + w * 0.26 + lo, cy - h * 0.46, cx + w * 0.05 + lo, cy - h * 1.6, cx + w * 0.60 + lo, cy - h * 1.6);

    // Taillights & exhaust
    g.fillStyle(COLORS.NEON_MAGENTA, 1); g.fillRect(cx - w * 0.40 + lo, cy + h * 0.38, w * 0.80, 5);
    g.fillStyle(0xffffff, 0.8); g.fillRect(cx - w * 0.35 + lo, cy + h * 0.39, w * 0.70, 2);
    g.fillStyle(0x050510, 1); g.fillRect(cx - w * 0.24 + lo, cy + h * 0.42, w * 0.48, h * 0.08);
    g.fillStyle(COLORS.NEON_ORANGE, boost ? 1 : 0.6);
    g.fillCircle(cx - w * 0.12 + lo, cy + h * 0.45, 3.5); g.fillCircle(cx + w * 0.12 + lo, cy + h * 0.45, 3.5);

    this.drawBoostFlame(g, cx, cy, lo, w, h, boost);
    g.setAlpha(1);
  }

  /** CAR 1 — GHOST CYAN: Monster Truck — tall, very chunky wide wheels, high clearance body */
  private drawMonsterTruck(cx: number, cy: number, color: number): void {
    const g = this.gfx;
    g.clear();
    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 14) % 2 === 0;
    g.setAlpha(invincible ? 0.35 : 1);
    const lo = lean * CAR_W * 1.1;
    const w = CAR_W * 1.15, h = CAR_H * 1.30; // Bigger overall
    const tireColor = 0x090912;

    // Huge chunky rear tires (wider, taller, knobby)
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.60 + lo, cy + h * 0.04, w * 0.24, h * 0.50, 5);
    g.fillRoundedRect(cx + w * 0.36 + lo, cy + h * 0.04, w * 0.24, h * 0.50, 5);
    g.lineStyle(2.5, color, 1.0);
    g.strokeRoundedRect(cx - w * 0.60 + lo, cy + h * 0.04, w * 0.24, h * 0.50, 5);
    g.strokeRoundedRect(cx + w * 0.36 + lo, cy + h * 0.04, w * 0.24, h * 0.50, 5);
    // Tread lines
    for (let i = 0; i < 4; i++) {
      const ty = cy + h * 0.10 + i * h * 0.11;
      g.lineStyle(1, 0x334466, 0.8);
      g.lineBetween(cx - w * 0.59 + lo, ty, cx - w * 0.37 + lo, ty);
      g.lineBetween(cx + w * 0.37 + lo, ty, cx + w * 0.59 + lo, ty);
    }
    const sp = Math.sin(this.wheelSpin) * 5;
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(cx - w * 0.48 + lo - 6, cy + h * 0.29 + sp, cx - w * 0.48 + lo + 6, cy + h * 0.29 - sp);
    g.lineBetween(cx + w * 0.48 + lo - 6, cy + h * 0.29 + sp, cx + w * 0.48 + lo + 6, cy + h * 0.29 - sp);

    // Huge chunky front tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.55 + lo, cy - h * 0.46, w * 0.22, h * 0.40, 5);
    g.fillRoundedRect(cx + w * 0.33 + lo, cy - h * 0.46, w * 0.22, h * 0.40, 5);
    g.lineStyle(2.5, color, 1.0);
    g.strokeRoundedRect(cx - w * 0.55 + lo, cy - h * 0.46, w * 0.22, h * 0.40, 5);
    g.strokeRoundedRect(cx + w * 0.33 + lo, cy - h * 0.46, w * 0.22, h * 0.40, 5);

    // Suspension axles
    g.lineStyle(3, 0x334466, 1);
    g.lineBetween(cx - w * 0.44 + lo, cy + h * 0.28, cx + w * 0.44 + lo, cy + h * 0.28);
    g.lineBetween(cx - w * 0.40 + lo, cy - h * 0.26, cx + w * 0.40 + lo, cy - h * 0.26);

    // Raised body shell (high clearance — boxy & tall)
    g.fillStyle(0x0d0d1a, 1);
    g.fillRoundedRect(cx - w * 0.40 + lo, cy - h * 0.52, w * 0.80, h * 0.90, 5);
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - w * 0.36 + lo, cy - h * 0.48, w * 0.72, h * 0.82, 4);
    g.lineStyle(2, 0xffffff, 0.5); g.strokeRoundedRect(cx - w * 0.36 + lo, cy - h * 0.48, w * 0.72, h * 0.82, 4);

    // Roof rack / roll cage
    g.lineStyle(2, 0xffffff, 0.35);
    g.lineBetween(cx - w * 0.32 + lo, cy - h * 0.46, cx - w * 0.32 + lo, cy - h * 0.65);
    g.lineBetween(cx + w * 0.32 + lo, cy - h * 0.46, cx + w * 0.32 + lo, cy - h * 0.65);
    g.lineBetween(cx - w * 0.32 + lo, cy - h * 0.65, cx + w * 0.32 + lo, cy - h * 0.65);

    // Windshield
    g.fillStyle(0x020a14, 0.9);
    g.fillRoundedRect(cx - w * 0.27 + lo, cy - h * 0.44, w * 0.54, h * 0.30, 3);
    g.lineStyle(2, COLORS.NEON_CYAN, 0.8); g.strokeRoundedRect(cx - w * 0.27 + lo, cy - h * 0.44, w * 0.54, h * 0.30, 3);

    // Snorkel / exhaust stack
    g.fillStyle(0x223344, 1);
    g.fillRect(cx + w * 0.28 + lo, cy - h * 0.66, w * 0.07, h * 0.30);
    g.fillStyle(color, 0.8); g.fillCircle(cx + w * 0.315 + lo, cy - h * 0.66, 4);

    // Big headlights
    const lc = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lc, 1);
    g.fillRoundedRect(cx - w * 0.33 + lo, cy - h * 0.52, w * 0.15, h * 0.09, 2);
    g.fillRoundedRect(cx + w * 0.18 + lo, cy - h * 0.52, w * 0.15, h * 0.09, 2);
    g.fillStyle(lc, 0.3);
    g.fillRoundedRect(cx - w * 0.34 + lo, cy - h * 0.53, w * 0.17, h * 0.12, 3);
    g.fillRoundedRect(cx + w * 0.17 + lo, cy - h * 0.53, w * 0.17, h * 0.12, 3);

    // Taillights (wide bar)
    g.fillStyle(COLORS.NEON_MAGENTA, 1); g.fillRect(cx - w * 0.35 + lo, cy + h * 0.36, w * 0.70, 5);
    g.fillStyle(0xffffff, 0.7); g.fillRect(cx - w * 0.30 + lo, cy + h * 0.37, w * 0.60, 2);

    // Dual exhausts
    g.fillStyle(0x050510, 1);
    g.fillRect(cx - w * 0.30 + lo, cy + h * 0.40, w * 0.16, h * 0.10);
    g.fillRect(cx + w * 0.14 + lo, cy + h * 0.40, w * 0.16, h * 0.10);
    g.fillStyle(COLORS.NEON_ORANGE, boost ? 1 : 0.5);
    g.fillCircle(cx - w * 0.22 + lo, cy + h * 0.44, 4); g.fillCircle(cx + w * 0.22 + lo, cy + h * 0.44, 4);

    this.drawBoostFlame(g, cx, cy, lo, w, h, boost);
    g.setAlpha(1);
  }

  /** CAR 2 — SOLAR FLARE: Flat sports car — very wide, very low, minimal canopy */
  private drawFlatSports(cx: number, cy: number, color: number): void {
    const g = this.gfx;
    g.clear();
    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 14) % 2 === 0;
    g.setAlpha(invincible ? 0.35 : 1);
    const lo = lean * CAR_W * 1.1;
    const w = CAR_W * 1.25, h = CAR_H * 0.72; // WIDE, very FLAT
    const tireColor = 0x080810;

    // Low-profile rear tires (wide, flat)
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.56 + lo, cy + h * 0.15, w * 0.16, h * 0.45, 3);
    g.fillRoundedRect(cx + w * 0.40 + lo, cy + h * 0.15, w * 0.16, h * 0.45, 3);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.56 + lo, cy + h * 0.15, w * 0.16, h * 0.45, 3);
    g.strokeRoundedRect(cx + w * 0.40 + lo, cy + h * 0.15, w * 0.16, h * 0.45, 3);
    const sp = Math.sin(this.wheelSpin) * 3;
    g.lineStyle(1, 0xffffff, 0.7);
    g.lineBetween(cx - w * 0.48 + lo - 4, cy + h * 0.38 + sp, cx - w * 0.48 + lo + 4, cy + h * 0.38 - sp);
    g.lineBetween(cx + w * 0.48 + lo - 4, cy + h * 0.38 + sp, cx + w * 0.48 + lo + 4, cy + h * 0.38 - sp);

    // Low-profile front tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.50 + lo, cy - h * 0.46, w * 0.14, h * 0.40, 3);
    g.fillRoundedRect(cx + w * 0.36 + lo, cy - h * 0.46, w * 0.14, h * 0.40, 3);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.50 + lo, cy - h * 0.46, w * 0.14, h * 0.40, 3);
    g.strokeRoundedRect(cx + w * 0.36 + lo, cy - h * 0.46, w * 0.14, h * 0.40, 3);

    // Wide flat body
    g.fillStyle(0x0a0a16, 1);
    g.beginPath(); g.moveTo(cx - w * 0.52 + lo, cy - h * 0.20); g.lineTo(cx + w * 0.52 + lo, cy - h * 0.20);
    g.lineTo(cx + w * 0.50 + lo, cy + h * 0.50); g.lineTo(cx - w * 0.50 + lo, cy + h * 0.50); g.closePath(); g.fillPath();
    g.fillStyle(color, 1);
    g.beginPath(); g.moveTo(cx - w * 0.48 + lo, cy - h * 0.08); g.lineTo(cx + w * 0.48 + lo, cy - h * 0.08);
    g.lineTo(cx + w * 0.44 + lo, cy + h * 0.50); g.lineTo(cx - w * 0.44 + lo, cy + h * 0.50); g.closePath(); g.fillPath();
    g.lineStyle(1.5, 0xffffff, 0.40); g.strokePath();

    // Pointed long hood
    g.fillStyle(color, 0.9);
    g.beginPath(); g.moveTo(cx - w * 0.36 + lo, cy - h * 0.08); g.lineTo(cx + w * 0.36 + lo, cy - h * 0.08);
    g.lineTo(cx + w * 0.18 + lo, cy - h * 0.60); g.lineTo(cx - w * 0.18 + lo, cy - h * 0.60); g.closePath(); g.fillPath();
    g.lineStyle(1.5, 0xffffff, 0.5); g.strokePath();

    // Tiny low canopy bubble (no roof, just a tiny cockpit dome)
    g.fillStyle(0x020a14, 0.95);
    g.beginPath(); g.moveTo(cx - w * 0.14 + lo, cy + h * 0.05); g.lineTo(cx + w * 0.14 + lo, cy + h * 0.05);
    g.lineTo(cx + w * 0.10 + lo, cy - h * 0.12); g.lineTo(cx - w * 0.10 + lo, cy - h * 0.12); g.closePath(); g.fillPath();
    g.lineStyle(2, COLORS.NEON_CYAN, 0.9); g.strokePath();

    // Side vents (distinctive flat sports look)
    g.fillStyle(0x111122, 1);
    g.fillRoundedRect(cx - w * 0.46 + lo, cy - h * 0.02, w * 0.12, h * 0.20, 2);
    g.fillRoundedRect(cx + w * 0.34 + lo, cy - h * 0.02, w * 0.12, h * 0.20, 2);
    for (let i = 0; i < 3; i++) {
      const vx = cy - h * 0.00 + i * h * 0.07;
      g.lineStyle(1, color, 0.6);
      g.lineBetween(cx - w * 0.46 + lo, vx, cx - w * 0.34 + lo, vx);
      g.lineBetween(cx + w * 0.34 + lo, vx, cx + w * 0.46 + lo, vx);
    }

    // Massive rear diffuser / wing
    g.fillStyle(0x050510, 1);
    g.fillRoundedRect(cx - w * 0.50 + lo, cy + h * 0.38, w * 1.0, h * 0.12, 2);
    g.lineStyle(3, color, 1.0);
    g.lineBetween(cx - w * 0.52 + lo, cy + h * 0.38, cx + w * 0.52 + lo, cy + h * 0.38);

    // Headlights (sleek slits)
    const lc = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lc, 1);
    g.fillRect(cx - w * 0.30 + lo, cy - h * 0.56, w * 0.22, h * 0.06);
    g.fillRect(cx + w * 0.08 + lo, cy - h * 0.56, w * 0.22, h * 0.06);
    g.fillStyle(lc, 0.25);
    g.fillRect(cx - w * 0.31 + lo, cy - h * 0.58, w * 0.24, h * 0.10);
    g.fillRect(cx + w * 0.07 + lo, cy - h * 0.58, w * 0.24, h * 0.10);

    // Taillights (full width slit)
    g.fillStyle(COLORS.NEON_MAGENTA, 1); g.fillRect(cx - w * 0.44 + lo, cy + h * 0.44, w * 0.88, 4);
    g.fillStyle(0xffffff, 0.7); g.fillRect(cx - w * 0.40 + lo, cy + h * 0.45, w * 0.80, 2);

    // Quad exhausts
    g.fillStyle(0x050510, 1);
    g.fillCircle(cx - w * 0.25 + lo, cy + h * 0.50, 4); g.fillCircle(cx - w * 0.15 + lo, cy + h * 0.50, 4);
    g.fillCircle(cx + w * 0.15 + lo, cy + h * 0.50, 4); g.fillCircle(cx + w * 0.25 + lo, cy + h * 0.50, 4);
    g.fillStyle(COLORS.NEON_ORANGE, boost ? 1 : 0.6);
    g.fillCircle(cx - w * 0.25 + lo, cy + h * 0.50, 2.5); g.fillCircle(cx - w * 0.15 + lo, cy + h * 0.50, 2.5);
    g.fillCircle(cx + w * 0.15 + lo, cy + h * 0.50, 2.5); g.fillCircle(cx + w * 0.25 + lo, cy + h * 0.50, 2.5);

    this.drawBoostFlame(g, cx, cy, lo, w, h, boost);
    g.setAlpha(1);
  }

  /** CAR 3 — VOID RUNNER: SUV — boxy, tall, wide, roof rails */
  private drawSUV(cx: number, cy: number, color: number): void {
    const g = this.gfx;
    g.clear();
    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 14) % 2 === 0;
    g.setAlpha(invincible ? 0.35 : 1);
    const lo = lean * CAR_W * 1.1;
    const w = CAR_W * 1.08, h = CAR_H * 1.20; // Taller and wider
    const tireColor = 0x090912;

    // Big all-terrain rear tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.57 + lo, cy + h * 0.05, w * 0.21, h * 0.44, 4);
    g.fillRoundedRect(cx + w * 0.36 + lo, cy + h * 0.05, w * 0.21, h * 0.44, 4);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.57 + lo, cy + h * 0.05, w * 0.21, h * 0.44, 4);
    g.strokeRoundedRect(cx + w * 0.36 + lo, cy + h * 0.05, w * 0.21, h * 0.44, 4);
    const sp = Math.sin(this.wheelSpin) * 4;
    g.lineStyle(1.5, 0xffffff, 0.6);
    g.lineBetween(cx - w * 0.46 + lo - 5, cy + h * 0.27 + sp, cx - w * 0.46 + lo + 5, cy + h * 0.27 - sp);
    g.lineBetween(cx + w * 0.46 + lo - 5, cy + h * 0.27 + sp, cx + w * 0.46 + lo + 5, cy + h * 0.27 - sp);

    // Big front tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.52 + lo, cy - h * 0.44, w * 0.19, h * 0.38, 4);
    g.fillRoundedRect(cx + w * 0.33 + lo, cy - h * 0.44, w * 0.19, h * 0.38, 4);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.52 + lo, cy - h * 0.44, w * 0.19, h * 0.38, 4);
    g.strokeRoundedRect(cx + w * 0.33 + lo, cy - h * 0.44, w * 0.19, h * 0.38, 4);

    // Boxy SUV body (upright, flat roof)
    g.fillStyle(0x0d0d1a, 1);
    g.fillRoundedRect(cx - w * 0.43 + lo, cy - h * 0.58, w * 0.86, h * 1.04, 5);
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - w * 0.39 + lo, cy - h * 0.53, w * 0.78, h * 0.96, 4);
    g.lineStyle(2, 0xffffff, 0.4); g.strokeRoundedRect(cx - w * 0.39 + lo, cy - h * 0.53, w * 0.78, h * 0.96, 4);

    // Flat roof / dark panel
    g.fillStyle(0x0a0a16, 1);
    g.fillRoundedRect(cx - w * 0.35 + lo, cy - h * 0.52, w * 0.70, h * 0.50, 3);

    // Roof rails
    g.lineStyle(2, 0x335577, 1);
    g.lineBetween(cx - w * 0.30 + lo, cy - h * 0.52, cx - w * 0.30 + lo, cy - h * 0.52);
    g.fillStyle(0x445566, 1);
    g.fillRect(cx - w * 0.30 + lo, cy - h * 0.55, w * 0.60, h * 0.04);
    g.fillRect(cx - w * 0.30 + lo, cy - h * 0.64, w * 0.60, h * 0.04);
    g.lineStyle(1.5, 0x668899, 0.7);
    g.lineBetween(cx - w * 0.30 + lo, cy - h * 0.55, cx - w * 0.30 + lo, cy - h * 0.64);
    g.lineBetween(cx + w * 0.30 + lo, cy - h * 0.55, cx + w * 0.30 + lo, cy - h * 0.64);

    // Large windshield (tall, flat)
    g.fillStyle(0x020a14, 0.88);
    g.fillRoundedRect(cx - w * 0.30 + lo, cy - h * 0.48, w * 0.60, h * 0.28, 3);
    g.lineStyle(2, COLORS.NEON_CYAN, 0.75); g.strokeRoundedRect(cx - w * 0.30 + lo, cy - h * 0.48, w * 0.60, h * 0.28, 3);

    // Side windows (visible from top-down)
    g.fillStyle(0x041020, 0.8);
    g.fillRoundedRect(cx - w * 0.41 + lo, cy - h * 0.15, w * 0.08, h * 0.28, 2);
    g.fillRoundedRect(cx + w * 0.33 + lo, cy - h * 0.15, w * 0.08, h * 0.28, 2);
    g.lineStyle(1, COLORS.NEON_CYAN, 0.5);
    g.strokeRoundedRect(cx - w * 0.41 + lo, cy - h * 0.15, w * 0.08, h * 0.28, 2);
    g.strokeRoundedRect(cx + w * 0.33 + lo, cy - h * 0.15, w * 0.08, h * 0.28, 2);

    // Wide headlights
    const lc = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lc, 1);
    g.fillRect(cx - w * 0.36 + lo, cy - h * 0.55, w * 0.18, h * 0.08);
    g.fillRect(cx + w * 0.18 + lo, cy - h * 0.55, w * 0.18, h * 0.08);
    g.fillStyle(lc, 0.25);
    g.fillRect(cx - w * 0.37 + lo, cy - h * 0.57, w * 0.20, h * 0.12);
    g.fillRect(cx + w * 0.17 + lo, cy - h * 0.57, w * 0.20, h * 0.12);

    // Wide taillights + step bumper
    g.fillStyle(COLORS.NEON_MAGENTA, 1); g.fillRect(cx - w * 0.37 + lo, cy + h * 0.40, w * 0.74, 5);
    g.fillStyle(0xffffff, 0.7); g.fillRect(cx - w * 0.32 + lo, cy + h * 0.41, w * 0.64, 2);
    g.fillStyle(0x111122, 1); g.fillRect(cx - w * 0.37 + lo, cy + h * 0.43, w * 0.74, h * 0.06);

    // Dual center exhausts
    g.fillStyle(0x050510, 1);
    g.fillCircle(cx - w * 0.08 + lo, cy + h * 0.46, 4); g.fillCircle(cx + w * 0.08 + lo, cy + h * 0.46, 4);
    g.fillStyle(COLORS.NEON_ORANGE, boost ? 1 : 0.6);
    g.fillCircle(cx - w * 0.08 + lo, cy + h * 0.46, 2.5); g.fillCircle(cx + w * 0.08 + lo, cy + h * 0.46, 2.5);

    this.drawBoostFlame(g, cx, cy, lo, w, h, boost);
    g.setAlpha(1);
  }

  /** CAR 4 — AURORA: F1 Car — narrow nose, huge front wing, side pods, rear wing */
  private drawF1(cx: number, cy: number, color: number): void {
    const g = this.gfx;
    g.clear();
    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 14) % 2 === 0;
    g.setAlpha(invincible ? 0.35 : 1);
    const lo = lean * CAR_W * 1.1;
    const w = CAR_W * 0.90, h = CAR_H * 1.10;
    const tireColor = 0x080810;

    // F1 wide slick rear tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.68 + lo, cy + h * 0.12, w * 0.22, h * 0.40, 4);
    g.fillRoundedRect(cx + w * 0.46 + lo, cy + h * 0.12, w * 0.22, h * 0.40, 4);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.68 + lo, cy + h * 0.12, w * 0.22, h * 0.40, 4);
    g.strokeRoundedRect(cx + w * 0.46 + lo, cy + h * 0.12, w * 0.22, h * 0.40, 4);
    const sp = Math.sin(this.wheelSpin) * 4;
    g.lineStyle(1.5, 0xffffff, 0.7);
    g.lineBetween(cx - w * 0.57 + lo - 5, cy + h * 0.32 + sp, cx - w * 0.57 + lo + 5, cy + h * 0.32 - sp);
    g.lineBetween(cx + w * 0.57 + lo - 5, cy + h * 0.32 + sp, cx + w * 0.57 + lo + 5, cy + h * 0.32 - sp);

    // F1 front slick tires (wider than body)
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.70 + lo, cy - h * 0.46, w * 0.22, h * 0.34, 4);
    g.fillRoundedRect(cx + w * 0.48 + lo, cy - h * 0.46, w * 0.22, h * 0.34, 4);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w * 0.70 + lo, cy - h * 0.46, w * 0.22, h * 0.34, 4);
    g.strokeRoundedRect(cx + w * 0.48 + lo, cy - h * 0.46, w * 0.22, h * 0.34, 4);

    // Side pods (wide aero elements flanking narrow monocoque)
    g.fillStyle(color, 0.9);
    g.fillRoundedRect(cx - w * 0.62 + lo, cy - h * 0.20, w * 0.24, h * 0.52, 4);
    g.fillRoundedRect(cx + w * 0.38 + lo, cy - h * 0.20, w * 0.24, h * 0.52, 4);
    g.lineStyle(1.5, 0xffffff, 0.35); g.strokeRoundedRect(cx - w * 0.62 + lo, cy - h * 0.20, w * 0.24, h * 0.52, 4);
    g.lineStyle(1.5, 0xffffff, 0.35); g.strokeRoundedRect(cx + w * 0.38 + lo, cy - h * 0.20, w * 0.24, h * 0.52, 4);
    // Pod air inlets
    g.fillStyle(0x050510, 1);
    g.fillRoundedRect(cx - w * 0.60 + lo, cy - h * 0.16, w * 0.08, h * 0.22, 2);
    g.fillRoundedRect(cx + w * 0.52 + lo, cy - h * 0.16, w * 0.08, h * 0.22, 2);

    // Narrow central monocoque (very slim)
    g.fillStyle(0x0c0c1a, 1);
    g.fillRoundedRect(cx - w * 0.20 + lo, cy - h * 0.50, w * 0.40, h * 1.0, 4);
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - w * 0.17 + lo, cy - h * 0.46, w * 0.34, h * 0.92, 3);
    g.lineStyle(2, 0xffffff, 0.45); g.strokeRoundedRect(cx - w * 0.17 + lo, cy - h * 0.46, w * 0.34, h * 0.92, 3);

    // Pointed aerodynamic nose cone
    g.fillStyle(color, 1);
    g.beginPath(); g.moveTo(cx - w * 0.14 + lo, cy - h * 0.46); g.lineTo(cx + w * 0.14 + lo, cy - h * 0.46);
    g.lineTo(cx + w * 0.06 + lo, cy - h * 0.82); g.lineTo(cx - w * 0.06 + lo, cy - h * 0.82); g.closePath(); g.fillPath();
    g.lineStyle(1.5, 0xffffff, 0.5); g.strokePath();

    // MASSIVE front wing (defining F1 characteristic)
    g.fillStyle(0x0a0a16, 1);
    g.fillRoundedRect(cx - w * 0.80 + lo, cy - h * 0.70, w * 1.60, h * 0.10, 2);
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - w * 0.78 + lo, cy - h * 0.70, w * 1.56, h * 0.08, 2);
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(cx - w * 0.80 + lo, cy - h * 0.65, cx + w * 0.80 + lo, cy - h * 0.65);
    // Wing end plates
    g.fillStyle(color, 1);
    g.fillRect(cx - w * 0.80 + lo, cy - h * 0.76, w * 0.06, h * 0.16);
    g.fillRect(cx + w * 0.74 + lo, cy - h * 0.76, w * 0.06, h * 0.16);

    // Cockpit visor
    g.fillStyle(0x020a14, 0.95);
    g.beginPath(); g.moveTo(cx - w * 0.12 + lo, cy - h * 0.12); g.lineTo(cx + w * 0.12 + lo, cy - h * 0.12);
    g.lineTo(cx + w * 0.08 + lo, cy - h * 0.40); g.lineTo(cx - w * 0.08 + lo, cy - h * 0.40); g.closePath(); g.fillPath();
    g.lineStyle(2, COLORS.NEON_CYAN, 0.95); g.strokePath();
    // Halo safety bar
    g.lineStyle(2, 0x334455, 1);
    g.lineBetween(cx - w * 0.14 + lo, cy - h * 0.28, cx + w * 0.14 + lo, cy - h * 0.28);
    g.fillStyle(0x223344, 1);
    g.fillCircle(cx + lo, cy - h * 0.28, 3);

    // MASSIVE rear wing on stalks
    g.lineStyle(3, 0x223344, 1);
    g.lineBetween(cx - w * 0.16 + lo, cy + h * 0.40, cx - w * 0.16 + lo, cy + h * 0.58);
    g.lineBetween(cx + w * 0.16 + lo, cy + h * 0.40, cx + w * 0.16 + lo, cy + h * 0.58);
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - w * 0.55 + lo, cy + h * 0.55, w * 1.10, h * 0.12, 2);
    g.lineStyle(2.5, 0xffffff, 0.6);
    g.lineBetween(cx - w * 0.56 + lo, cy + h * 0.61, cx + w * 0.56 + lo, cy + h * 0.61);

    // LEDs / headlight strip
    const lc = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lc, 1); g.fillRect(cx - w * 0.12 + lo, cy - h * 0.80, w * 0.24, h * 0.04);
    g.fillStyle(lc, 0.3); g.fillRect(cx - w * 0.13 + lo, cy - h * 0.82, w * 0.26, h * 0.06);

    // Taillights
    g.fillStyle(COLORS.NEON_MAGENTA, 1); g.fillRect(cx - w * 0.16 + lo, cy + h * 0.40, w * 0.32, 4);
    g.fillStyle(0xffffff, 0.7); g.fillRect(cx - w * 0.12 + lo, cy + h * 0.41, w * 0.24, 2);

    // Single central exhaust (F1)
    g.fillStyle(0x050510, 1); g.fillCircle(cx + lo, cy + h * 0.44, 5);
    g.fillStyle(COLORS.NEON_ORANGE, boost ? 1 : 0.7); g.fillCircle(cx + lo, cy + h * 0.44, 3);

    this.drawBoostFlame(g, cx, cy, lo, w, h, boost);
    g.setAlpha(1);
  }

  /** Shared boost flame effect used by all car types */
  private drawBoostFlame(g: Phaser.GameObjects.Graphics, cx: number, cy: number, lo: number, w: number, h: number, boost: boolean): void {
    if (!boost) return;
    const t = this.flickerTimer;
    const flameH = 24 + Math.sin(t * 35) * 10;
    g.fillStyle(COLORS.NEON_YELLOW, 0.95);
    g.fillTriangle(cx - w * 0.18 + lo, cy + h * 0.46, cx + w * 0.18 + lo, cy + h * 0.46, cx + lo, cy + h * 0.46 + flameH);
    g.fillStyle(COLORS.NEON_ORANGE, 0.75);
    g.fillTriangle(cx - w * 0.10 + lo, cy + h * 0.46, cx + w * 0.10 + lo, cy + h * 0.46, cx + lo, cy + h * 0.46 + flameH * 1.4);
    g.fillStyle(0xffffff, 0.9);
    g.fillTriangle(cx - w * 0.06 + lo, cy + h * 0.46, cx + w * 0.06 + lo, cy + h * 0.46, cx + lo, cy + h * 0.46 + flameH * 0.5);
  }

  private drawShield(dt: number, cx: number, cy: number): void {
    const g = this.shieldGfx;
    g.clear();
    if (!this.player.shieldActive) return;

    this.shieldAngle += dt * 2;
    const r = 48;
    const pulseR = r + Math.sin(this.flickerTimer * 4) * 5;

    g.lineStyle(3, COLORS.NEON_CYAN, 0.85);
    g.strokeCircle(cx, cy, pulseR);
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokeCircle(cx, cy, pulseR + 4);

    const segCount = 6;
    for (let i = 0; i < segCount; i++) {
      const a = this.shieldAngle + (i / segCount) * Math.PI * 2;
      const x = cx + Math.cos(a) * (pulseR + 8);
      const y = cy + Math.sin(a) * (pulseR + 8);
      g.fillStyle(COLORS.NEON_CYAN, 0.9);
      g.fillCircle(x, y, 3.5);
    }
  }

  private drawChromatic(dt: number, cx: number, cy: number, color: number): void {
    const speed = this.player.speedFraction;
    const chromIntensity = Math.max(0, (speed - 0.8) / 0.2);

    if (chromIntensity < 0.01) {
      this.chromaR.setAlpha(0);
      this.chromaB.setAlpha(0);
      return;
    }

    const offset = chromIntensity * 5;
    const alpha = chromIntensity * 0.15;

    this.chromaR.clear();
    this.chromaR.setAlpha(alpha);
    this.chromaR.fillStyle(0xff0000, 0.7);
    this.chromaR.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.chromaR.setBlendMode(Phaser.BlendModes.ADD);

    this.chromaB.clear();
    this.chromaB.setAlpha(alpha);
    this.chromaB.fillStyle(0x0000ff, 0.7);
    this.chromaB.fillRect(offset * 2, 0, GAME_WIDTH, GAME_HEIGHT);
    this.chromaB.setBlendMode(Phaser.BlendModes.ADD);
  }

  getCarX(): number { return this.lastX; }
  getCarY(): number { return this.lastY; }

  destroy(): void {
    this.gfx.destroy();
    this.trailGfx.destroy();
    this.glowGfx.destroy();
    this.shieldGfx.destroy();
    this.chromaR.destroy();
    this.chromaB.destroy();
    this.speedLineGfx.destroy();
  }
}

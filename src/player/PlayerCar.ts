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
    const rawRoadY = roadRenderer.getPlayerScreenY(3);

    // 1:1 Immediate horizontal response — 0ms steering latency
    const carX = rawRoadX;

    this.roadRumbleTimer += dt * (15 + speedFrac * 35);
    const asphaltRumble = (Math.sin(this.roadRumbleTimer * 2.8) * 0.8 + Math.cos(this.roadRumbleTimer * 4.2) * 0.4) * speedFrac;
    
    const pitchOffset = (this.player.isBoostActive ? 2.5 : speedFrac * 1.5);
    const targetCarY = Math.min(rawRoadY - CAR_H * 0.35 + asphaltRumble + pitchOffset, GAME_HEIGHT - 60);
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
    const g = this.gfx;
    g.clear();

    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 14) % 2 === 0;

    if (invincible) {
      g.setAlpha(0.35);
    } else {
      g.setAlpha(1);
    }

    const leanOffset = lean * CAR_W * 1.1;
    const w = CAR_W;
    const h = CAR_H;

    // ---- 1. Wide Rubber Tires with Neon Rims ----
    const tireColor = 0x0a0a14;
    const rimColor = color;
    
    // Rear Tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.54 + leanOffset, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    g.fillRoundedRect(cx + w * 0.35 + leanOffset, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    g.lineStyle(1.5, rimColor, 0.9);
    g.strokeRoundedRect(cx - w * 0.54 + leanOffset, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    g.strokeRoundedRect(cx + w * 0.35 + leanOffset, cy + h * 0.12, w * 0.19, h * 0.38, 4);
    
    const spokeOffset = Math.sin(this.wheelSpin) * 4;
    g.lineStyle(1, 0xffffff, 0.7);
    g.lineBetween(cx - w * 0.44 + leanOffset - 4, cy + h * 0.31 + spokeOffset, cx - w * 0.44 + leanOffset + 4, cy + h * 0.31 - spokeOffset);
    g.lineBetween(cx + w * 0.44 + leanOffset - 4, cy + h * 0.31 + spokeOffset, cx + w * 0.44 + leanOffset + 4, cy + h * 0.31 - spokeOffset);

    // Front Tires
    g.fillStyle(tireColor, 1);
    g.fillRoundedRect(cx - w * 0.46 + leanOffset, cy - h * 0.36, w * 0.14, h * 0.32, 3);
    g.fillRoundedRect(cx + w * 0.32 + leanOffset, cy - h * 0.36, w * 0.14, h * 0.32, 3);
    g.lineStyle(1, rimColor, 0.7);
    g.strokeRoundedRect(cx - w * 0.46 + leanOffset, cy - h * 0.36, w * 0.14, h * 0.32, 3);
    g.strokeRoundedRect(cx + w * 0.32 + leanOffset, cy - h * 0.36, w * 0.14, h * 0.32, 3);

    // ---- 2. Zero-Allocation Direct Path Car Body ----
    g.fillStyle(0x0e0e1a, 1);
    g.beginPath();
    g.moveTo(cx - w * 0.46 + leanOffset, cy - h * 0.3);
    g.lineTo(cx + w * 0.46 + leanOffset, cy - h * 0.3);
    g.lineTo(cx + w * 0.44 + leanOffset, cy + h * 0.42);
    g.lineTo(cx - w * 0.44 + leanOffset, cy + h * 0.42);
    g.closePath();
    g.fillPath();

    // Body Paint Layer
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(cx - w * 0.42 + leanOffset, cy - h * 0.12);
    g.lineTo(cx + w * 0.42 + leanOffset, cy - h * 0.12);
    g.lineTo(cx + w * 0.38 + leanOffset, cy + h * 0.42);
    g.lineTo(cx - w * 0.38 + leanOffset, cy + h * 0.42);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0xffffff, 0.45);
    g.strokePath();

    // Hood / Front Nose
    g.fillStyle(color, 0.9);
    g.beginPath();
    g.moveTo(cx - w * 0.32 + leanOffset, cy - h * 0.12);
    g.lineTo(cx + w * 0.32 + leanOffset, cy - h * 0.12);
    g.lineTo(cx + w * 0.24 + leanOffset, cy - h * 0.48);
    g.lineTo(cx - w * 0.24 + leanOffset, cy - h * 0.48);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0xffffff, 0.6);
    g.strokePath();

    // Windshield & Canopy
    g.fillStyle(0x020a14, 0.92);
    g.beginPath();
    g.moveTo(cx - w * 0.25 + leanOffset, cy - h * 0.10);
    g.lineTo(cx + w * 0.25 + leanOffset, cy - h * 0.10);
    g.lineTo(cx + w * 0.18 + leanOffset, cy - h * 0.40);
    g.lineTo(cx - w * 0.18 + leanOffset, cy - h * 0.40);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, COLORS.NEON_CYAN, 0.85);
    g.strokePath();

    // Center Racing Stripe
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(cx - w * 0.04 + leanOffset, cy - h * 0.46, w * 0.08, h * 0.84);

    // ---- 3. GT Wing Spoiler ----
    g.fillStyle(0x050510, 1);
    g.fillRoundedRect(cx - w * 0.46 + leanOffset, cy + h * 0.34, w * 0.92, h * 0.10, 2);
    g.lineStyle(2.5, color, 1.0);
    g.lineBetween(cx - w * 0.47 + leanOffset, cy + h * 0.34, cx + w * 0.47 + leanOffset, cy + h * 0.34);

    // ---- 4. Headlights & Beams ----
    const lightColor = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lightColor, 1);
    g.fillCircle(cx - w * 0.26 + leanOffset, cy - h * 0.46, 5);
    g.fillCircle(cx + w * 0.26 + leanOffset, cy - h * 0.46, 5);
    g.fillStyle(lightColor, 0.4);
    g.fillCircle(cx - w * 0.26 + leanOffset, cy - h * 0.46, 10);
    g.fillCircle(cx + w * 0.26 + leanOffset, cy - h * 0.46, 10);

    g.fillStyle(lightColor, 0.08);
    g.fillTriangle(
      cx - w * 0.26 + leanOffset, cy - h * 0.46,
      cx - w * 0.60 + leanOffset, cy - h * 1.6,
      cx - w * 0.05 + leanOffset, cy - h * 1.6,
    );
    g.fillTriangle(
      cx + w * 0.26 + leanOffset, cy - h * 0.46,
      cx + w * 0.05 + leanOffset, cy - h * 1.6,
      cx + w * 0.60 + leanOffset, cy - h * 1.6,
    );

    // ---- 5. Taillights & Exhaust ----
    const tailColor = COLORS.NEON_MAGENTA;
    g.fillStyle(tailColor, 1);
    g.fillRect(cx - w * 0.40 + leanOffset, cy + h * 0.38, w * 0.80, 5);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(cx - w * 0.35 + leanOffset, cy + h * 0.39, w * 0.70, 2);

    g.fillStyle(0x050510, 1);
    g.fillRect(cx - w * 0.24 + leanOffset, cy + h * 0.42, w * 0.48, h * 0.08);
    g.fillStyle(COLORS.NEON_ORANGE, boost ? 1 : 0.6);
    g.fillCircle(cx - w * 0.12 + leanOffset, cy + h * 0.45, 3.5);
    g.fillCircle(cx + w * 0.12 + leanOffset, cy + h * 0.45, 3.5);

    if (boost) {
      const t = this.flickerTimer;
      const flameH = 24 + Math.sin(t * 35) * 10;
      g.fillStyle(COLORS.NEON_YELLOW, 0.95);
      g.fillTriangle(
        cx - w * 0.18 + leanOffset, cy + h * 0.46,
        cx + w * 0.18 + leanOffset, cy + h * 0.46,
        cx + leanOffset, cy + h * 0.46 + flameH,
      );
      g.fillStyle(COLORS.NEON_ORANGE, 0.75);
      g.fillTriangle(
        cx - w * 0.10 + leanOffset, cy + h * 0.46,
        cx + w * 0.10 + leanOffset, cy + h * 0.46,
        cx + leanOffset, cy + h * 0.46 + flameH * 1.4,
      );
      g.fillStyle(0xffffff, 0.9);
      g.fillTriangle(
        cx - w * 0.06 + leanOffset, cy + h * 0.46,
        cx + w * 0.06 + leanOffset, cy + h * 0.46,
        cx + leanOffset, cy + h * 0.46 + flameH * 0.5,
      );
    }

    g.setAlpha(1);
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

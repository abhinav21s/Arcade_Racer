// ============================================================
// NEON ARCADE RACER — Player Car Visual Representation
// ============================================================

import Phaser from 'phaser';
import type { Player } from './Player';
import { CAR_SKINS, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { lerp } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

const PLAYER_Y = GAME_HEIGHT * 0.76;  // Car Y on screen (fixed)
const CAR_W = 64;
const CAR_H = 32;

export class PlayerCar {
  private scene:   Phaser.Scene;
  private player:  Player;
  private gfx:     Phaser.GameObjects.Graphics;   // Car body
  private trailGfx:Phaser.GameObjects.Graphics;   // Neon trail
  private glowGfx: Phaser.GameObjects.Graphics;   // Glow layer (below car)
  private trailPoints: Array<{ x: number; y: number; age: number }> = [];
  private maxTrailPoints = 30;

  // Shield visual
  private shieldGfx: Phaser.GameObjects.Graphics;
  private shieldAngle = 0;

  // Chromatic aberration overlays
  private chromaR: Phaser.GameObjects.Graphics;
  private chromaB: Phaser.GameObjects.Graphics;

  // Speed line graphics
  private speedLineGfx: Phaser.GameObjects.Graphics;

  private lastX = GAME_WIDTH / 2;
  private flickerTimer = 0;

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene  = scene;
    this.player = player;

    // Rendering order (depth): trail → glow → car → shield → chromatic
    this.trailGfx    = scene.add.graphics().setDepth(10);
    this.speedLineGfx= scene.add.graphics().setDepth(11);
    this.glowGfx     = scene.add.graphics().setDepth(12);
    this.gfx         = scene.add.graphics().setDepth(13);
    this.shieldGfx   = scene.add.graphics().setDepth(14);
    this.chromaR     = scene.add.graphics().setDepth(50).setAlpha(0);
    this.chromaB     = scene.add.graphics().setDepth(50).setAlpha(0);
  }

  update(dt: number, roadRenderer: { getPlayerScreenX: (lat: number, d: number) => number }): void {
    const skin = CAR_SKINS[this.player.skinIndex] ?? CAR_SKINS[0];
    const carX = roadRenderer.getPlayerScreenX(this.player.lateralPos, 2);
    const carY = PLAYER_Y;

    // ---- Trail ----
    this.updateTrail(dt, carX, carY, skin.trailColor);

    // ---- Speed lines ----
    this.drawSpeedLines(dt);

    // ---- Glow under car ----
    this.drawGlow(carX, carY, skin.carColor);

    // ---- Car body ----
    this.drawCar(carX, carY, skin.carColor);

    // ---- Shield ----
    this.drawShield(dt, carX, carY);

    // ---- Chromatic aberration ----
    this.drawChromatic(dt, carX, carY, skin.carColor);

    this.lastX = carX;
    this.flickerTimer += dt;
  }

  private updateTrail(dt: number, x: number, y: number, trailColor: number): void {
    const g = this.trailGfx;
    const isDrifting = this.player.isDrifting;
    const isBoost = this.player.isBoostActive;

    // Add new trail point
    if (this.player.speed > 30) {
      this.trailPoints.unshift({ x, y: y + 8, age: 0 });
    }

    // Age and cull
    for (const p of this.trailPoints) p.age += dt;
    const maxAge = isDrifting ? 0.6 : isBoost ? 0.4 : 0.25;
    this.trailPoints = this.trailPoints.filter(p => p.age < maxAge).slice(0, this.maxTrailPoints);

    g.clear();
    if (this.trailPoints.length < 2) return;

    // Draw trail segments with fading alpha
    for (let i = 0; i < this.trailPoints.length - 1; i++) {
      const p0 = this.trailPoints[i];
      const p1 = this.trailPoints[i + 1];
      const t = 1 - (p0.age / maxAge);
      const alpha = t * (isDrifting ? 0.9 : 0.55);
      const width = lerp(isDrifting ? 12 : 6, 1, p0.age / maxAge);

      const color = isDrifting
        ? (i % 2 === 0 ? COLORS.NEON_MAGENTA : COLORS.NEON_CYAN)
        : trailColor;

      g.lineStyle(width, color, alpha);
      g.lineBetween(p0.x, p0.y, p1.x, p1.y);

      // Inner bright core
      if (alpha > 0.3) {
        g.lineStyle(Math.max(1, width * 0.3), 0xffffff, alpha * 0.5);
        g.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
    }
  }

  private drawSpeedLines(dt: number): void {
    const g = this.speedLineGfx;
    g.clear();

    const speed = this.player.speedFraction;
    const intensity = Math.max(0, (speed - 0.55) / 0.45);
    if (intensity < 0.01) return;

    const cx = GAME_WIDTH  / 2;
    const cy = GAME_HEIGHT / 2;
    const lineCount = 18;
    const alpha = intensity * 0.45;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + this.flickerTimer * 0.3;
      const startR = 40 + (Math.sin(this.flickerTimer * 2 + i) * 0.5 + 0.5) * 80;
      const endR = startR + 100 + intensity * 180;
      const x1 = cx + Math.cos(angle) * startR;
      const y1 = cy + Math.sin(angle) * startR;
      const x2 = cx + Math.cos(angle) * endR;
      const y2 = cy + Math.sin(angle) * endR;
      const lineColor = i % 3 === 0 ? COLORS.NEON_CYAN : (i % 3 === 1 ? COLORS.NEON_MAGENTA : 0x6633ff);
      g.lineStyle(1, lineColor, alpha);
      g.lineBetween(x1, y1, x2, y2);
    }
  }

  private drawGlow(cx: number, cy: number, color: number): void {
    const g = this.glowGfx;
    g.clear();
    const boost = this.player.isBoostActive;
    const radius = boost ? 55 : 35;
    const alpha  = boost ? 0.35 : 0.18;

    // Outer glow blob
    g.fillStyle(color, alpha * 0.4);
    g.fillEllipse(cx, cy + 10, radius * 2.5, radius * 0.7);
    g.fillStyle(color, alpha);
    g.fillEllipse(cx, cy + 10, radius * 1.5, radius * 0.45);
  }

  private drawCar(cx: number, cy: number, color: number): void {
    const g = this.gfx;
    g.clear();

    const lean = this.player.driftAngle;
    const boost = this.player.isBoostActive;
    const invincible = this.player.invincible && Math.floor(this.flickerTimer * 12) % 2 === 0;

    if (invincible) {
      // Flicker when invincible
      g.setAlpha(0.4);
    } else {
      g.setAlpha(1);
    }

    // Lean transformation via translation
    const leanOffset = lean * CAR_W * 1.2;

    const w = CAR_W;
    const h = CAR_H;

    // ---- Car body (stylized top-down view) ----
    // Shadow
    g.fillStyle(0x000000, 0.5);
    g.fillEllipse(cx + leanOffset * 0.3, cy + h * 0.6, w * 1.2, h * 0.4);

    // Main body
    g.fillStyle(color, 1);
    const bodyPts = [
      { x: cx - w * 0.45 + leanOffset, y: cy - h * 0.1 },
      { x: cx + w * 0.45 + leanOffset, y: cy - h * 0.1 },
      { x: cx + w * 0.38 + leanOffset, y: cy + h * 0.45 },
      { x: cx - w * 0.38 + leanOffset, y: cy + h * 0.45 },
    ];
    g.fillPoints(bodyPts, true);

    // Hood (front, slimmer)
    g.fillStyle(color, 0.8);
    const hoodPts = [
      { x: cx - w * 0.3 + leanOffset, y: cy - h * 0.1 },
      { x: cx + w * 0.3 + leanOffset, y: cy - h * 0.1 },
      { x: cx + w * 0.22 + leanOffset, y: cy - h * 0.5 },
      { x: cx - w * 0.22 + leanOffset, y: cy - h * 0.5 },
    ];
    g.fillPoints(hoodPts, true);

    // Windshield (dark)
    g.fillStyle(0x001122, 0.85);
    const windPts = [
      { x: cx - w * 0.24 + leanOffset, y: cy - h * 0.12 },
      { x: cx + w * 0.24 + leanOffset, y: cy - h * 0.12 },
      { x: cx + w * 0.18 + leanOffset, y: cy - h * 0.42 },
      { x: cx - w * 0.18 + leanOffset, y: cy - h * 0.42 },
    ];
    g.fillPoints(windPts, true);

    // Headlights (neon glow)
    const lightColor = boost ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    g.fillStyle(lightColor, 1);
    g.fillCircle(cx - w * 0.3 + leanOffset, cy - h * 0.45, 5);
    g.fillCircle(cx + w * 0.3 + leanOffset, cy - h * 0.45, 5);
    g.fillStyle(lightColor, 0.4);
    g.fillCircle(cx - w * 0.3 + leanOffset, cy - h * 0.45, 9);
    g.fillCircle(cx + w * 0.3 + leanOffset, cy - h * 0.45, 9);

    // Tail lights
    const tailColor = COLORS.NEON_MAGENTA;
    g.fillStyle(tailColor, 1);
    g.fillRect(cx - w * 0.4 + leanOffset, cy + h * 0.35, 10, 5);
    g.fillRect(cx + w * 0.28 + leanOffset, cy + h * 0.35, 10, 5);

    // Neon side strips
    g.lineStyle(2, color, 0.9);
    g.lineBetween(cx - w * 0.44 + leanOffset, cy, cx - w * 0.38 + leanOffset, cy + h * 0.42);
    g.lineBetween(cx + w * 0.44 + leanOffset, cy, cx + w * 0.38 + leanOffset, cy + h * 0.42);

    // Boost exhaust flames
    if (boost) {
      const t = this.flickerTimer;
      const flameH = 20 + Math.sin(t * 30) * 8;
      g.fillStyle(COLORS.NEON_YELLOW, 0.9);
      g.fillTriangle(
        cx - w * 0.18 + leanOffset, cy + h * 0.45,
        cx + w * 0.18 + leanOffset, cy + h * 0.45,
        cx + leanOffset, cy + h * 0.45 + flameH,
      );
      g.fillStyle(COLORS.NEON_ORANGE, 0.7);
      g.fillTriangle(
        cx - w * 0.1 + leanOffset, cy + h * 0.45,
        cx + w * 0.1 + leanOffset, cy + h * 0.45,
        cx + leanOffset, cy + h * 0.45 + flameH * 1.3,
      );
    }

    g.setAlpha(1);
  }

  private drawShield(dt: number, cx: number, cy: number): void {
    const g = this.shieldGfx;
    g.clear();
    if (!this.player.shieldActive) return;

    this.shieldAngle += dt * 2;
    const r = 45;
    const pulseR = r + Math.sin(this.flickerTimer * 4) * 5;

    // Rotating arc
    g.lineStyle(3, COLORS.NEON_CYAN, 0.8);
    g.strokeCircle(cx, cy, pulseR);
    g.lineStyle(1, 0xffffff, 0.4);
    g.strokeCircle(cx, cy, pulseR + 4);

    // Arc segments
    const segCount = 6;
    for (let i = 0; i < segCount; i++) {
      const a = this.shieldAngle + (i / segCount) * Math.PI * 2;
      const x = cx + Math.cos(a) * (pulseR + 8);
      const y = cy + Math.sin(a) * (pulseR + 8);
      g.fillStyle(COLORS.NEON_CYAN, 0.9);
      g.fillCircle(x, y, 3);
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

    // Red channel offset left
    this.chromaR.clear();
    this.chromaR.setAlpha(alpha);
    this.chromaR.fillStyle(0xff0000, 0.7);
    this.chromaR.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.chromaR.setBlendMode(Phaser.BlendModes.ADD);

    // Blue channel offset right
    this.chromaB.clear();
    this.chromaB.setAlpha(alpha);
    this.chromaB.fillStyle(0x0000ff, 0.7);
    this.chromaB.fillRect(offset * 2, 0, GAME_WIDTH, GAME_HEIGHT);
    this.chromaB.setBlendMode(Phaser.BlendModes.ADD);
  }

  getCarX(): number { return this.lastX; }
  getCarY(): number { return PLAYER_Y; }

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

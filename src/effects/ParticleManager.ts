// ============================================================
// NEON ARCADE RACER — Particle Manager
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { lerp, clamp } from '../utils/Math';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  alpha: number;
  active: boolean;
}

const MAX_PARTICLES = 400;

export class ParticleManager {
  private scene: Phaser.Scene;
  private gfx:   Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];

  // Crash flash overlay
  private flashGfx: Phaser.GameObjects.Graphics;
  private flashAlpha = 0;
  private flashColor = 0xff0000;

  // Near-miss vignette
  private vignetteGfx: Phaser.GameObjects.Graphics;
  private vignetteAlpha = 0;
  private vignetteColor = 0x00ffff;

  constructor(scene: Phaser.Scene) {
    this.scene   = scene;
    this.gfx     = scene.add.graphics().setDepth(20);
    this.flashGfx= scene.add.graphics().setDepth(55);
    this.vignetteGfx = scene.add.graphics().setDepth(54);

    // Pre-allocate particle pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 1,
        color: 0xffffff, alpha: 1, active: false,
      });
    }
  }

  private getParticle(): Particle | null {
    return this.particles.find(p => !p.active) ?? null;
  }

  private emit(
    x: number, y: number,
    vx: number, vy: number,
    life: number,
    size: number,
    color: number,
  ): void {
    const p = this.getParticle();
    if (!p) return;
    p.x = x; p.y = y;
    p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color;
    p.alpha = 1; p.active = true;
  }

  // ---- Public spawn methods ----

  spawnDriftSparks(cx: number, cy: number, direction: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI + direction * Math.PI * 0.5 + (Math.random() - 0.5) * 1.0;
      const speed = 80 + Math.random() * 140;
      const color = i % 2 === 0 ? COLORS.NEON_MAGENTA : COLORS.NEON_CYAN;
      this.emit(
        cx + (Math.random() - 0.5) * 30,
        cy + (Math.random() - 0.5) * 10,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 20,
        0.4 + Math.random() * 0.4,
        2 + Math.random() * 4,
        color,
      );
    }
  }

  spawnBoostFlames(cx: number, cy: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const color = i % 3 === 0 ? COLORS.NEON_YELLOW : (i % 3 === 1 ? COLORS.NEON_ORANGE : 0xffffff);
      this.emit(
        cx + (Math.random() - 0.5) * 20,
        cy + 20 + Math.random() * 10,
        (Math.random() - 0.5) * 30,
        50 + Math.random() * 80,
        0.2 + Math.random() * 0.25,
        3 + Math.random() * 5,
        color,
      );
    }
  }

  spawnCrashDebris(cx: number, cy: number): void {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      const colors = [COLORS.NEON_MAGENTA, COLORS.NEON_CYAN, COLORS.NEON_ORANGE, 0xffffff];
      this.emit(
        cx + (Math.random() - 0.5) * 20,
        cy + (Math.random() - 0.5) * 10,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 60,
        0.6 + Math.random() * 0.8,
        2 + Math.random() * 6,
        colors[Math.floor(Math.random() * colors.length)],
      );
    }
    // Trigger red flash
    this.flashColor = 0xff0000;
    this.flashAlpha = 0.6;
  }

  spawnNearMissFlash(): void {
    this.vignetteColor = COLORS.NEON_CYAN;
    this.vignetteAlpha = 0.5;
  }

  spawnPowerUpCollect(cx: number, cy: number, color: number): void {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const speed = 60 + Math.random() * 100;
      this.emit(
        cx, cy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0.5 + Math.random() * 0.5,
        3 + Math.random() * 4,
        color,
      );
    }
  }

  spawnShockwave(cx: number, cy: number): void {
    this.flashColor = COLORS.NEON_YELLOW;
    this.flashAlpha = 0.4;
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 250;
      this.emit(
        cx + (Math.random() - 0.5) * 100,
        cy + (Math.random() - 0.5) * 40,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0.4 + Math.random() * 0.6,
        4 + Math.random() * 6,
        COLORS.NEON_YELLOW,
      );
    }
  }

  // ---- Update & Render ----

  update(dt: number, player: Player, carX: number, carY: number): void {
    // Continuous drift sparks
    if (player.isDrifting && player.speed > 60) {
      const dir = player.lateralPos > 0 ? -1 : 1;
      if (Math.random() < 0.6) {
        this.spawnDriftSparks(carX, carY + 12, dir, 3);
      }
    }

    // Continuous boost flames
    if (player.isBoostActive && Math.random() < 0.7) {
      this.spawnBoostFlames(carX, carY);
    }

    // Update all particles
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // Gravity
      p.vx *= Math.pow(0.92, dt * 60);
      p.alpha = clamp(p.life / p.maxLife, 0, 1);
    }

    // Decay overlays
    this.flashAlpha   = Math.max(0, this.flashAlpha   - dt * 3);
    this.vignetteAlpha= Math.max(0, this.vignetteAlpha- dt * 2.5);
  }

  render(): void {
    const g = this.gfx;
    g.clear();

    for (const p of this.particles) {
      if (!p.active || p.alpha < 0.01) continue;
      g.fillStyle(p.color, p.alpha);
      g.fillCircle(p.x, p.y, p.size * p.alpha);
    }

    // Flash overlay
    if (this.flashAlpha > 0.01) {
      this.flashGfx.clear();
      this.flashGfx.fillStyle(this.flashColor, this.flashAlpha);
      this.flashGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      this.flashGfx.clear();
    }

    // Near-miss vignette (edges only)
    if (this.vignetteAlpha > 0.01) {
      const vg = this.vignetteGfx;
      vg.clear();
      const a = this.vignetteAlpha;
      // Left edge
      vg.fillStyle(this.vignetteColor, a * 0.5);
      vg.fillRect(0, 0, 100, GAME_HEIGHT);
      // Right edge
      vg.fillRect(GAME_WIDTH - 100, 0, 100, GAME_HEIGHT);
      // Top
      vg.fillRect(0, 0, GAME_WIDTH, 60);
      // Bottom
      vg.fillRect(0, GAME_HEIGHT - 60, GAME_WIDTH, 60);
    } else {
      this.vignetteGfx.clear();
    }
  }

  get activeCount(): number {
    return this.particles.filter(p => p.active).length;
  }

  destroy(): void {
    this.gfx.destroy();
    this.flashGfx.destroy();
    this.vignetteGfx.destroy();
  }
}

// ============================================================
// NEON ARCADE RACER — Neon Trail (RenderTexture fade technique)
// ============================================================
// Note: The neon trail is now handled inside PlayerCar.ts
// This file provides a supplementary glow-ring trail effect
// that creates expanding rings behind the car at high speed.
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { lerp, clamp } from '../utils/Math';
import { CAR_SKINS } from '../constants';

interface RingData {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: number;
  active: boolean;
}

export class NeonTrail {
  private scene: Phaser.Scene;
  private player: Player;
  private gfx:    Phaser.GameObjects.Graphics;
  private rings:  RingData[] = [];

  private ringTimer = 0;
  private RING_INTERVAL = 0.08; // seconds between ring spawns

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene  = scene;
    this.player = player;
    this.gfx    = scene.add.graphics().setDepth(9);

    // Pre-allocate ring pool
    for (let i = 0; i < 20; i++) {
      this.rings.push({
        x: 0, y: 0,
        radius: 0, maxRadius: 60,
        life: 0, maxLife: 0.5,
        color: 0x00ffff, active: false,
      });
    }
  }

  update(dt: number, carX: number, carY: number): void {
    const speed = this.player.speedFraction;
    const skin  = CAR_SKINS[this.player.skinIndex] ?? CAR_SKINS[0];

    // Spawn rings during drift or boost
    const isDrifting = this.player.isDrifting;
    const isBoost    = this.player.isBoostActive;

    if ((isDrifting || isBoost) && speed > 0.4) {
      this.ringTimer += dt;
      if (this.ringTimer >= this.RING_INTERVAL) {
        this.ringTimer = 0;
        this.spawnRing(carX, carY + 10, isBoost ? 0xffaa00 : skin.trailColor);
      }
    } else {
      this.ringTimer = 0;
    }

    // Update rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { r.active = false; continue; }
      const t = 1 - (r.life / r.maxLife);
      r.radius = r.maxRadius * t;
    }
  }

  private spawnRing(x: number, y: number, color: number): void {
    const ring = this.rings.find(r => !r.active);
    if (!ring) return;
    ring.x = x;
    ring.y = y;
    ring.radius = 2;
    ring.maxRadius = this.player.isBoostActive ? 80 : 45;
    ring.life = ring.maxLife = this.player.isBoostActive ? 0.35 : 0.45;
    ring.color = color;
    ring.active = true;
  }

  render(): void {
    const g = this.gfx;
    g.clear();

    for (const r of this.rings) {
      if (!r.active) continue;
      const t     = 1 - (r.life / r.maxLife);
      const alpha = clamp((1 - t) * 1.2, 0, 0.8);
      const thick = Math.max(1, (1 - t) * 4);

      g.lineStyle(thick, r.color, alpha);
      g.strokeCircle(r.x, r.y, r.radius);

      // Inner bright ring
      g.lineStyle(Math.max(0.5, thick * 0.4), 0xffffff, alpha * 0.5);
      g.strokeCircle(r.x, r.y, r.radius * 0.6);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

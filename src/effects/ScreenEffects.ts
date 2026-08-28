// ============================================================
// NEON ARCADE RACER — Screen Effects (Shake, Slow-mo, Vignette)
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../constants';
import { lerp, clamp } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

export class ScreenEffects {
  private scene:    Phaser.Scene;
  private cam:      Phaser.Cameras.Scene2D.Camera;

  // Time slow overlay (desaturation effect sim)
  private slowGfx:  Phaser.GameObjects.Graphics;
  private slowAlpha = 0;

  // Overdrive flame edge
  private overdriveGfx: Phaser.GameObjects.Graphics;
  private overdriveAlpha = 0;

  // Vignette
  private vignetteGfx: Phaser.GameObjects.Graphics;

  private shakeQueued = false;
  private shakeIntensity = 0;
  private shakeDuration  = 0;

  private timer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene  = scene;
    this.cam    = scene.cameras.main;

    this.slowGfx      = scene.add.graphics().setDepth(52);
    this.overdriveGfx = scene.add.graphics().setDepth(53);
    this.vignetteGfx  = scene.add.graphics().setDepth(51);

    this.drawVignette();
  }

  private drawVignette(): void {
    // Static subtle vignette for atmosphere
    const g = this.vignetteGfx;
    g.clear();
    // Draw dark edges (soft gradient simulation via concentric ellipses)
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const alpha = (1 - t) * 0.25;
      const rx = GAME_WIDTH * (0.5 + t * 0.6);
      const ry = GAME_HEIGHT * (0.5 + t * 0.6);
      g.fillStyle(0x000000, alpha);
      g.fillRect(0, 0, GAME_WIDTH * (0.5 - rx / 2), GAME_HEIGHT);
      g.fillRect(GAME_WIDTH - GAME_WIDTH * (0.5 - rx / 2), 0, GAME_WIDTH * (0.5 - rx / 2), GAME_HEIGHT);
    }
  }

  /** Call on player crash */
  triggerCrashShake(): void {
    this.cam.shake(420, 0.026);
    this.cam.flash(110, 255, 70, 110, false);
  }

  /** Call on big boost start */
  triggerBoostShake(): void {
    this.cam.shake(150, 0.006);
  }

  /** Call on shockwave */
  triggerShockwaveShake(): void {
    this.cam.shake(400, 0.022);
  }

  /** Call on near-miss */
  triggerNearMissShake(): void {
    this.cam.shake(110, 0.007);
    this.cam.flash(55, 0, 220, 255, false);
  }

  update(dt: number, player: Player): void {
    this.timer += dt;

    // Time Slow overlay: dim + desaturate world
    const isTimeSlow = player.activePowerUp?.type === PowerUpType.TIME_SLOW;
    const targetSlowAlpha = isTimeSlow ? 0.35 : 0;
    this.slowAlpha = lerp(this.slowAlpha, targetSlowAlpha, dt * 5);

    this.slowGfx.clear();
    if (this.slowAlpha > 0.01) {
      // Blue-purple tint overlay for cyber matrix feel
      this.slowGfx.fillStyle(0x330066, this.slowAlpha * 0.4);
      this.slowGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Overdrive overlay: red-purple edge flames
    const isOverdrive = player.activePowerUp?.type === PowerUpType.OVERDRIVE;
    const targetOverdriveAlpha = isOverdrive ? 1 : 0;
    this.overdriveAlpha = lerp(this.overdriveAlpha, targetOverdriveAlpha, dt * 4);

    this.overdriveGfx.clear();
    if (this.overdriveAlpha > 0.01) {
      const pulse = Math.sin(this.timer * 8) * 0.3 + 0.7;
      const a = this.overdriveAlpha * pulse;

      // Edge glow - left
      this.overdriveGfx.fillStyle(0xff0044, a * 0.4);
      this.overdriveGfx.fillRect(0, 0, 80, GAME_HEIGHT);
      // Edge glow - right
      this.overdriveGfx.fillRect(GAME_WIDTH - 80, 0, 80, GAME_HEIGHT);
      // Edge glow - top
      this.overdriveGfx.fillRect(0, 0, GAME_WIDTH, 40);
      // Edge glow - bottom
      this.overdriveGfx.fillRect(0, GAME_HEIGHT - 40, GAME_WIDTH, 40);

      // Inner bright outline
      this.overdriveGfx.lineStyle(3, 0xff0044, a * 0.8);
      this.overdriveGfx.strokeRect(40, 20, GAME_WIDTH - 80, GAME_HEIGHT - 40);
    }
  }

  destroy(): void {
    this.slowGfx.destroy();
    this.overdriveGfx.destroy();
    this.vignetteGfx.destroy();
  }
}

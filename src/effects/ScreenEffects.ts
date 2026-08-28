// ============================================================
// NEON ARCADE RACER — Screen Effects (Shake, Overdrive, Vignette)
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../constants';
import { lerp } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

export class ScreenEffects {
  private scene:    Phaser.Scene;
  private cam:      Phaser.Cameras.Scene2D.Camera;

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

    this.overdriveGfx = scene.add.graphics().setDepth(53);
    this.vignetteGfx  = scene.add.graphics().setDepth(51);

    this.drawVignette();
  }

  private drawVignette(): void {
    const g = this.vignetteGfx;
    g.clear();
    // Soft dark vignette around screen edges
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const alpha = (1 - t) * 0.55;
      const margin = i * 18;
      g.lineStyle(22, 0x000000, alpha);
      g.strokeRect(margin, margin, GAME_WIDTH - margin * 2, GAME_HEIGHT - margin * 2);
    }
  }

  queueShake(intensity: number, duration: number): void {
    this.shakeQueued   = true;
    this.shakeIntensity = intensity;
    this.shakeDuration  = duration;
  }

  /** Call on boost activation (Nitro / Overdrive) */
  triggerBoostShake(): void {
    this.cam.shake(180, 0.009);
    this.cam.flash(70, 0, 240, 255, false);
  }

  /** Call on crash */
  triggerCrashShake(): void {
    this.cam.shake(380, 0.024);
    this.cam.flash(120, 255, 80, 20, false);
  }

  /** Call on near-miss */
  triggerNearMissShake(): void {
    this.cam.shake(90, 0.005);
    this.cam.flash(45, 0, 220, 255, false);
  }

  update(dt: number, player: Player): void {
    this.timer += dt;

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
    this.overdriveGfx.destroy();
    this.vignetteGfx.destroy();
  }
}

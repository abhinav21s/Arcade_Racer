// ============================================================
// NEON ARCADE RACER — Boot Scene (texture generation)
// ============================================================

import Phaser from 'phaser';
import { SCENE, TEX, COLORS, CAR_SKINS } from '../constants';
import { getUnlockedSkins, getSelectedSkin } from '../utils/SaveData';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE.BOOT });
  }

  preload(): void {
    // No external assets needed — all generated procedurally
  }

  create(): void {
    // Generate all textures programmatically
    this.generateParticleGlow();
    this.generateParticleSpark();

    // Start immediately
    this.scene.start(SCENE.MENU);
  }

  private generateParticleGlow(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    // Soft radial gradient circle (white center, transparent edge)
    for (let r = 16; r >= 0; r--) {
      const alpha = (1 - r / 16) * (1 - r / 16);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(16, 16, r);
    }
    g.generateTexture(TEX.PARTICLE_GLOW, 32, 32);
    g.destroy();
  }

  private generateParticleSpark(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(2, 0, 4, 8);
    g.fillRect(0, 2, 8, 4);
    g.generateTexture(TEX.PARTICLE_SPARK, 8, 8);
    g.destroy();
  }
}

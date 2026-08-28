// ============================================================
// NEON ARCADE RACER — HUD (Heads-Up Display)
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import type { ScoreSystem } from '../scoring/ScoreSystem';
import { POWERUP_CONFIGS, PowerUpType } from '../powerups/PowerUpTypes';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, PLAYER_MAX_SPEED } from '../constants';
import { clamp, lerp, formatNumber } from '../utils/Math';

export class HUD {
  private scene: Phaser.Scene;

  // Score
  private scoreTxt!:    Phaser.GameObjects.Text;
  private distanceTxt!: Phaser.GameObjects.Text;

  // Speed bar
  private speedBarBg!:   Phaser.GameObjects.Graphics;
  private speedBarFill!: Phaser.GameObjects.Graphics;
  private speedTxt!:     Phaser.GameObjects.Text;

  // Multiplier
  private multGfx!: Phaser.GameObjects.Graphics;
  private multTxt!: Phaser.GameObjects.Text;

  // Power-up indicator
  private puIconGfx!: Phaser.GameObjects.Graphics;
  private puLabel!:   Phaser.GameObjects.Text;
  private puBar!:     Phaser.GameObjects.Graphics;

  // Controls reminder
  private ctrlsTxt!: Phaser.GameObjects.Text;

  private timer = 0;
  private displayedScore = 0;  // Animated score counter

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildHUD();
  }

  private buildHUD(): void {
    const depth = 80;

    // ---- Glassmorphic Top-Left Panel (Score & Distance) ----
    const scorePanel = this.scene.add.graphics().setDepth(depth - 1);
    scorePanel.fillStyle(0x060818, 0.70);
    scorePanel.fillRoundedRect(12, 10, 220, 85, 8);
    scorePanel.lineStyle(1.5, COLORS.NEON_CYAN, 0.45);
    scorePanel.strokeRoundedRect(12, 10, 220, 85, 8);

    this.scene.add.text(26, 16, '⚡ SCORE', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '11px',
      color: '#00ccff',
      letterSpacing: 2,
    }).setDepth(depth);

    this.scoreTxt = this.scene.add.text(26, 30, '0', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '32px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setDepth(depth);

    this.distanceTxt = this.scene.add.text(26, 68, 'DIST: 0.00 km', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '15px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setDepth(depth);

    // ---- Glassmorphic Bottom-Center Panel (Speedometer) ----
    this.speedBarBg   = this.scene.add.graphics().setDepth(depth);
    this.speedBarFill = this.scene.add.graphics().setDepth(depth + 1);

    this.speedTxt = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 48, '0 km/h', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '24px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(depth + 2);

    // ---- Top-right: Multiplier Badge ----
    this.multGfx = this.scene.add.graphics().setDepth(depth);
    this.multTxt = this.scene.add.text(GAME_WIDTH - 28, 22, '×1', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '38px',
      color: '#ff00ff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(depth + 1);

    // ---- Glassmorphic Bottom-Left Panel (Power-up) ----
    this.puIconGfx = this.scene.add.graphics().setDepth(depth);
    this.puLabel   = this.scene.add.text(24, GAME_HEIGHT - 92, '', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setDepth(depth + 1);
    this.puBar = this.scene.add.graphics().setDepth(depth + 1);

    // ---- Bottom-right: Controls reminder ----
    this.ctrlsTxt = this.scene.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 18, 'W/↑ Accel  •  A/D Steer  •  SPC Drift  •  E Boost', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '13px',
      color: '#667799',
    }).setOrigin(1, 1).setDepth(depth);

    // Draw static speed bar background
    this.drawSpeedBarBg();
  }

  private drawSpeedBarBg(): void {
    const g  = this.speedBarBg;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 22;
    const w  = 340;
    const h  = 10;
    g.clear();
    // Glass backing
    g.fillStyle(0x060818, 0.85);
    g.fillRoundedRect(cx - w / 2 - 16, cy - 42, w + 32, 52, 10);
    g.lineStyle(1.5, 0x00ccff, 0.4);
    g.strokeRoundedRect(cx - w / 2 - 16, cy - 42, w + 32, 52, 10);

    // Track
    g.fillStyle(0x111124, 0.9);
    g.fillRoundedRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4, 4);
    g.lineStyle(1, 0x223355, 0.7);
    g.strokeRoundedRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4, 4);

    // Segment ticks
    for (let t = 1; t < 10; t++) {
      const tx = cx - w / 2 + (t / 10) * w;
      g.fillStyle(0x334466, 0.8);
      g.fillRect(tx - 0.5, cy - h / 2 - 4, 1, h + 8);
    }
  }

  update(dt: number, player: Player, score: ScoreSystem): void {
    this.timer += dt;

    // Animated score count
    this.displayedScore = lerp(this.displayedScore, score.score, Math.min(dt * 6, 1));

    // Score text
    this.scoreTxt.setText(formatNumber(this.displayedScore));
    this.distanceTxt.setText(`DIST: ${score.formattedDistance}`);

    // Score color pulse on multiplier > 2
    if (score.totalMultiplier >= 4) {
      const pulse = Math.sin(this.timer * 6) * 0.5 + 0.5;
      this.scoreTxt.setTint(Phaser.Display.Color.GetColor32(
        255, Math.floor(lerp(100, 255, pulse)), Math.floor(lerp(100, 255, 1 - pulse)), 255
      ));
    } else {
      this.scoreTxt.clearTint();
    }

    // Speed bar
    const speedFrac = clamp(player.speed / PLAYER_MAX_SPEED, 0, 1.55);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 22;
    const barW = 340;
    const barH = 10;

    const g = this.speedBarFill;
    g.clear();

    const speedColor = player.isBoostActive ? COLORS.NEON_YELLOW : (speedFrac > 0.85 ? 0x00ffff : COLORS.NEON_CYAN);
    const fillW = Math.max(0, Math.min(barW, barW * (speedFrac / 1.0)));

    // Neon Glow & Fill
    g.fillStyle(speedColor, 0.35);
    g.fillRoundedRect(cx - barW / 2, cy - barH / 2 - 3, fillW, barH + 6, 3);
    g.fillStyle(speedColor, 1);
    g.fillRoundedRect(cx - barW / 2, cy - barH / 2, fillW, barH, 3);
    // Bright white core
    g.fillStyle(0xffffff, 0.7);
    g.fillRoundedRect(cx - barW / 2, cy - barH / 2, fillW, barH * 0.45, 2);

    // Speed text (km/h — calibrated 0 to 280 km/h, 420 km/h on Nitro Boost)
    const baseKph = Math.round(Math.min(speedFrac, 1.0) * 280);
    const boostKph = player.isBoostActive ? Math.round(Math.min((player.speed - PLAYER_MAX_SPEED) / (PLAYER_MAX_SPEED * 0.5), 1) * 140) : 0;
    const kph = baseKph + Math.max(0, boostKph);
    this.speedTxt.setText(`${kph} KM/H`);
    this.speedTxt.setColor(player.isBoostActive ? '#ffee00' : '#00ffff');

    // Multiplier
    const mult = score.totalMultiplier;
    this.updateMultiplier(mult);

    // Power-up bar
    this.updatePowerUp(player);
  }

  private updateMultiplier(mult: number): void {
    const g = this.multGfx;
    g.clear();

    const x = GAME_WIDTH - 24;
    const y = 14;
    const multStr = `×${Math.floor(mult)}`;
    this.multTxt.setText(multStr);

    // Color gradient by multiplier value
    let color: string;
    let hexNum: number;
    if (mult >= 8)      { color = '#ffdd00'; hexNum = 0xffdd00; }
    else if (mult >= 6) { color = '#ff00ff'; hexNum = 0xff00ff; }
    else if (mult >= 4) { color = '#00ffff'; hexNum = 0x00ffff; }
    else if (mult >= 2) { color = '#00ff88'; hexNum = 0x00ff88; }
    else                { color = '#9977ff'; hexNum = 0x9977ff; }
    this.multTxt.setColor(color);

    // Glass backing badge
    const badgeW = 90;
    const badgeH = 55;
    g.fillStyle(0x060818, 0.70);
    g.fillRoundedRect(x - badgeW, y, badgeW, badgeH, 8);
    g.lineStyle(1.5, hexNum, mult >= 2 ? 0.85 : 0.35);
    g.strokeRoundedRect(x - badgeW, y, badgeW, badgeH, 8);

    // Glow pulse behind badge
    if (mult >= 2) {
      const pulse = Math.sin(this.timer * (4 + mult)) * 0.25 + 0.75;
      g.fillStyle(hexNum, 0.15 * pulse);
      g.fillCircle(x - badgeW / 2, y + badgeH / 2, 40);
    }
  }

  private updatePowerUp(player: Player): void {
    const g    = this.puIconGfx;
    const bar  = this.puBar;
    g.clear();
    bar.clear();

    const pu = player.activePowerUp;
    if (!pu) {
      this.puLabel.setText('');
      return;
    }

    const cfg     = POWERUP_CONFIGS[pu.type];
    const timeLeft= pu.timeLeft;
    const maxTime = pu.maxTime;
    const fraction= maxTime > 0 ? clamp(timeLeft / maxTime, 0, 1) : 1;

    // Glass panel
    const px = 14;
    const py = GAME_HEIGHT - 105;
    const pw = 200;
    const ph = 50;
    g.fillStyle(0x060818, 0.85);
    g.fillRoundedRect(px, py, pw, ph, 8);
    g.lineStyle(1.5, cfg.color, 0.7);
    g.strokeRoundedRect(px, py, pw, ph, 8);

    // Glowing Icon circle
    const ix = px + 24;
    const iy = py + 25;
    const pulse = Math.sin(this.timer * 6) * 0.3 + 0.7;

    g.fillStyle(cfg.color, 0.25 * pulse);
    g.fillCircle(ix, iy, 18);
    g.fillStyle(cfg.color, 1);
    g.fillCircle(ix, iy, 11);
    g.lineStyle(2, cfg.glowColor, 0.9);
    g.strokeCircle(ix, iy, 13);

    // Label + Remaining countdown
    const timeStr = maxTime < 900 ? ` (${timeLeft.toFixed(1)}s)` : ' (ACTIVE)';
    this.puLabel.setText(`${cfg.label}${timeStr}`);
    this.puLabel.setColor(`#${cfg.color.toString(16).padStart(6, '0')}`);
    this.puLabel.setPosition(px + 45, py + 10);

    // Timer progress bar
    if (maxTime < 900) {
      const bx = px + 45;
      const by = py + 30;
      const bw = 140;
      const bh = 6;
      bar.fillStyle(0x111124, 0.9);
      bar.fillRoundedRect(bx, by, bw, bh, 3);
      bar.fillStyle(cfg.color, 1);
      bar.fillRoundedRect(bx, by, bw * fraction, bh, 3);
      bar.fillStyle(0xffffff, 0.6);
      bar.fillRoundedRect(bx, by, bw * fraction, bh * 0.4, 2);
    }
  }

  /** Show celebratory floating banner when a new car is unlocked live in-game */
  showUnlockBanner(carName: string): void {
    const banner = this.scene.add.text(GAME_WIDTH / 2, 140, `🏆 NEW CAR UNLOCKED: ${carName.toUpperCase()}!`, {
      fontFamily: 'Orbitron, monospace',
      fontSize: '22px',
      color: '#ffdd00',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(95).setScale(0.5).setAlpha(0);

    this.scene.tweens.add({
      targets: banner,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 1,
      y: 130,
      duration: 350,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: banner,
          y: 100,
          alpha: 0,
          scaleX: 1.0,
          scaleY: 1.0,
          delay: 2400,
          duration: 600,
          ease: 'Power2',
          onComplete: () => banner.destroy(),
        });
      },
    });
  }

  /** Flash the score text for a near-miss or big event */
  flashScore(): void {
    this.scene.tweens.add({
      targets: this.scoreTxt,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 80,
      yoyo: true,
      ease: 'Power2',
    });
  }

  destroy(): void {
    this.scoreTxt.destroy();
    this.distanceTxt.destroy();
    this.speedBarBg.destroy();
    this.speedBarFill.destroy();
    this.speedTxt.destroy();
    this.multGfx.destroy();
    this.multTxt.destroy();
    this.puIconGfx.destroy();
    this.puLabel.destroy();
    this.puBar.destroy();
    this.ctrlsTxt.destroy();
  }
}

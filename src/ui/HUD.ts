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

    // ---- Top-left: Score & Distance ----
    this.scene.add.text(20, 14, 'SCORE', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '12px',
      color: '#00ccff',
      letterSpacing: 2,
    }).setDepth(depth);

    this.scoreTxt = this.scene.add.text(20, 28, '0', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setDepth(depth);

    this.distanceTxt = this.scene.add.text(20, 68, 'DIST: 0.00 km', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '15px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setDepth(depth);

    // ---- Bottom-center: Speed bar ----
    this.speedBarBg   = this.scene.add.graphics().setDepth(depth);
    this.speedBarFill = this.scene.add.graphics().setDepth(depth + 1);

    this.speedTxt = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 42, '0 km/h', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '22px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(depth + 2);

    // ---- Top-right: Multiplier ----
    this.multGfx = this.scene.add.graphics().setDepth(depth);
    this.multTxt = this.scene.add.text(GAME_WIDTH - 20, 18, '×1', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '40px',
      color: '#ff00ff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(depth + 1);

    // ---- Bottom-left: Power-up indicator ----
    this.puIconGfx = this.scene.add.graphics().setDepth(depth);
    this.puLabel   = this.scene.add.text(20, GAME_HEIGHT - 80, '', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setDepth(depth + 1);
    this.puBar = this.scene.add.graphics().setDepth(depth + 1);

    // ---- Bottom-right: Controls reminder ----
    this.ctrlsTxt = this.scene.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 20, 'W/↑ Accel  A/D Steer  SPC Drift  E Nitro', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '13px',
      color: '#444466',
    }).setOrigin(1, 1).setDepth(depth);

    // Draw static speed bar background
    this.drawSpeedBarBg();
  }

  private drawSpeedBarBg(): void {
    const g  = this.speedBarBg;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 22;
    const w  = 300;
    const h  = 8;
    g.clear();
    g.fillStyle(0x111122, 0.8);
    g.fillRoundedRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4, 4);
    g.lineStyle(1, 0x334466, 0.6);
    g.strokeRoundedRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4, 4);
  }

  update(dt: number, player: Player, score: ScoreSystem): void {
    this.timer += dt;

    // Animated score count
    this.displayedScore = lerp(this.displayedScore, score.score, Math.min(dt * 5, 1));

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
    const speedFrac = clamp(player.speed / PLAYER_MAX_SPEED, 0, 1);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 22;
    const barW = 300;
    const barH = 8;

    const g = this.speedBarFill;
    g.clear();

    const speedColor = player.isBoostActive ? COLORS.NEON_YELLOW : COLORS.NEON_CYAN;
    const fillW = Math.max(0, barW * speedFrac);

    // Glow
    g.fillStyle(speedColor, 0.2);
    g.fillRoundedRect(cx - barW / 2, cy - barH / 2 - 3, fillW, barH + 6, 3);
    // Fill
    g.fillStyle(speedColor, 1);
    g.fillRoundedRect(cx - barW / 2, cy - barH / 2, fillW, barH, 3);
    // Bright core
    g.fillStyle(0xffffff, 0.5);
    g.fillRoundedRect(cx - barW / 2, cy - barH / 2, fillW, barH / 2, 2);

    // Speed text (km/h — 0 to 280 km/h, 420 km/h on Nitro Boost)
    const baseKph = Math.round(speedFrac * 280);
    const boostKph = player.isBoostActive ? Math.round(Math.min((player.speed - PLAYER_MAX_SPEED) / (PLAYER_MAX_SPEED * 0.5), 1) * 140) : 0;
    const kph = baseKph + Math.max(0, boostKph);
    this.speedTxt.setText(`${kph} km/h`);
    this.speedTxt.setColor(player.isBoostActive ? '#ffff00' : '#00ffff');

    // Multiplier
    const mult = score.totalMultiplier;
    this.updateMultiplier(mult);

    // Power-up bar
    this.updatePowerUp(player);
  }

  private updateMultiplier(mult: number): void {
    const g = this.multGfx;
    g.clear();

    const x = GAME_WIDTH - 20;
    const y = 15;
    const multStr = `×${Math.floor(mult)}`;
    this.multTxt.setText(multStr);

    // Color gradient by multiplier value
    let color: string;
    if (mult >= 8)      color = '#ffdd00';
    else if (mult >= 6) color = '#ff00ff';
    else if (mult >= 4) color = '#00ffff';
    else if (mult >= 2) color = '#00ff88';
    else                color = '#9977ff';
    this.multTxt.setColor(color);

    // Glow behind text
    if (mult >= 2) {
      const hexNum = parseInt(color.slice(1), 16);
      const pulse  = Math.sin(performance.now() / 1000 * (2 + mult)) * 0.3 + 0.7;
      g.fillStyle(hexNum, 0.15 * pulse);
      g.fillCircle(x - this.multTxt.width / 2, y + 25, 35);
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

    // Icon circle
    const ix = 22;
    const iy = GAME_HEIGHT - 85;
    const pulse = Math.sin(this.timer * 4) * 0.3 + 0.7;

    g.fillStyle(cfg.color, 0.2 * pulse);
    g.fillCircle(ix, iy, 20);
    g.fillStyle(cfg.color, 0.9);
    g.fillCircle(ix, iy, 12);
    g.lineStyle(2, cfg.glowColor, pulse);
    g.strokeCircle(ix, iy, 15);

    // Label
    this.puLabel.setText(cfg.label);
    this.puLabel.setColor(`#${cfg.color.toString(16).padStart(6, '0')}`);
    this.puLabel.setPosition(45, GAME_HEIGHT - 95);

    // Timer bar (if duration-based)
    if (maxTime < 900) {
      const bx = 22;
      const by = GAME_HEIGHT - 68;
      const bw = 120;
      const bh = 4;
      bar.fillStyle(0x111122, 0.8);
      bar.fillRoundedRect(bx, by, bw, bh, 2);
      bar.fillStyle(cfg.color, 1);
      bar.fillRoundedRect(bx, by, bw * fraction, bh, 2);
      // Glow
      bar.fillStyle(cfg.glowColor, 0.3);
      bar.fillRoundedRect(bx, by - 1, bw * fraction, bh + 2, 2);
    } else {
      // Shield: show "ACTIVE" text
      this.puLabel.setText('SHIELD ACTIVE');
    }
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

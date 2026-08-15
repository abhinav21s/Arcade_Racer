// ============================================================
// NEON ARCADE RACER — Style Rank Display
// ============================================================

import Phaser from 'phaser';
import type { ScoreSystem } from '../scoring/ScoreSystem';
import { STYLE_RANKS, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { lerp } from '../utils/Math';

interface PopupEvent {
  text:  string;
  color: number;
  life:  number;
  maxLife: number;
  y:     number;
  scale: number;
}

export class StyleRank {
  private scene:    Phaser.Scene;
  private rankTxt:  Phaser.GameObjects.Text;
  private rankGfx:  Phaser.GameObjects.Graphics;

  // Floating popup events (near-miss, drift, combo!)
  private popups:   PopupEvent[] = [];
  private popupTxt: Phaser.GameObjects.Text;
  private popupGfx: Phaser.GameObjects.Graphics;

  private timer = 0;
  private lastRankLabel = '';
  private currentRankColor = 0x9977ff;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const depth = 78;

    this.rankGfx = scene.add.graphics().setDepth(depth);
    this.rankTxt = scene.add.text(GAME_WIDTH / 2, 90, '', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '28px',
      color: '#9977ff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(depth + 1).setAlpha(0);

    this.popupGfx = scene.add.graphics().setDepth(70);
    this.popupTxt = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '40px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(71).setAlpha(0);
  }

  update(dt: number, score: ScoreSystem): void {
    this.timer += dt;

    // Determine current rank
    const mult = score.totalMultiplier;
    let rankLabel = '';
    let rankColor = 0x9977ff;

    for (const rank of STYLE_RANKS) {
      if (mult >= rank.min) {
        rankLabel = rank.label;
        rankColor = rank.color;
        break;
      }
    }

    // Show/update rank text
    if (rankLabel && mult >= 2) {
      const pulse = Math.sin(this.timer * 4) * 0.15 + 0.85;
      this.rankTxt.setAlpha(pulse);
      this.rankTxt.setText(rankLabel);
      const hex = `#${rankColor.toString(16).padStart(6, '0')}`;
      this.rankTxt.setColor(hex);

      // Rank changed: pop animation
      if (rankLabel !== this.lastRankLabel) {
        this.scene.tweens.add({
          targets:  this.rankTxt,
          scaleX:   1.4,
          scaleY:   1.4,
          duration: 100,
          yoyo:     true,
          ease:     'Back.easeOut',
        });
        this.lastRankLabel = rankLabel;
        this.currentRankColor = rankColor;
      }
    } else {
      this.rankTxt.setAlpha(0);
      this.lastRankLabel = '';
    }

    // Update popups
    for (const p of this.popups) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.y -= dt * 55;
      p.scale = lerp(p.scale, 0, dt * 2);
    }
    this.popups = this.popups.filter(p => p.life > 0);
  }

  /** Show a floating popup for dramatic events */
  showPopup(text: string, color: number, x?: number, y?: number): void {
    this.popupTxt.setText(text);
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    this.popupTxt.setColor(hex);
    const px = x ?? GAME_WIDTH / 2;
    const py = y ?? GAME_HEIGHT * 0.45;
    this.popupTxt.setPosition(px, py);
    this.popupTxt.setScale(0.5);
    this.popupTxt.setAlpha(1);

    this.scene.tweens.add({
      targets:  this.popupTxt,
      scaleX:   1.2,
      scaleY:   1.2,
      y:        py - 60,
      alpha:    0,
      duration: 900,
      ease:     'Power2',
    });
  }

  showNearMiss(): void {
    this.showPopup('NEAR MISS!', 0x00ffff, GAME_WIDTH / 2, GAME_HEIGHT * 0.5);
  }

  showComboBreak(): void {
    this.showPopup('COMBO BREAK', 0xff4400, GAME_WIDTH / 2, GAME_HEIGHT * 0.5);
  }

  showDriftBonus(points: number): void {
    this.showPopup(`DRIFT +${Math.floor(points)}`, 0xff00ff, GAME_WIDTH / 2, GAME_HEIGHT * 0.55);
  }

  destroy(): void {
    this.rankGfx.destroy();
    this.rankTxt.destroy();
    this.popupGfx.destroy();
    this.popupTxt.destroy();
  }
}

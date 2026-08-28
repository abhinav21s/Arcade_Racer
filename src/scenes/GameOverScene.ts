// ============================================================
// NEON ARCADE RACER — Game Over Scene
// ============================================================

import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS, CAR_SKINS, KEYS } from '../constants';
import { getHighScores, isNewHighScore, checkAndUnlockSkins, getUnlockedSkins } from '../utils/SaveData';
import { CAR_SKINS as SKINS } from '../constants';
import { lerp } from '../utils/Math';

export class GameOverScene extends Phaser.Scene {
  private score    = 0;
  private distance = 0;
  private skinId   = 0;
  private bgGfx!:  Phaser.GameObjects.Graphics;
  private timer    = 0;

  constructor() {
    super({ key: SCENE.GAME_OVER });
  }

  init(data: { score: number; distance: number; skinId: number }): void {
    this.score    = data?.score    ?? 0;
    this.distance = data?.distance ?? 0;
    this.skinId   = data?.skinId   ?? 0;
    this.timer    = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(400, 0, 0, 0);
    this.buildBackground();
    this.buildContent();
    this.buildButtons();
  }

  private buildBackground(): void {
    this.bgGfx = this.add.graphics().setDepth(0);
    const g = this.bgGfx;

    // Dark overlay
    g.fillStyle(0x000000, 0.92);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Neon grid
    g.lineStyle(1, 0x330044, 0.4);
    for (let x = 0; x < GAME_WIDTH; x += 60) {
      g.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y < GAME_HEIGHT; y += 60) {
      g.lineBetween(0, y, GAME_WIDTH, y);
    }

    // Glow border
    g.lineStyle(3, COLORS.NEON_MAGENTA, 0.6);
    g.strokeRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40);
    g.lineStyle(1, COLORS.NEON_CYAN, 0.3);
    g.strokeRect(25, 25, GAME_WIDTH - 50, GAME_HEIGHT - 50);
  }

  private buildContent(): void {
    const cx = GAME_WIDTH / 2;

    // ---- GAME OVER text ----
    this.add.text(cx, 60, 'GAME OVER', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#ff0055',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, blur: 30, color: '#ff0055', fill: true },
    }).setOrigin(0.5, 0).setDepth(5);

    // ---- Score ----
    const isNewHS = isNewHighScore(this.score);
    const scoreColor = isNewHS ? '#ffdd00' : '#ffffff';
    const scoreLabel = isNewHS ? '★ NEW HIGH SCORE ★' : 'SCORE';

    this.add.text(cx, 158, scoreLabel, {
      fontFamily: 'Orbitron, monospace',
      fontSize: isNewHS ? '16px' : '14px',
      color: isNewHS ? '#ffdd00' : '#445566',
      letterSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(5);

    const scoreTxt = this.add.text(cx, 178, this.score.toLocaleString(), {
      fontFamily: 'Orbitron, monospace',
      fontSize: '52px',
      color: scoreColor,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(5);

    if (isNewHS) {
      this.tweens.add({
        targets: scoreTxt,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // ---- Stats ----
    this.add.text(cx, 248, `DISTANCE:  ${this.distance.toFixed(2)} km`, {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '22px',
      color: '#00ccff',
    }).setOrigin(0.5, 0).setDepth(5);

    // ---- Skin used ----
    const skin = SKINS.find(s => s.id === this.skinId) ?? SKINS[0];
    this.add.text(cx, 276, `CAR:  ${skin.name}`, {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '17px',
      color: `#${skin.carColor.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5, 0).setDepth(5);

    // ---- High scores ----
    this.buildHighScoreList(cx, 320);

    // ---- Newly unlocked skins ----
    const newSkins = checkAndUnlockSkins(this.score);
    if (newSkins.length > 0) {
      const newSkinNames = newSkins.map(id => SKINS.find(s => s.id === id)?.name ?? 'Unknown').join(', ');
      
      const badgeGfx = this.add.graphics().setDepth(4);
      badgeGfx.fillStyle(0x060818, 0.9);
      badgeGfx.fillRoundedRect(cx - 200, 568, 400, 44, 8);
      badgeGfx.lineStyle(2, 0xffdd00, 0.85);
      badgeGfx.strokeRoundedRect(cx - 200, 568, 400, 44, 8);

      const unlockTxt = this.add.text(cx, 578, `🏆 NEW CAR UNLOCKED: ${newSkinNames.toUpperCase()}!`, {
        fontFamily: 'Orbitron, monospace',
        fontSize: '15px',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(5);

      this.tweens.add({
        targets: [unlockTxt, badgeGfx],
        alpha: 0.45,
        duration: 450,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private buildHighScoreList(cx: number, startY: number): void {
    const scores = getHighScores();

    this.add.text(cx, startY, '— TOP SCORES —', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '12px',
      color: '#445566',
      letterSpacing: 5,
    }).setOrigin(0.5, 0).setDepth(5);

    const medals = ['🥇', '🥈', '🥉', '  4', '  5'];
    scores.slice(0, 5).forEach((entry, i) => {
      const isCurrent = entry.score === this.score;
      const color = isCurrent ? '#ffdd00' : (i === 0 ? '#cccccc' : '#445566');
      this.add.text(cx, startY + 24 + i * 22, `${medals[i]}  ${entry.score.toLocaleString().padStart(9)}   ${entry.distance} km`, {
        fontFamily: 'Rajdhani, monospace',
        fontSize: '18px',
        color,
      }).setOrigin(0.5, 0).setDepth(5);
    });
  }

  private buildButtons(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 60;

    // Restart button
    const restartTxt = this.add.text(cx - 120, cy, '[ PLAY AGAIN ]', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '18px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(8).setInteractive({ useHandCursor: true });

    restartTxt.on('pointerover', () => restartTxt.setColor('#ffffff'));
    restartTxt.on('pointerout',  () => restartTxt.setColor('#00ffff'));
    restartTxt.on('pointerdown', () => this.restart());

    // Menu button
    const menuTxt = this.add.text(cx + 120, cy, '[ MENU ]', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '18px',
      color: '#ff00ff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(8).setInteractive({ useHandCursor: true });

    menuTxt.on('pointerover', () => menuTxt.setColor('#ffffff'));
    menuTxt.on('pointerout',  () => menuTxt.setColor('#ff00ff'));
    menuTxt.on('pointerdown', () => this.goMenu());

    this.tweens.add({
      targets: [restartTxt, menuTxt],
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Keyboard shortcuts
    this.input.keyboard!.addKey(KEYS.ENTER).once('down', () => this.restart());
    this.input.keyboard!.addKey(KEYS.SPACE).once('down', () => this.restart());
    this.input.keyboard!.addKey(KEYS.ESC).once('down', () => this.goMenu());

    // Hint
    this.add.text(cx, cy + 30, 'ENTER / SPACE — Restart       ESC — Menu', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '13px',
      color: '#334455',
    }).setOrigin(0.5, 0).setDepth(8);
  }

  update(time: number, delta: number): void {
    this.timer += delta / 1000;
    // Animated grid drift
    if (this.bgGfx) {
      // Already static; no per-frame changes needed
    }
  }

  private restart(): void {
    this.scene.start(SCENE.GAME, { skinId: this.skinId });
  }

  private goMenu(): void {
    this.cameras.main.fade(300, 0, 0, 0);
    this.time.delayedCall(300, () => {
      this.scene.start(SCENE.MENU);
    });
  }
}

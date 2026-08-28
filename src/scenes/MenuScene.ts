// ============================================================
// NEON ARCADE RACER — Menu Scene
// ============================================================

import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS, CAR_SKINS, KEYS } from '../constants';
import { getHighScores, getUnlockedSkins, getSelectedSkin, setSelectedSkin } from '../utils/SaveData';
import { lerp } from '../utils/Math';

export class MenuScene extends Phaser.Scene {
  private bgGfx!:    Phaser.GameObjects.Graphics;
  private titleTxt!: Phaser.GameObjects.Text;
  private startTxt!: Phaser.GameObjects.Text;
  private startButtonGfx!: Phaser.GameObjects.Graphics;
  private hsTxt!:    Phaser.GameObjects.Text[];
  private skinGfxs!: Phaser.GameObjects.Graphics[];
  private skinTxts!: Phaser.GameObjects.Text[];
  private selectedSkinIdx = 0;
  private unlockedSkins:  number[] = [0];
  private enterKey!: Phaser.Input.Keyboard.Key;
  private leftKey!:  Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;

  private timer = 0;
  private animGfx!: Phaser.GameObjects.Graphics; // animated road preview
  private started = false;

  constructor() {
    super({ key: SCENE.MENU });
  }

  create(): void {
    this.started = false;
    this.unlockedSkins = getUnlockedSkins();
    this.selectedSkinIdx = this.unlockedSkins.indexOf(getSelectedSkin());
    if (this.selectedSkinIdx < 0) this.selectedSkinIdx = 0;

    this.buildBackground();
    this.buildTitle();
    this.buildSkinSelector();
    this.buildHighScores();
    this.buildStartPrompt();
    this.buildKeys();
  }

  private buildKeys(): void {
    const kb = this.input.keyboard!;
    this.enterKey = kb.addKey(KEYS.ENTER);
    this.leftKey  = kb.addKey(KEYS.LEFT);
    this.rightKey = kb.addKey(KEYS.RIGHT);
    kb.addKey(KEYS.SPACE).on('down', () => this.startGame());
    this.enterKey.on('down', () => this.startGame());
  }

  private buildBackground(): void {
    this.animGfx = this.add.graphics().setDepth(0);
    this.bgGfx   = this.add.graphics().setDepth(1);

    const g = this.bgGfx;
    // Sky gradient
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      const r = Math.round(lerp(0x05, 0x0d, t));
      const gr= Math.round(lerp(0x05, 0x00, t));
      const b = Math.round(lerp(0x10, 0x28, t));
      const color = (r << 16) | (gr << 8) | b;
      g.fillStyle(color, 1);
      g.fillRect(0, Math.floor(GAME_HEIGHT * t * 0.6), GAME_WIDTH, Math.ceil(GAME_HEIGHT * 0.6 / 29) + 1);
    }

    // Bottom dark fade
    g.fillStyle(0x000000, 0.7);
    g.fillRect(0, GAME_HEIGHT * 0.55, GAME_WIDTH, GAME_HEIGHT * 0.45);

    // Stars
    g.fillStyle(0xffffff, 0.7);
    for (let s = 0; s < 100; s++) {
      g.fillRect(
        Math.random() * GAME_WIDTH,
        Math.random() * GAME_HEIGHT * 0.55,
        Math.random() < 0.2 ? 2 : 1,
        Math.random() < 0.2 ? 2 : 1
      );
    }

    // Neon grid lines (perspective road preview)
    g.lineStyle(1, COLORS.NEON_PURPLE, 0.25);
    const vp = { x: GAME_WIDTH / 2, y: GAME_HEIGHT * 0.5 };
    for (let i = -8; i <= 8; i++) {
      const bx = GAME_WIDTH / 2 + i * 80;
      g.lineBetween(vp.x, vp.y, bx, GAME_HEIGHT + 20);
    }
    for (let j = 1; j <= 12; j++) {
      const t = j / 12;
      const y = vp.y + (GAME_HEIGHT - vp.y + 20) * t;
      const w = 640 * t;
      g.lineBetween(vp.x - w / 2, y, vp.x + w / 2, y);
    }
  }

  private buildTitle(): void {
    // Glow backing
    const gfx = this.add.graphics().setDepth(5);
    gfx.fillStyle(COLORS.NEON_MAGENTA, 0.08);
    gfx.fillRoundedRect(GAME_WIDTH / 2 - 360, 40, 720, 100, 12);

    this.add.text(GAME_WIDTH / 2, 50, 'NEON ARCADE', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '14px',
      color: '#00ccff',
      letterSpacing: 12,
    }).setOrigin(0.5, 0).setDepth(6);

    this.titleTxt = this.add.text(GAME_WIDTH / 2, 68, 'RACER', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '72px',
      fontStyle: 'bold',
      color: '#ff00ff',
      stroke: '#0000ff',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, blur: 20, color: '#ff00ff', fill: true },
    }).setOrigin(0.5, 0).setDepth(6);

    // Neon underline
    const ug = this.add.graphics().setDepth(6);
    ug.lineStyle(2, COLORS.NEON_CYAN, 0.8);
    ug.lineBetween(GAME_WIDTH / 2 - 200, 148, GAME_WIDTH / 2 + 200, 148);
    ug.lineStyle(1, COLORS.NEON_MAGENTA, 0.5);
    ug.lineBetween(GAME_WIDTH / 2 - 160, 152, GAME_WIDTH / 2 + 160, 152);
  }

  private buildSkinSelector(): void {
    this.add.text(GAME_WIDTH / 2, 168, 'SELECT YOUR RIDE', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '14px',
      color: '#00ccff',
      letterSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(6);

    this.skinGfxs = [];
    this.skinTxts = [];
    const count = CAR_SKINS.length;
    const spacing = 140;
    const startX  = GAME_WIDTH / 2 - (count - 1) * spacing / 2;

    // Toast / message banner for locked cars
    const lockToast = this.add.text(GAME_WIDTH / 2, 320, '', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '13px',
      color: '#ffbb00',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(15).setAlpha(0);

    for (let i = 0; i < count; i++) {
      const skin     = CAR_SKINS[i];
      const unlocked = this.unlockedSkins.includes(skin.id);
      const x        = startX + i * spacing;
      const y        = 230;

      const gfx = this.add.graphics().setDepth(7);
      gfx.setInteractive(new Phaser.Geom.Rectangle(x - 52, y - 30, 104, 75), Phaser.Geom.Rectangle.Contains);
      
      gfx.on('pointerdown', () => {
        if (!unlocked) {
          // Show clear unlock requirement message when clicking locked car
          lockToast.setText(`🔒 LOCKED — Score ${skin.unlockScore.toLocaleString()} pts to unlock ${skin.name.toUpperCase()}!`);
          lockToast.setColor('#ffbb00');
          lockToast.setAlpha(1);
          lockToast.setScale(1.1);

          this.tweens.killTweensOf(lockToast);
          this.tweens.add({
            targets: lockToast,
            scaleX: 1.0,
            scaleY: 1.0,
            duration: 180,
            ease: 'Back.easeOut',
            onComplete: () => {
              this.tweens.add({
                targets: lockToast,
                alpha: 0,
                delay: 2400,
                duration: 450,
              });
            },
          });

          // Shake card
          this.tweens.add({
            targets: gfx,
            x: '+=5',
            duration: 45,
            yoyo: true,
            repeat: 4,
          });
          return;
        }

        this.selectedSkinIdx = this.unlockedSkins.indexOf(skin.id);
        this.updateSkinHighlight();
      });

      gfx.on('pointerover', () => {
        if (unlocked) {
          gfx.setAlpha(1);
        } else {
          lockToast.setText(`🔒 Requires ${skin.unlockScore.toLocaleString()} pts to unlock`);
          lockToast.setColor('#ff9900');
          lockToast.setAlpha(0.9);
        }
      });
      gfx.on('pointerout', () => {
        if (!unlocked && lockToast.alpha < 1) lockToast.setAlpha(0);
      });

      this.skinGfxs.push(gfx);

      const labelStr = unlocked ? `${skin.name}\n${skin.topSpeedKph} KM/H` : `LOCKED\n${skin.unlockScore.toLocaleString()} pts`;
      const txt = this.add.text(x, y + 42, labelStr, {
        fontFamily: 'Orbitron, monospace',
        fontSize: '9.5px',
        color: unlocked ? `#${skin.carColor.toString(16).padStart(6, '0')}` : '#778899',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
      }).setOrigin(0.5, 0).setDepth(7);
      this.skinTxts.push(txt);

      this.drawSkinCard(gfx, x, y, skin.carColor, skin.trailColor, unlocked, false);
    }

    // Interactive Left/Right Arrow Buttons for Car Selection
    const leftArrow = this.add.text(GAME_WIDTH / 2 - (count / 2) * spacing - 36, 230, '◄', {
      fontFamily: 'Orbitron, monospace', fontSize: '26px', color: '#00ffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(8).setInteractive({ useHandCursor: true });
    leftArrow.on('pointerdown', () => this.navigateSkin(-1));
    leftArrow.on('pointerover', () => leftArrow.setColor('#ffffff'));
    leftArrow.on('pointerout', () => leftArrow.setColor('#00ffff'));

    const rightArrow = this.add.text(GAME_WIDTH / 2 + (count / 2) * spacing + 36, 230, '►', {
      fontFamily: 'Orbitron, monospace', fontSize: '26px', color: '#00ffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(8).setInteractive({ useHandCursor: true });
    rightArrow.on('pointerdown', () => this.navigateSkin(1));
    rightArrow.on('pointerover', () => rightArrow.setColor('#ffffff'));
    rightArrow.on('pointerout', () => rightArrow.setColor('#00ffff'));

    // Car Selection Instruction Pill Badge (Positioned below car labels with no overlap)
    const selPill = this.add.graphics().setDepth(6);
    selPill.fillStyle(0x060818, 0.85);
    selPill.fillRoundedRect(GAME_WIDTH / 2 - 200, 310, 400, 24, 6);
    selPill.lineStyle(1, 0x00ccff, 0.35);
    selPill.strokeRoundedRect(GAME_WIDTH / 2 - 200, 310, 400, 24, 6);

    this.add.text(GAME_WIDTH / 2, 322, '◄ ► ARROW KEYS OR CLICK A CAR TO SELECT', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '13px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(7);

    this.updateSkinHighlight();
  }

  private drawSkinCard(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number,
    carColor: number, trailColor: number,
    unlocked: boolean, selected: boolean,
  ): void {
    gfx.clear();
    const w = 100, h = 54;

    // Card background
    const bgAlpha = selected ? 0.30 : 0.12;
    if (selected) {
      gfx.fillStyle(carColor, 0.14);
      gfx.fillRoundedRect(x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 8);
      gfx.lineStyle(2, carColor, 0.9);
      gfx.strokeRoundedRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 7);
    }
    gfx.fillStyle(selected ? carColor : (unlocked ? 0x162238 : 0x0a0c16), bgAlpha);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);

    // Border
    gfx.lineStyle(selected ? 2 : 1, selected ? 0xffffff : (unlocked ? carColor : 0x334466), selected ? 1 : 0.5);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);

    if (!unlocked) {
      // Lock icon & badge
      gfx.fillStyle(0x1a2233, 0.9);
      gfx.fillRoundedRect(x - 12, y - 9, 24, 18, 3);
      gfx.lineStyle(1.5, 0xffaa00, 0.85);
      gfx.strokeRoundedRect(x - 12, y - 9, 24, 18, 3);
      gfx.strokeCircle(x, y - 9, 7);
      return;
    }

    // Car silhouette (top-down view)
    const cw = 40, ch = 20;
    gfx.fillStyle(carColor, 1);
    gfx.fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 3);
    gfx.fillStyle(0x020a16, 0.9);
    gfx.fillRoundedRect(x - cw * 0.35, y - ch * 0.35, cw * 0.7, ch * 0.5, 2);

    // Trail preview
    gfx.lineStyle(2.5, trailColor, 0.8);
    gfx.lineBetween(x, y + ch / 2 + 2, x, y + ch / 2 + 14);
    gfx.lineStyle(1, 0xffffff, 0.6);
    gfx.lineBetween(x, y + ch / 2 + 2, x, y + ch / 2 + 12);
  }

  private updateSkinHighlight(): void {
    for (let i = 0; i < CAR_SKINS.length; i++) {
      const skin     = CAR_SKINS[i];
      const unlocked = this.unlockedSkins.includes(skin.id);
      const selected = this.unlockedSkins[this.selectedSkinIdx] === skin.id;
      const spacing  = 140;
      const x = GAME_WIDTH / 2 - (CAR_SKINS.length - 1) * spacing / 2 + i * spacing;
      this.drawSkinCard(this.skinGfxs[i], x, 230, skin.carColor, skin.trailColor, unlocked, selected);
      this.skinTxts[i].setScale(selected ? 1.05 : 1);
    }
  }

  private buildHighScores(): void {
    const scores = getHighScores();
    const ox = GAME_WIDTH / 2;
    const oy = 358;

    this.add.text(ox, oy, '— HIGH SCORES —', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '12px',
      color: '#8899bb',
      letterSpacing: 5,
    }).setOrigin(0.5, 0).setDepth(6);

    this.hsTxt = [];
    if (scores.length === 0) {
      const empty = this.add.text(ox, oy + 24, 'NO LEGENDS YET — BE THE FIRST!', {
        fontFamily: 'Rajdhani, monospace',
        fontSize: '18px',
        color: '#ff00cc',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(6);
      this.tweens.add({ targets: empty, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    } else {
      scores.slice(0, 5).forEach((entry, idx) => {
        const medalColors = ['#ffdd00', '#cccccc', '#cc7733', '#888899', '#667788'];
        this.add.text(ox, oy + 24 + idx * 20, `${idx + 1}.  ${entry.score.toLocaleString()}  (${entry.distance.toFixed(1)} km)`, {
          fontFamily: 'Rajdhani, monospace',
          fontSize: '17px',
          color: medalColors[idx] ?? '#778899',
        }).setOrigin(0.5, 0).setDepth(6);
      });
    }
  }

  private buildStartPrompt(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 82;

    // Subtle, Elegant Button Container
    const btnW = 320;
    const btnH = 46;

    this.startButtonGfx = this.add.graphics().setDepth(7);
    const drawBtn = (hover: boolean) => {
      this.startButtonGfx.clear();
      this.startButtonGfx.fillStyle(0x0a1020, hover ? 0.95 : 0.75);
      this.startButtonGfx.fillRoundedRect(cx - btnW / 2, cy - btnH / 2, btnW, btnH, 8);
      this.startButtonGfx.lineStyle(hover ? 1.5 : 1, hover ? 0x00ffff : 0x0088cc, hover ? 0.95 : 0.55);
      this.startButtonGfx.strokeRoundedRect(cx - btnW / 2, cy - btnH / 2, btnW, btnH, 8);
    };
    drawBtn(false);

    // Interactive Button Hit Zone
    const btnZone = this.add.zone(cx, cy, btnW, btnH).setDepth(9).setInteractive({ useHandCursor: true });
    btnZone.on('pointerdown', () => this.startGame());
    btnZone.on('pointerover', () => {
      drawBtn(true);
      this.startTxt.setColor('#ffffff');
      this.startTxt.setScale(1.03);
    });
    btnZone.on('pointerout', () => {
      drawBtn(false);
      this.startTxt.setColor('#00e5ff');
      this.startTxt.setScale(1.0);
    });

    this.startTxt = this.add.text(cx, cy, 'START RACE', {
      fontFamily: 'Orbitron, monospace',
      fontSize: '19px',
      color: '#00e5ff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0.5, 0.5).setDepth(8);

    // Gentle, subtle pulse
    this.tweens.add({
      targets:  this.startTxt,
      alpha:    0.85,
      duration: 1000,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    // Controls reminder pill
    const ctrlPill = this.add.graphics().setDepth(7);
    ctrlPill.fillStyle(0x060818, 0.90);
    ctrlPill.fillRoundedRect(cx - 300, GAME_HEIGHT - 36, 600, 24, 5);
    ctrlPill.lineStyle(1, 0x223355, 0.5);
    ctrlPill.strokeRoundedRect(cx - 300, GAME_HEIGHT - 36, 600, 24, 5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'CONTROLS:  [W / ↑] DRIVE   •   [A/D / ←→] STEER   •   [SPACE] DRIFT   •   [E] BOOST', {
      fontFamily: 'Rajdhani, monospace',
      fontSize: '14px',
      color: '#b0c4de',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(8);
  }

  update(time: number, delta: number): void {
    this.timer += delta / 1000;

    // Title pulse
    if (this.titleTxt) {
      const s = 1 + Math.sin(this.timer * 1.5) * 0.015;
      this.titleTxt.setScale(s, s);
    }

    // Make the selected ride read as a live preview
    const selectedId = this.unlockedSkins[this.selectedSkinIdx];
    for (let i = 0; i < CAR_SKINS.length; i++) {
      const selected = CAR_SKINS[i].id === selectedId;
      const pulse = selected ? 1.06 + Math.sin(this.timer * 5) * 0.055 : 1;
      this.skinTxts[i]?.setScale(selected ? pulse * 1.03 : 1);
    }

    // Skin navigation
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.navigateSkin(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      this.navigateSkin(1);
    }

    // Animated grid lines scroll
    const ag = this.animGfx;
    ag.clear();
    ag.lineStyle(1, COLORS.NEON_PURPLE, 0.08);
    const scrollY = (this.timer * 40) % 60;
    for (let j = 0; j < 15; j++) {
      const t = (j / 14);
      const y = GAME_HEIGHT * 0.5 + (GAME_HEIGHT * 0.5 + 20) * t;
      const w = 640 * t;
      ag.lineBetween(GAME_WIDTH / 2 - w / 2, y, GAME_WIDTH / 2 + w / 2, y);
    }
  }

  private navigateSkin(dir: number): void {
    const unlocked = this.unlockedSkins;
    this.selectedSkinIdx = (this.selectedSkinIdx + dir + unlocked.length) % unlocked.length;
    this.updateSkinHighlight();
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;

    // Save selected skin
    const skinId = this.unlockedSkins[this.selectedSkinIdx] ?? 0;
    setSelectedSkin(skinId);

    // Flash and transition
    this.cameras.main.flash(300, 0, 255, 255);
    this.time.delayedCall(300, () => {
      this.scene.start(SCENE.GAME, { skinId });
    });
  }
}

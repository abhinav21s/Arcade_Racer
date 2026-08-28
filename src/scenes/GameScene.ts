// ============================================================
// NEON ARCADE RACER — Game Scene (Main Orchestrator)
// ============================================================

import Phaser from 'phaser';
import { SCENE, KEYS, SEGMENT_LENGTH, CAR_SKINS, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../constants';
import { RoadGenerator }  from '../road/RoadGenerator';
import { RoadRenderer }   from '../road/RoadRenderer';
import { Player }         from '../player/Player';
import { PlayerCar }      from '../player/PlayerCar';
import { TrafficManager } from '../traffic/TrafficManager';
import { PowerUpManager } from '../powerups/PowerUpManager';
import { ScoreSystem }    from '../scoring/ScoreSystem';
import { ParticleManager }from '../effects/ParticleManager';
import { ScreenEffects }  from '../effects/ScreenEffects';
import { NeonTrail }      from '../effects/NeonTrail';
import { AudioEngine }    from '../audio/AudioEngine';
import { HUD }            from '../ui/HUD';
import { StyleRank }      from '../ui/StyleRank';
import { PowerUpType }    from '../powerups/PowerUpTypes';
import {
  saveHighScore, checkAndUnlockSkins, isNewHighScore,
} from '../utils/SaveData';
import type { HighScoreEntry } from '../types';
import { PowerUpManager as PUM } from '../powerups/PowerUpManager';

export class GameScene extends Phaser.Scene {
  // Systems
  private roadGen!:   RoadGenerator;
  private roadRend!:  RoadRenderer;
  private player!:    Player;
  private playerCar!: PlayerCar;
  private traffic!:   TrafficManager;
  private powerUps!:  PowerUpManager;
  private score!:     ScoreSystem;
  private particles!: ParticleManager;
  private fx!:        ScreenEffects;
  private trail!:     NeonTrail;
  private audio!:     AudioEngine;
  private hud!:       HUD;
  private rank!:      StyleRank;

  // Event bus
  private events2!: Phaser.Events.EventEmitter;

  // State
  private skinId    = 0;
  private gameOver  = false;
  private pausedFlag= false;
  private restartKey!: Phaser.Input.Keyboard.Key;

  // Pause key
  private pauseKey!: Phaser.Input.Keyboard.Key;

  // Time slow world time scale
  private worldTimeScale = 1;

  // Crash complete flag
  private crashComplete = false;

  // Camera zoom (speed-based with lag)
  private currentZoom = 1.0;

  constructor() {
    super({ key: SCENE.GAME });
  }

  init(data: { skinId?: number }): void {
    this.skinId    = data?.skinId ?? 0;
    this.gameOver  = false;
    this.crashComplete = false;
    this.worldTimeScale = 1;
    this.pausedFlag = false;
  }

  create(): void {
    // ---- Event bus ----
    this.events2 = new Phaser.Events.EventEmitter();

    // ---- Core systems ----
    this.roadGen  = new RoadGenerator();
    this.roadRend = new RoadRenderer(this);

    this.player   = new Player(this, this.events2);
    this.player.skinIndex = CAR_SKINS.findIndex(s => s.id === this.skinId) ?? 0;
    if (this.player.skinIndex < 0) this.player.skinIndex = 0;

    this.score    = new ScoreSystem(this.events2);
    this.traffic  = new TrafficManager(this, this.events2);
    this.powerUps = new PowerUpManager(this, this.events2);
    this.particles= new ParticleManager(this);
    this.fx       = new ScreenEffects(this);
    this.trail    = new NeonTrail(this, this.player);

    this.playerCar= new PlayerCar(this, this.player);

    this.audio    = new AudioEngine();
    this.hud      = new HUD(this);
    this.rank     = new StyleRank(this);

    // ---- Register game events ----
    this.registerEvents();

    // ---- Keys ----
    this.restartKey = this.input.keyboard!.addKey(KEYS.R);
    this.pauseKey   = this.input.keyboard!.addKey(KEYS.ESC);

    // ---- Audio (resume on first interaction) ----
    this.input.once('pointerdown', () => this.audio.init(this));
    // Also init on first keypress
    this.input.keyboard!.once('keydown', () => this.audio.init(this));

    // Auto-init audio
    this.time.delayedCall(200, () => this.audio.init(this));

    // ---- Fade in ----
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Build road ahead before first frame
    this.roadGen.ensureAvailable(0, 300);
  }

  private registerEvents(): void {
    // Near miss
    this.events2.on('playerNearMiss', () => {
      this.particles.spawnNearMissFlash();
      this.fx.triggerNearMissShake();
      this.rank.showNearMiss();
      this.hud.flashScore();
      this.audio.playNearMiss();
    });

    // Drift end → bonus display
    this.events2.on('playerDriftEnd', (data: { duration: number }) => {
      if (data.duration >= 0.5) {
        const bonus = Math.floor(200 * data.duration * this.score.totalMultiplier);
        this.rank.showDriftBonus(bonus);
      }
    });

    // Crash
    this.events2.on('playerCrash', () => {
      const carX = this.playerCar.getCarX();
      const carY = this.playerCar.getCarY();
      this.particles.spawnCrashDebris(carX, carY);
      // CHANGE: much bigger crash shake + red flash
      this.fx.triggerCrashShake();
      this.cameras.main.flash(180, 255, 30, 30, false);
      this.audio.playCrash();
      // Dramatic slowdown on crash
      this.worldTimeScale = 0.1;
      this.time.delayedCall(400, () => { this.worldTimeScale = 1; });
    });

    // Crash complete → go to game over
    this.events2.on('playerCrashComplete', () => {
      this.crashComplete = true;
    });

    // Power-up collected
    this.events2.on('powerUpCollect', (data: { type: PowerUpType }) => {
      const carX = this.playerCar.getCarX();
      const carY = this.playerCar.getCarY();
      const cfg  = { color: 0xffffff }; // fallback
      this.particles.spawnPowerUpCollect(carX, carY, 0x00ffff);
      this.audio.playPowerUpCollect();
    });

    // Power-up expired
    this.events2.on('powerUpExpire', () => {
      // Small flash
      this.fx.triggerNearMissShake();
    });

    // Shockwave
    this.events2.on('shockwave', () => {
      this.traffic.applyShockwave(this.player.cameraZ);
      this.particles.spawnShockwave(GAME_WIDTH / 2, GAME_HEIGHT * 0.75);
      this.fx.triggerCrashShake();
      this.audio.playShockwave();
    });

    // Boost
    this.events2.on('boostStart', () => {
      this.fx.triggerBoostShake();
      this.audio.playBoost();
    });

    // Combo update
    this.events2.on('comboUpdate', () => {
      // HUD automatically reads from score system
    });
  }

  update(time: number, delta: number): void {
    if (this.gameOver) return;

    const dt = Math.min(delta / 1000, 0.05); // cap at 50ms to avoid spiral of death

    // ---- Check for crash complete → transition ----
    if (this.crashComplete) {
      this.gameOver = true;
      this.endGame();
      return;
    }

    // ---- Pause ----
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.togglePause();
    }
    if (this.pausedFlag) return;

    // ---- Get road data at camera position ----
    const cameraSegIdx = Math.floor(this.player.cameraZ / SEGMENT_LENGTH);
    const curSeg = this.roadGen.getSegment(cameraSegIdx);
    this.player.setRoadData(curSeg.curve, curSeg.hill);

    // ---- Update player (always full speed) ----
    this.player.update(dt);

    // ---- Render road (always full speed, constant 60 FPS flow) ----
    this.roadRend.render(
      this.roadGen,
      this.player.cameraZ,
      this.player.lateralPos,
      this.player.speedFraction,
      1.0,
    );

    // ---- Update traffic (world time scale applies) ----
    this.traffic.update(dt, this.player, this.worldTimeScale);
    this.traffic.render(this.player, this.roadRend);

    // ---- Update power-ups ----
    this.powerUps.update(dt, this.player, this.score, this.traffic);
    this.powerUps.render(this.player, this.roadRend);

    // ---- Update scoring ----
    this.score.update(dt, this.player);

    // ---- Update effects ----
    const carX = this.playerCar.getCarX();
    const carY = this.playerCar.getCarY();

    this.particles.update(dt, this.player, carX, carY);
    this.particles.render();

    this.trail.update(dt, carX, carY);
    this.trail.render();

    this.fx.update(dt, this.player);

    // ---- Update player car visual ----
    this.playerCar.update(dt, this.roadRend);

    // ---- Update HUD ----
    this.hud.update(dt, this.player, this.score);
    this.rank.update(dt, this.score);

    // ---- Update audio ----
    this.audio.update(dt, this.player, this.score);

    // ---- Check skin unlocks live during run ----
    const newSkins = checkAndUnlockSkins(this.score.score);
    if (newSkins.length > 0) {
      for (const skinId of newSkins) {
        const unlockedSkin = CAR_SKINS.find(s => s.id === skinId);
        if (unlockedSkin) {
          this.hud.showUnlockBanner(unlockedSkin.name);
          this.particles.spawnNearMissFlash();
          this.audio.playPowerUpCollect();
        }
      }
    }

    // ---- Instant restart: R works at any point once crash has begun ----
    if (Phaser.Input.Keyboard.JustDown(this.restartKey) && this.player.crashed) {
      this.gameOver = true;
      this.endGame();
    }
  }

  private togglePause(): void {
    this.pausedFlag = !this.pausedFlag;
    if (this.pausedFlag) {
      // Show a simple pause overlay
      this.audio.toggleMute();
    } else {
      this.audio.toggleMute();
      this.audio.resume();
    }
  }

  private endGame(): void {
    const score = this.score.score;
    const dist  = this.score.distance / 46000; // km

    // Save score
    const entry: HighScoreEntry = {
      score: Math.floor(score),
      distance: parseFloat(dist.toFixed(2)),
      date: new Date().toLocaleDateString(),
      skin: this.skinId,
    };
    saveHighScore(entry);
    checkAndUnlockSkins(score);

    // Transition
    this.cameras.main.fade(180, 0, 0, 0);
    this.time.delayedCall(180, () => {
      this.audio.destroy();
      this.scene.start(SCENE.GAME_OVER, {
        score: Math.floor(score),
        distance: parseFloat(dist.toFixed(2)),
        skinId: this.skinId,
      });
    });
  }

  shutdown(): void {
    // Clean up all systems
    this.roadRend?.destroy();
    this.playerCar?.destroy();
    this.traffic?.destroy();
    this.powerUps?.destroy();
    this.particles?.destroy();
    this.fx?.destroy();
    this.trail?.destroy();
    this.hud?.destroy();
    this.rank?.destroy();
    this.events2?.removeAllListeners();
  }
}

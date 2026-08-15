// ============================================================
// NEON ARCADE RACER — Power-up Manager
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import type { RoadRenderer } from '../road/RoadRenderer';
import type { TrafficManager } from '../traffic/TrafficManager';
import type { ScoreSystem } from '../scoring/ScoreSystem';
import {
  PowerUpType,
  POWERUP_CONFIGS,
  POWERUP_SPAWN_POOL,
} from './PowerUpTypes';
import type { PowerUpData } from '../types';
import {
  POWERUP_SPAWN_INTERVAL, POWERUP_COLLECT_RADIUS,
  SEGMENT_LENGTH, DRAW_LENGTH, GAME_WIDTH, GAME_HEIGHT, COLORS
} from '../constants';
import { randFloat, randInt, randItem } from '../utils/Math';

const LANE_POSITIONS = [-0.75, -0.25, 0.25, 0.75]; // 4 lanes
const MAX_ACTIVE = 5;
const SPAWN_DIST_MIN = SEGMENT_LENGTH * 30;
const SPAWN_DIST_MAX = SEGMENT_LENGTH * 80;

export class PowerUpManager {
  private scene:   Phaser.Scene;
  private emitter: Phaser.Events.EventEmitter;
  private gfx:     Phaser.GameObjects.Graphics;
  private pool:    PowerUpData[] = [];
  private nextId = 0;

  private spawnTimer = 3;  // Initial delay before first spawn
  private magnetGfx: Phaser.GameObjects.Graphics;

  // Floating text pool for visual feedback
  private floatTexts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, emitter: Phaser.Events.EventEmitter) {
    this.scene   = scene;
    this.emitter = emitter;
    this.gfx     = scene.add.graphics().setDepth(18);
    this.magnetGfx = scene.add.graphics().setDepth(17);

    // Pre-create floating text objects
    for (let i = 0; i < 6; i++) {
      const t = scene.add.text(0, 0, '', {
        fontFamily: 'Orbitron, monospace',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setDepth(60).setAlpha(0);
      this.floatTexts.push(t);
    }
  }

  update(dt: number, player: Player, score: ScoreSystem, traffic: TrafficManager): void {
    // Spawn timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.trySpawn(player.cameraZ);
      this.spawnTimer = POWERUP_SPAWN_INTERVAL * (0.7 + Math.random() * 0.6);
    }

    const activePUs = this.pool.filter(p => p.active && !p.collected);

    // Magnet effect: move power-ups toward player
    const hasMagnet = player.activePowerUp?.type === PowerUpType.MAGNET;
    if (hasMagnet) {
      for (const pu of activePUs) {
        const relZ = pu.worldZ - player.cameraZ;
        if (relZ > 0 && relZ < SEGMENT_LENGTH * 60) {
          // Pull lateral position toward player
          pu.lanePos += (player.lateralPos - pu.lanePos) * dt * 1.2;
        }
      }
    }

    // Collect check
    for (const pu of activePUs) {
      const relZ = pu.worldZ - player.cameraZ;
      if (Math.abs(relZ) > SEGMENT_LENGTH * 4) continue;

      const latDist = Math.abs(player.lateralPos - pu.lanePos);
      const collectR = hasMagnet ? POWERUP_COLLECT_RADIUS * 2.5 : POWERUP_COLLECT_RADIUS;
      if (latDist < collectR) {
        this.collect(pu, player, score);
      }

      // Recycle if behind camera
      if (relZ < -SEGMENT_LENGTH * 10) {
        pu.active = false;
      }
    }

    // Update floating text animations
    for (const t of this.floatTexts) {
      if (t.alpha > 0) {
        t.y -= dt * 80;
        t.alpha -= dt * 1.2;
      }
    }
  }

  private trySpawn(cameraZ: number): void {
    const activeCount = this.pool.filter(p => p.active && !p.collected).length;
    if (activeCount >= MAX_ACTIVE) return;

    const type = randItem(POWERUP_SPAWN_POOL);
    const worldZ = cameraZ + SPAWN_DIST_MIN + Math.random() * (SPAWN_DIST_MAX - SPAWN_DIST_MIN);
    const lane = randItem(LANE_POSITIONS);

    // Find inactive slot or push new
    let pu = this.pool.find(p => !p.active);
    if (!pu) {
      pu = { id: this.nextId++, type, worldZ, lanePos: lane, collected: false, active: false };
      this.pool.push(pu);
    }
    pu.type = type;
    pu.worldZ = worldZ;
    pu.lanePos = lane;
    pu.collected = false;
    pu.active = true;
  }

  private collect(pu: PowerUpData, player: Player, score: ScoreSystem): void {
    pu.collected = true;
    pu.active = false;
    const cfg = POWERUP_CONFIGS[pu.type];

    this.emitter.emit('powerUpCollect', { type: pu.type });

    // Apply power-up effect to player
    switch (pu.type) {
      case PowerUpType.NITRO_SURGE:
        player.activatePowerUp(PowerUpType.NITRO_SURGE, cfg.duration);
        break;
      case PowerUpType.SHOCKWAVE:
        // Shockwave is handled via event in GameScene
        this.emitter.emit('shockwave');
        break;
      case PowerUpType.TIME_SLOW:
        player.activatePowerUp(PowerUpType.TIME_SLOW, cfg.duration);
        break;
      case PowerUpType.SHIELD:
        player.activateShield();
        player.activatePowerUp(PowerUpType.SHIELD, 999);
        break;
      case PowerUpType.SCORE_MULTIPLIER:
        player.activatePowerUp(PowerUpType.SCORE_MULTIPLIER, cfg.duration);
        score.boostMultiplier(2);
        break;
      case PowerUpType.MAGNET:
        player.activatePowerUp(PowerUpType.MAGNET, cfg.duration);
        break;
      case PowerUpType.OVERDRIVE:
        player.activatePowerUp(PowerUpType.OVERDRIVE, cfg.duration);
        break;
    }

    // Show floating collect text
    this.showFloatText(cfg.label, cfg.color);
  }

  private showFloatText(text: string, color: number): void {
    const t = this.floatTexts.find(ft => ft.alpha <= 0);
    if (!t) return;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT * 0.6;
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    t.setText(text).setColor(hex).setAlpha(1).setPosition(cx - t.width / 2, cy);
  }

  render(player: Player, roadRenderer: RoadRenderer): void {
    const g = this.gfx;
    g.clear();
    this.magnetGfx.clear();

    const t = performance.now() / 1000;
    const hasMagnet = player.activePowerUp?.type === PowerUpType.MAGNET;

    for (const pu of this.pool) {
      if (!pu.active || pu.collected) continue;

      const pos = roadRenderer.getWorldZScreenPos(pu.worldZ, player.cameraZ, pu.lanePos);
      if (!pos) continue;
      if (pos.y < 300 || pos.y > GAME_HEIGHT + 20) continue;

      const cfg = POWERUP_CONFIGS[pu.type];
      const baseR = Math.max(6 * pos.scale * 600, 5);
      const pulse = Math.sin(t * 3 + pu.id) * 0.3 + 1;
      const r = baseR * pulse;

      // Outer glow
      g.fillStyle(cfg.color, 0.25);
      g.fillCircle(pos.x, pos.y, r * 2.5);

      // Mid glow
      g.fillStyle(cfg.glowColor, 0.4);
      g.fillCircle(pos.x, pos.y, r * 1.6);

      // Core orb
      g.fillStyle(cfg.color, 1);
      g.fillCircle(pos.x, pos.y, r);

      // Inner bright
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(pos.x - r * 0.2, pos.y - r * 0.2, r * 0.3);

      // Rotating ring
      g.lineStyle(Math.max(1, baseR * 0.2), cfg.glowColor, 0.8);
      g.strokeCircle(pos.x, pos.y, r * 1.1);

      // Icon (text drawn via existing text objects is complex, use a dot pattern instead)
      // Rotating orbit particles
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i / 3) * Math.PI * 2;
        const ox = pos.x + Math.cos(a) * r * 1.5;
        const oy = pos.y + Math.sin(a) * r * 1.5;
        g.fillStyle(cfg.color, 0.6);
        g.fillCircle(ox, oy, Math.max(1.5, baseR * 0.15));
      }

      // Magnet attraction arcs
      if (hasMagnet) {
        const mg = this.magnetGfx;
        mg.lineStyle(1, cfg.color, 0.25);
        mg.lineBetween(
          pos.x, pos.y,
          GAME_WIDTH * 0.5, GAME_HEIGHT * 0.76,
        );
      }
    }
  }

  getActive(): PowerUpData[] {
    return this.pool.filter(p => p.active && !p.collected);
  }

  destroy(): void {
    this.gfx.destroy();
    this.magnetGfx.destroy();
    this.floatTexts.forEach(t => t.destroy());
  }
}

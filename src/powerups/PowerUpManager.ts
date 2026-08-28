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
import { PLAYER_BUMPER_OFFSET_Z } from '../traffic/TrafficManager';

const LANE_POSITIONS = [-0.75, -0.25, 0.25, 0.75]; // 4 lanes
const MAX_ACTIVE = 5;
const SPAWN_DIST_MIN = SEGMENT_LENGTH * 8;
const SPAWN_DIST_MAX = SEGMENT_LENGTH * 22;

export class PowerUpManager {
  private scene:   Phaser.Scene;
  private emitter: Phaser.Events.EventEmitter;
  private gfx:     Phaser.GameObjects.Graphics;
  private pool:    PowerUpData[] = [];
  private nextId = 0;

  private spawnTimer = 2.5;
  private magnetGfx: Phaser.GameObjects.Graphics;

  // Floating text pool for instant collection feedback
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
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      }).setDepth(65).setAlpha(0);
      this.floatTexts.push(t);
    }
  }

  update(dt: number, player: Player, score: ScoreSystem, traffic: TrafficManager): void {
    // Spawn timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.trySpawn(player.cameraZ);
      this.spawnTimer = POWERUP_SPAWN_INTERVAL * (0.7 + Math.random() * 0.5);
    }

    const hasMagnet = player.activePowerUp?.type === PowerUpType.MAGNET;
    const playerFrontBumperZ = player.cameraZ + PLAYER_BUMPER_OFFSET_Z;
    const len = this.pool.length;

    for (let i = 0; i < len; i++) {
      const pu = this.pool[i];
      if (!pu.active || pu.collected) continue;

      const relFrontZ = pu.worldZ - playerFrontBumperZ;

      // Magnet effect
      if (hasMagnet && relFrontZ > 0 && relFrontZ < SEGMENT_LENGTH * 40) {
        pu.lanePos += (player.lateralPos - pu.lanePos) * dt * 2.5;
      }

      // Precise front-bumper collection check
      if (Math.abs(relFrontZ) <= SEGMENT_LENGTH * 0.85) {
        const latDist = Math.abs(player.lateralPos - pu.lanePos);
        const collectR = hasMagnet ? POWERUP_COLLECT_RADIUS * 2.8 : POWERUP_COLLECT_RADIUS * 1.35;
        if (latDist < collectR) {
          this.collect(pu, player, score);
          continue;
        }
      }

      // Recycle if passed behind camera
      if (pu.worldZ < player.cameraZ - SEGMENT_LENGTH * 4) {
        pu.active = false;
      }
    }

    // Update floating text animations
    for (const t of this.floatTexts) {
      if (t.alpha > 0) {
        t.y -= dt * 75;
        t.alpha -= dt * 1.3;
      }
    }
  }

  private trySpawn(cameraZ: number): void {
    const activeCount = this.pool.filter(p => p.active && !p.collected).length;
    if (activeCount >= MAX_ACTIVE) return;

    const type = randItem(POWERUP_SPAWN_POOL);
    const worldZ = cameraZ + SPAWN_DIST_MIN + Math.random() * (SPAWN_DIST_MAX - SPAWN_DIST_MIN);
    const lane = randItem(LANE_POSITIONS);

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
        this.emitter.emit('shockwave');
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
    this.showFloatText(`+ ${cfg.label} +`, cfg.color);
  }

  private showFloatText(text: string, color: number): void {
    const t = this.floatTexts.find(ft => ft.alpha <= 0);
    if (!t) return;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT * 0.52;
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
      const baseR = Math.max(7 * pos.scale * 600, 6);
      const pulse = Math.sin(t * 4 + pu.id) * 0.35 + 1;
      const r = baseR * pulse;

      // Outer pulsating aura
      g.fillStyle(cfg.color, 0.25);
      g.fillCircle(pos.x, pos.y, r * 2.4);

      // Rotating diamond icon
      const diamond = [
        { x: pos.x, y: pos.y - r * 1.35 },
        { x: pos.x + r, y: pos.y },
        { x: pos.x, y: pos.y + r * 1.35 },
        { x: pos.x - r, y: pos.y },
      ];
      g.fillStyle(cfg.color, 0.95);
      g.fillPoints(diamond, true);
      g.lineStyle(Math.max(1.5, baseR * 0.2), 0xffffff, 1.0);
      g.strokePoints(diamond, true);

      // Bright glowing core
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(pos.x, pos.y, Math.max(2, r * 0.35));

      // Orbiting energy spark particles
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + (i / 3) * Math.PI * 2;
        const ox = pos.x + Math.cos(a) * r * 1.6;
        const oy = pos.y + Math.sin(a) * r * 1.6;
        g.fillStyle(cfg.glowColor, 0.85);
        g.fillCircle(ox, oy, Math.max(2, baseR * 0.2));
      }

      // Magnet attraction arcs
      if (hasMagnet) {
        const mg = this.magnetGfx;
        mg.lineStyle(1.5, cfg.color, 0.4);
        mg.lineBetween(pos.x, pos.y, GAME_WIDTH * 0.5, GAME_HEIGHT * 0.74);
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

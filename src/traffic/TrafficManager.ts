// ============================================================
// NEON ARCADE RACER — Traffic Manager
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import type { RoadRenderer } from '../road/RoadRenderer';
import {
  type TrafficCar,
  TRAFFIC_CAR_CONFIGS,
  laneTolateralPos,
  getCarHalfWidth,
} from './TrafficCar';
import type { TrafficCarType } from '../types';
import {
  TRAFFIC_POOL_SIZE,
  NEAR_MISS_LATERAL_MIN, NEAR_MISS_LATERAL_MAX,
  COLLISION_LATERAL,
  SEGMENT_LENGTH, DRAW_LENGTH,
  COLORS,
} from '../constants';
import { randFloat, randInt, randItem, lerp } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

const CAR_TYPES: TrafficCarType[] = ['slow', 'mid', 'fast'];
const SPAWN_DISTANCE_AHEAD = SEGMENT_LENGTH * 16; // Spawn ahead in draw distance
const RECYCLE_BEHIND = -SEGMENT_LENGTH * 6;

// Exact front bumper offset in world units from player camera position
export const PLAYER_BUMPER_OFFSET_Z = SEGMENT_LENGTH * 3.2;

export class TrafficManager {
  private scene:    Phaser.Scene;
  private emitter:  Phaser.Events.EventEmitter;
  private cars:     TrafficCar[] = [];
  private nextId  = 0;
  private gfx:      Phaser.GameObjects.Graphics;

  private spawnTimer   = 0;
  private spawnInterval= 1.4;

  constructor(scene: Phaser.Scene, emitter: Phaser.Events.EventEmitter) {
    this.scene   = scene;
    this.emitter = emitter;
    this.gfx     = scene.add.graphics().setDepth(15);

    // Pre-populate pool
    for (let i = 0; i < TRAFFIC_POOL_SIZE; i++) {
      this.cars.push(this.createCar(false));
    }
  }

  private createCar(active: boolean): TrafficCar {
    const type = randItem(CAR_TYPES);
    const cfg  = TRAFFIC_CAR_CONFIGS[type];
    const lane = randInt(0, 3);
    const lat  = laneTolateralPos(lane);
    return {
      id:               this.nextId++,
      type,
      worldZ:           0,
      lane,
      lateralPos:       lat,
      targetLateralPos: lat,
      laneChangeTimer:  randFloat(2.5, 6.0),
      blinkerTimer:     0,
      isChangingLane:   false,
      speed:            randFloat(cfg.speedMin, cfg.speedMax),
      active,
      nearMissScored:   false,
      carWidth:         cfg.carWidth,
      color:            cfg.color,
      accentColor:      cfg.accentColor,
      isKnockedOut:     false,
      knockoutVx:       0,
      knockoutVz:       0,
    };
  }

  private getInactiveCar(): TrafficCar | undefined {
    return this.cars.find(c => !c.active);
  }

  private spawn(cameraZ: number, speedFraction: number): void {
    const car = this.getInactiveCar();
    if (!car) return;

    // Weight faster cars toward left lanes (0, 1), heavy vehicles to right lanes (2, 3)
    let type: TrafficCarType;
    let lane = randInt(0, 3);
    const roll = Math.random();
    if (roll < 0.35) {
      type = 'fast';
      lane = Math.random() < 0.7 ? randInt(0, 1) : randInt(2, 3);
    } else if (roll < 0.70) {
      type = 'mid';
      lane = randInt(0, 3);
    } else {
      type = 'slow';
      lane = Math.random() < 0.7 ? randInt(2, 3) : randInt(0, 1);
    }

    const cfg = TRAFFIC_CAR_CONFIGS[type];
    const lat = laneTolateralPos(lane);

    // Stagger spawn depth so cars never form artificial straight walls
    const depthStagger = (0.50 + Math.random() * 0.75) * SPAWN_DISTANCE_AHEAD;

    car.type             = type;
    car.lane             = lane;
    car.lateralPos       = lat;
    car.targetLateralPos = lat;
    car.worldZ           = cameraZ + depthStagger;
    car.speed            = randFloat(cfg.speedMin, cfg.speedMax);
    car.active           = true;
    car.nearMissScored   = false;
    car.isChangingLane   = false;
    car.laneChangeTimer  = randFloat(3.0, 7.0);
    car.blinkerTimer     = 0;
    car.isKnockedOut     = false;
    car.knockoutVx       = 0;
    car.knockoutVz       = 0;
    car.carWidth         = cfg.carWidth;
    car.color            = cfg.color;
    car.accentColor      = cfg.accentColor;
  }

  update(dt: number, player: Player, worldTimeScale = 1): void {
    const effDt = dt * worldTimeScale;
    const cameraZ = player.cameraZ;
    const speedFraction = player.speedFraction;

    // Adjust spawn interval based on player speed
    this.spawnInterval = Math.max(0.65, 1.6 - speedFraction * 0.85);

    // Spawn timer
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawn(cameraZ, speedFraction);
    }

    // Update active cars in-place without array allocations
    const len = this.cars.length;
    for (let i = 0; i < len; i++) {
      const car = this.cars[i];
      if (!car.active) continue;

      if (car.isKnockedOut) {
        car.worldZ += car.knockoutVz * effDt;
        car.lateralPos += car.knockoutVx * effDt;
        if (Math.abs(car.lateralPos) > 2.0 || (car.worldZ - cameraZ) < RECYCLE_BEHIND) {
          car.active = false;
        }
        continue;
      }

      // Advance car forward at its speed
      car.worldZ += car.speed * effDt;

      // Autonomous AI: dynamic lane changes
      this.updateCarAI(car, effDt);

      // Recycle if behind camera
      const relZ = car.worldZ - cameraZ;
      if (relZ < RECYCLE_BEHIND) {
        car.active = false;
        car.nearMissScored = false;
        continue;
      }
      if (relZ > SPAWN_DISTANCE_AHEAD * 1.6) {
        car.active = false;
        continue;
      }

      // Check collision and near-miss against player's front bumper
      this.checkPlayerInteraction(car, player);
    }
  }

  private updateCarAI(car: TrafficCar, dt: number): void {
    car.blinkerTimer += dt * 8;
    car.laneChangeTimer -= dt;

    if (car.laneChangeTimer <= 0 && !car.isChangingLane) {
      // Decide whether to shift lane
      if (Math.random() < 0.45) {
        const dir = (car.lane === 0) ? 1 : (car.lane === 3) ? -1 : (Math.random() < 0.5 ? 1 : -1);
        car.lane += dir;
        car.targetLateralPos = laneTolateralPos(car.lane);
        car.isChangingLane = true;
      }
      car.laneChangeTimer = randFloat(4.0, 9.0);
    }

    // Smooth lateral movement towards target lane
    if (car.isChangingLane) {
      car.lateralPos = lerp(car.lateralPos, car.targetLateralPos, Math.min(dt * 2.2, 1));
      if (Math.abs(car.lateralPos - car.targetLateralPos) < 0.02) {
        car.lateralPos = car.targetLateralPos;
        car.isChangingLane = false;
      }
    }
  }

  private checkPlayerInteraction(car: TrafficCar, player: Player): void {
    // Relative distance to player's FRONT BUMPER
    const playerFrontZ = player.cameraZ + PLAYER_BUMPER_OFFSET_Z;
    const relFrontZ = car.worldZ - playerFrontZ;

    // Near-miss check when player flies past the car
    const DETECT_ZONE_Z = SEGMENT_LENGTH * 2.2;
    if (Math.abs(relFrontZ) > DETECT_ZONE_Z) {
      if (relFrontZ > DETECT_ZONE_Z) car.nearMissScored = false;
      return;
    }

    const latDelta = Math.abs(player.lateralPos - car.lateralPos);
    const halfW    = getCarHalfWidth(car.type);
    const collisionThreshold = halfW + COLLISION_LATERAL;
    const nearMissMin = collisionThreshold + NEAR_MISS_LATERAL_MIN;
    const nearMissMax = collisionThreshold + NEAR_MISS_LATERAL_MAX;

    // Contact occurs when vehicle touches front hood/bumper area (Z threshold ± 0.65 segments)
    const isInHitDepth = Math.abs(relFrontZ) < SEGMENT_LENGTH * 0.70;

    if (isInHitDepth && latDelta < collisionThreshold) {
      // Overdrive or Nitro: player obliterates and flings the traffic car away!
      if (player.isBoostActive || player.invincible) {
        car.isKnockedOut = true;
        car.knockoutVx = (car.lateralPos >= player.lateralPos ? 1 : -1) * randFloat(3.5, 5.5);
        car.knockoutVz = player.speed * 1.3;
        this.emitter.emit('playerNearMiss');
        return;
      }

      // Direct collision
      player.triggerCrash();
    } else if (latDelta >= nearMissMin && latDelta <= nearMissMax && !car.nearMissScored) {
      // Near miss triggers the instant the player's bumper overtakes the car
      if (relFrontZ < 0) {
        car.nearMissScored = true;
        this.emitter.emit('playerNearMiss');
      }
    }
  }

  applyShockwave(cameraZ: number): void {
    for (const car of this.cars) {
      if (!car.active || car.isKnockedOut) continue;
      const relZ = car.worldZ - cameraZ;
      if (relZ > 0 && relZ < DRAW_LENGTH * SEGMENT_LENGTH * 0.6) {
        car.isKnockedOut = true;
        car.knockoutVx = (car.lateralPos >= 0 ? 1 : -1) * randFloat(4.0, 7.0);
        car.knockoutVz = randFloat(100, 250);
      }
    }
  }

  render(player: Player, roadRenderer: RoadRenderer): void {
    const g = this.gfx;
    g.clear();

    const cameraZ = player.cameraZ;

    for (const car of this.cars) {
      if (!car.active) continue;
      const pos = roadRenderer.getWorldZScreenPos(car.worldZ, cameraZ, car.lateralPos);
      if (!pos) continue;

      const cfg = TRAFFIC_CAR_CONFIGS[car.type];
      const scale = pos.scale * 820;
      const cw = Math.max(cfg.w * scale, 5);
      const ch = Math.max(cfg.h * scale, 3);
      const cx = pos.x;
      const cy = pos.y;

      if (cy < 0 || cy > 720 + ch) continue;

      this.drawTrafficVehicle(g, car, cx, cy, cw, ch);
    }
  }

  private drawTrafficVehicle(
    g: Phaser.GameObjects.Graphics,
    car: TrafficCar,
    cx: number, cy: number,
    cw: number, ch: number,
  ): void {
    const isBlinking = car.isChangingLane && Math.floor(car.blinkerTimer) % 2 === 0;

    // 1. Asphalt Ground Shadow
    g.fillStyle(0x000000, 0.75);
    g.fillEllipse(cx, cy + ch * 0.45, cw * 1.25, ch * 0.35);

    switch (car.type) {
      // ==========================================
      // CYBER BUS / HEAVY TRANSPORT
      // ==========================================
      case 'slow': {
        // Heavy Double Tires
        g.fillStyle(0x080812, 1);
        g.fillRoundedRect(cx - cw * 0.52, cy + ch * 0.15, cw * 0.18, ch * 0.35, 2);
        g.fillRoundedRect(cx + cw * 0.34, cy + ch * 0.15, cw * 0.18, ch * 0.35, 2);

        // Tall Boxy Cyber Chassis
        g.fillStyle(0x0d0d22, 1);
        g.fillRoundedRect(cx - cw * 0.48, cy - ch * 0.50, cw * 0.96, ch * 0.95, Math.max(2, cw * 0.05));
        g.lineStyle(Math.max(1, cw * 0.04), car.color, 0.9);
        g.strokeRoundedRect(cx - cw * 0.48, cy - ch * 0.50, cw * 0.96, ch * 0.95, Math.max(2, cw * 0.05));

        // Upper Rear Electronic LED Matrix Sign (Transit style)
        g.fillStyle(0x001122, 1);
        g.fillRect(cx - cw * 0.38, cy - ch * 0.44, cw * 0.76, ch * 0.22);
        g.fillStyle(COLORS.NEON_CYAN, 0.85);
        g.fillRect(cx - cw * 0.34, cy - ch * 0.38, cw * 0.68, Math.max(1.5, ch * 0.08));

        // Dual Vertical LED Tail-Light Columns
        g.fillStyle(0xff1133, 1);
        g.fillRect(cx - cw * 0.44, cy - ch * 0.10, Math.max(2, cw * 0.06), ch * 0.45);
        g.fillRect(cx + cw * 0.38, cy - ch * 0.10, Math.max(2, cw * 0.06), ch * 0.45);

        // Heavy Hazard Stripes on Lower Bumper
        g.fillStyle(COLORS.NEON_YELLOW, 0.9);
        for (let s = -2; s <= 2; s++) {
          g.fillRect(cx + s * (cw * 0.14) - cw * 0.04, cy + ch * 0.30, cw * 0.08, ch * 0.12);
        }
        break;
      }

      // ==========================================
      // CYBER SUV / CYBERTRUCK
      // ==========================================
      case 'mid': {
        // High Stance Off-road Tires
        g.fillStyle(0x080812, 1);
        g.fillRoundedRect(cx - cw * 0.50, cy + ch * 0.18, cw * 0.16, ch * 0.32, 3);
        g.fillRoundedRect(cx + cw * 0.34, cy + ch * 0.18, cw * 0.16, ch * 0.32, 3);

        // Angular Body
        g.fillStyle(0x16162a, 1);
        const suvPts = [
          { x: cx - cw * 0.44, y: cy - ch * 0.20 },
          { x: cx + cw * 0.44, y: cy - ch * 0.20 },
          { x: cx + cw * 0.40, y: cy + ch * 0.45 },
          { x: cx - cw * 0.40, y: cy + ch * 0.45 },
        ];
        g.fillPoints(suvPts, true);
        g.lineStyle(Math.max(1, cw * 0.04), car.color, 0.95);
        g.strokePoints(suvPts, true);

        // Roof-rack LED Lightbar
        g.fillStyle(COLORS.NEON_YELLOW, 0.9);
        g.fillRect(cx - cw * 0.32, cy - ch * 0.48, cw * 0.64, Math.max(2, ch * 0.10));

        // Dark Rear Privacy Glass
        g.fillStyle(0x050f1c, 0.95);
        g.fillRoundedRect(cx - cw * 0.32, cy - ch * 0.36, cw * 0.64, ch * 0.24, 2);

        // Continuous Horizontal Cyber Taillight Bar
        g.fillStyle(0xff2244, 1);
        g.fillRect(cx - cw * 0.38, cy + ch * 0.14, cw * 0.76, Math.max(2.5, ch * 0.12));
        g.fillStyle(0xffffff, 0.7);
        g.fillRect(cx - cw * 0.32, cy + ch * 0.17, cw * 0.64, Math.max(1, ch * 0.05));
        break;
      }

      // ==========================================
      // CYBER SUPERCAR
      // ==========================================
      case 'fast': {
        // Low-Profile Racing Tires
        g.fillStyle(0x080814, 1);
        g.fillRoundedRect(cx - cw * 0.52, cy + ch * 0.10, cw * 0.16, ch * 0.35, 3);
        g.fillRoundedRect(cx + cw * 0.36, cy + ch * 0.10, cw * 0.16, ch * 0.35, 3);

        // Wedge Body
        g.fillStyle(0x100520, 1);
        const coupePts = [
          { x: cx - cw * 0.42, y: cy - ch * 0.15 },
          { x: cx + cw * 0.42, y: cy - ch * 0.15 },
          { x: cx + cw * 0.36, y: cy + ch * 0.42 },
          { x: cx - cw * 0.36, y: cy + ch * 0.42 },
        ];
        g.fillPoints(coupePts, true);
        g.lineStyle(Math.max(1, cw * 0.05), car.color, 1.0);
        g.strokePoints(coupePts, true);

        // Rear Aerodynamic GT Wing Spoiler
        g.fillStyle(0x050510, 1);
        g.fillRect(cx - cw * 0.46, cy - ch * 0.42, cw * 0.92, Math.max(2, ch * 0.10));
        g.lineStyle(1.5, car.accentColor, 0.95);
        g.lineBetween(cx - cw * 0.46, cy - ch * 0.42, cx + cw * 0.46, cy - ch * 0.42);

        // Aerodynamic Rear Diffuser with Neon Underglow
        g.fillStyle(car.color, 0.45);
        g.fillEllipse(cx, cy + ch * 0.44, cw * 0.65, ch * 0.15);

        // Quad Round LED Rocket Taillights
        g.fillStyle(0xff1144, 1);
        g.fillCircle(cx - cw * 0.28, cy + ch * 0.18, Math.max(2, cw * 0.07));
        g.fillCircle(cx - cw * 0.12, cy + ch * 0.18, Math.max(2, cw * 0.07));
        g.fillCircle(cx + cw * 0.12, cy + ch * 0.18, Math.max(2, cw * 0.07));
        g.fillCircle(cx + cw * 0.28, cy + ch * 0.18, Math.max(2, cw * 0.07));
        break;
      }
    }

    // Turn Signal Amber Blinkers when changing lanes
    if (isBlinking) {
      const isRight = car.targetLateralPos > car.lateralPos;
      const bx = isRight ? cx + cw * 0.38 : cx - cw * 0.38;
      g.fillStyle(0xffaa00, 1);
      g.fillCircle(bx, cy + ch * 0.15, Math.max(2.5, cw * 0.09));
    }
  }

  getActiveCars(): TrafficCar[] {
    return this.cars.filter(c => c.active);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

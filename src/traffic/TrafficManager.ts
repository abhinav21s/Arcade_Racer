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
import { randFloat, randInt, randItem } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

const CAR_TYPES: TrafficCarType[] = ['slow', 'mid', 'fast'];
const SPAWN_DISTANCE_AHEAD = DRAW_LENGTH * SEGMENT_LENGTH * 0.75; // Spawn 75% of draw distance ahead
const RECYCLE_BEHIND = -SEGMENT_LENGTH * 8;  // Recycle when this far behind camera

export class TrafficManager {
  private scene:    Phaser.Scene;
  private emitter:  Phaser.Events.EventEmitter;
  private cars:     TrafficCar[] = [];
  private nextId  = 0;
  private gfx:      Phaser.GameObjects.Graphics;

  private spawnTimer   = 0;
  private spawnInterval= 1.8; // seconds; decreases with speed
  private lastSpawnLane = 1;

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
    return {
      id:          this.nextId++,
      type,
      worldZ:      0,
      lane,
      lateralPos:  laneTolateralPos(lane),
      speed:       randFloat(cfg.speedMin, cfg.speedMax),
      active,
      nearMissScored: false,
      carWidth:    cfg.carWidth,
      color:       cfg.color,
      accentColor: cfg.accentColor,
    };
  }

  private getInactiveCar(): TrafficCar | undefined {
    return this.cars.find(c => !c.active);
  }

  private spawn(cameraZ: number, speedFraction: number): void {
    const car = this.getInactiveCar();
    if (!car) return;

    const type   = randItem(CAR_TYPES);
    const cfg    = TRAFFIC_CAR_CONFIGS[type];
    // Alternate lanes at speed so traffic creates readable routes rather than
    // a stream of unrelated obstacles.
    const lane = speedFraction > 0.4
      ? (this.lastSpawnLane + randInt(1, 3)) % 4
      : randInt(0, 3);
    car.type         = type;
    car.lane         = lane;
    car.lateralPos   = laneTolateralPos(lane);
    car.worldZ       = cameraZ + SPAWN_DISTANCE_AHEAD * (0.5 + Math.random() * 0.5);
    car.speed        = randFloat(cfg.speedMin, cfg.speedMax);
    car.active       = true;
    car.nearMissScored = false;
    car.carWidth     = cfg.carWidth;
    car.color        = cfg.color;
    car.accentColor  = cfg.accentColor;
    this.lastSpawnLane = lane;

    // At racing speed, occasional two-car gates leave one deliberate escape
    // lane. This creates a choice: line up early, drift through, or boost.
    if (speedFraction > 0.68 && Math.random() < 0.32) {
      const partner = this.getInactiveCar();
      if (partner) {
        const partnerType = randItem(CAR_TYPES);
        const partnerCfg = TRAFFIC_CAR_CONFIGS[partnerType];
        const safeLane = (lane + 2) % 4;
        let partnerLane = (lane + (Math.random() < 0.5 ? 1 : 3)) % 4;
        if (partnerLane === safeLane) partnerLane = (partnerLane + 1) % 4;
        partner.type = partnerType;
        partner.lane = partnerLane;
        partner.lateralPos = laneTolateralPos(partnerLane);
        partner.worldZ = car.worldZ + randFloat(-SEGMENT_LENGTH * 0.18, SEGMENT_LENGTH * 0.18);
        partner.speed = randFloat(partnerCfg.speedMin, partnerCfg.speedMax);
        partner.active = true;
        partner.nearMissScored = false;
        partner.carWidth = partnerCfg.carWidth;
        partner.color = partnerCfg.color;
        partner.accentColor = partnerCfg.accentColor;
      }
    }
  }

  update(dt: number, player: Player, worldTimeScale = 1): void {
    const effDt = dt * worldTimeScale;
    const cameraZ = player.cameraZ;
    const speedFraction = player.speedFraction;

    // Adjust spawn interval based on player speed
    this.spawnInterval = Math.max(0.5, 1.8 - speedFraction * 1.1);

    // Spawn timer
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawn(cameraZ, speedFraction);
    }

    // Update active cars
    for (const car of this.cars) {
      if (!car.active) continue;

      // Advance car forward at its speed
      car.worldZ += car.speed * effDt;

      // Recycle if behind camera
      const relZ = car.worldZ - cameraZ;
      if (relZ < RECYCLE_BEHIND) {
        car.active = false;
        car.nearMissScored = false;
        continue;
      }
      // Recycle if too far ahead (respawn closer)
      if (relZ > SPAWN_DISTANCE_AHEAD * 1.5) {
        car.active = false;
        continue;
      }

      // Collision / near-miss detection
      this.checkPlayerInteraction(car, player, relZ);
    }
  }

  private checkPlayerInteraction(car: TrafficCar, player: Player, relZ: number): void {
    // Only check when car is very close (within a few segments ahead)
    const DETECT_ZONE_Z = SEGMENT_LENGTH * 3.5;
    if (Math.abs(relZ) > DETECT_ZONE_Z) {
      // Reset near-miss flag once car is far again
      if (relZ > DETECT_ZONE_Z) car.nearMissScored = false;
      return;
    }

    const latDelta = Math.abs(player.lateralPos - car.lateralPos);
    const halfW    = getCarHalfWidth(car.type);
    const collisionThreshold = halfW + COLLISION_LATERAL;
    const nearMissMin = collisionThreshold + NEAR_MISS_LATERAL_MIN;
    const nearMissMax = collisionThreshold + NEAR_MISS_LATERAL_MAX;

    if (latDelta < collisionThreshold) {
      // Collision
      player.triggerCrash();
    } else if (latDelta >= nearMissMin && latDelta <= nearMissMax && !car.nearMissScored) {
      // Near-miss (player passed closely without hitting)
      if (relZ < 0) {  // Car is behind camera (player just passed it)
        car.nearMissScored = true;
        this.emitter.emit('playerNearMiss');
      }
    }
  }

  /** Called by PowerUpManager for Shockwave — push all cars off screen */
  applyShockwave(cameraZ: number): void {
    for (const car of this.cars) {
      if (!car.active) continue;
      const relZ = car.worldZ - cameraZ;
      if (relZ > 0 && relZ < DRAW_LENGTH * SEGMENT_LENGTH * 0.6) {
        // Push car to edge of road
        car.lateralPos = car.lateralPos > 0 ? 1.5 : -1.5;
        car.active = false; // Effectively off-road, recycle
      }
    }
  }

  /** Render all visible traffic cars */
  render(player: Player, roadRenderer: RoadRenderer): void {
    const g = this.gfx;
    g.clear();

    const cameraZ = player.cameraZ;

    for (const car of this.cars) {
      if (!car.active) continue;
      const pos = roadRenderer.getWorldZScreenPos(car.worldZ, cameraZ, car.lateralPos);
      if (!pos) continue;

      const cfg = TRAFFIC_CAR_CONFIGS[car.type];
      const scale = pos.scale * 800;  // Visual scale from perspective
      const cw = Math.max(cfg.w * scale, 4);
      const ch = Math.max(cfg.h * scale, 2);
      const cx = pos.x;
      const cy = pos.y;

      if (cy < 0 || cy > 720 + ch) continue;

      this.drawTrafficCar(g, car, cx, cy, cw, ch);
    }
  }

  private drawTrafficCar(
    g: Phaser.GameObjects.Graphics,
    car: TrafficCar,
    cx: number, cy: number,
    cw: number, ch: number,
  ): void {
    const cfg = TRAFFIC_CAR_CONFIGS[car.type];

    // Traffic is a grounded, dark hazard vehicle: intentionally unlike the
    // bright diamond-shaped power-ups.
    g.fillStyle(0x000000, 0.55);
    g.fillEllipse(cx, cy + ch * 0.55, cw * 1.25, ch * 0.38);
    g.fillStyle(0x10101c, 1);
    g.fillRoundedRect(cx - cw * 0.48, cy - ch * 0.48, cw * 0.96, ch * 0.98, Math.max(2, cw * 0.08));
    g.lineStyle(Math.max(1, cw * 0.06), 0xff3355, 0.95);
    g.strokeRoundedRect(cx - cw * 0.48, cy - ch * 0.48, cw * 0.96, ch * 0.98, Math.max(2, cw * 0.08));

    // Orange warning chevrons and red lamps make collision objects readable.
    const stripeColor = car.type === 'fast' ? 0xffff00 : 0xff7711;
    g.fillStyle(stripeColor, 0.95);
    g.fillTriangle(cx - cw * 0.32, cy - ch * 0.14, cx - cw * 0.08, cy - ch * 0.14, cx - cw * 0.20, cy + ch * 0.20);
    g.fillTriangle(cx + cw * 0.08, cy - ch * 0.14, cx + cw * 0.32, cy - ch * 0.14, cx + cw * 0.20, cy + ch * 0.20);
    g.fillStyle(0xff1133, 1);
    g.fillCircle(cx - cw * 0.31, cy + ch * 0.34, Math.max(2, cw * 0.09));
    g.fillCircle(cx + cw * 0.31, cy + ch * 0.34, Math.max(2, cw * 0.09));
    g.fillStyle(0xffffff, 0.55);
    g.fillRect(cx - cw * 0.18, cy - ch * 0.36, cw * 0.36, Math.max(1, ch * 0.08));
  }

  getActiveCars(): TrafficCar[] {
    return this.cars.filter(c => c.active);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

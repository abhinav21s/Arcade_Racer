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
      const scale = pos.scale * 765;
      const cw = Math.max(cfg.w * scale, 6);
      const ch = Math.max(cfg.h * scale, 4);
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
    const isRight = car.targetLateralPos > car.lateralPos;

    switch (car.type) {
      // ==========================================
      // TRUCK / HEAVY TRANSPORT  (tall + wide)
      // ==========================================
      case 'slow':
        this.drawTruck(g, cx, cy, cw, ch, car.color, car.accentColor, isBlinking, isRight);
        break;

      // ==========================================
      // SUV / CROSSOVER  (medium height)
      // ==========================================
      case 'mid':
        this.drawSUV(g, cx, cy, cw, ch, car.color, car.accentColor, isBlinking, isRight);
        break;

      // ==========================================
      // SPORTS CAR / SUPERCAR  (low + wide)
      // ==========================================
      case 'fast':
        this.drawSportsCar(g, cx, cy, cw, ch, car.color, car.accentColor, isBlinking, isRight);
        break;
    }
  }

  // ─────────────────────────────────────────────────────
  // TRUCK: tall box cab, wide body, big tyres, chrome
  // ─────────────────────────────────────────────────────
  private drawTruck(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, cw: number, ch: number,
    color: number, accent: number,
    blinking: boolean, blinkRight: boolean,
  ): void {
    const r = Math.max(2, cw * 0.05);

    // --- Ground shadow ---
    g.fillStyle(0x000000, 0.55);
    g.fillEllipse(cx, cy + ch * 0.52, cw * 1.30, ch * 0.25);

    // --- Rear double wheels (wide, chunky) ---
    const tyreW = cw * 0.17;
    const tyreH = ch * 0.28;
    const tyreY = cy + ch * 0.28;
    // outer left
    g.fillStyle(0x111118, 1);
    g.fillRoundedRect(cx - cw * 0.56, tyreY, tyreW, tyreH, 2);
    g.fillStyle(0x2a2a33, 1);
    g.fillRoundedRect(cx - cw * 0.56, tyreY + tyreH * 0.1, tyreW, tyreH * 0.4, 1);
    // inner left (dual rear)
    g.fillStyle(0x111118, 1);
    g.fillRoundedRect(cx - cw * 0.37, tyreY + tyreH * 0.08, tyreW * 0.7, tyreH * 0.82, 2);
    // outer right
    g.fillStyle(0x111118, 1);
    g.fillRoundedRect(cx + cw * 0.39, tyreY, tyreW, tyreH, 2);
    g.fillStyle(0x2a2a33, 1);
    g.fillRoundedRect(cx + cw * 0.39, tyreY + tyreH * 0.1, tyreW, tyreH * 0.4, 1);
    // inner right (dual rear)
    g.fillStyle(0x111118, 1);
    g.fillRoundedRect(cx + cw * 0.20, tyreY + tyreH * 0.08, tyreW * 0.7, tyreH * 0.82, 2);

    // --- Chassis / body (tall boxy shape) ---
    const bodyTop    = cy - ch * 0.55;
    const bodyBottom = cy + ch * 0.38;
    const bodyLeft   = cx - cw * 0.50;
    const bodyRight  = cx + cw * 0.50;
    const bodyW      = bodyRight - bodyLeft;
    const bodyH      = bodyBottom - bodyTop;

    // Base dark body
    g.fillStyle(0x0d0e1e, 1);
    g.fillRoundedRect(bodyLeft, bodyTop, bodyW, bodyH, r);

    // Body panel colour layer
    g.fillStyle(color, 0.18);
    g.fillRoundedRect(bodyLeft, bodyTop, bodyW, bodyH, r);

    // Neon outline
    g.lineStyle(Math.max(1.5, cw * 0.045), color, 0.92);
    g.strokeRoundedRect(bodyLeft, bodyTop, bodyW, bodyH, r);

    // --- Cab divider line (horizontal crease midway) ---
    g.lineStyle(Math.max(1, cw * 0.025), accent, 0.35);
    g.lineBetween(bodyLeft + bodyW * 0.1, cy - ch * 0.05, bodyRight - bodyW * 0.1, cy - ch * 0.05);

    // --- Rear window (wide, portrait) ---
    const winL = cx - cw * 0.34;
    const winT = bodyTop + bodyH * 0.08;
    const winW = cw * 0.68;
    const winH = ch * 0.32;
    g.fillStyle(0x050f25, 1);
    g.fillRoundedRect(winL, winT, winW, winH, Math.max(1, r * 0.6));
    // window glass tint line
    g.fillStyle(accent, 0.12);
    g.fillRoundedRect(winL + winW * 0.1, winT + winH * 0.08, winW * 0.8, winH * 0.35, 1);

    // --- Cargo body markings / hazard stripes ---
    g.fillStyle(accent, 0.25);
    const stripeY = cy + ch * 0.05;
    for (let s = 0; s < 4; s++) {
      const sx = bodyLeft + bodyW * (0.15 + s * 0.20);
      g.fillRect(sx, stripeY, Math.max(1.5, cw * 0.06), ch * 0.22);
    }

    // --- Tail-light bars (dual stack) ---
    g.fillStyle(0xff2222, 1);
    g.fillRoundedRect(bodyLeft + bodyW * 0.03, cy - ch * 0.02, cw * 0.09, ch * 0.32, 1);
    g.fillRoundedRect(bodyRight - bodyW * 0.12, cy - ch * 0.02, cw * 0.09, ch * 0.32, 1);
    // bright inner
    g.fillStyle(0xff6666, 0.7);
    g.fillRect(bodyLeft + bodyW * 0.045, cy + ch * 0.02, cw * 0.05, ch * 0.12);
    g.fillRect(bodyRight - bodyW * 0.10, cy + ch * 0.02, cw * 0.05, ch * 0.12);

    // --- Chrome rear bumper bar ---
    g.fillStyle(0xaaaacc, 0.55);
    g.fillRoundedRect(bodyLeft + bodyW * 0.05, bodyBottom - ch * 0.08, bodyW * 0.90, ch * 0.08, 1);

    // --- Turn signal blinker ---
    if (blinking) {
      const bx = blinkRight ? bodyRight - bodyW * 0.08 : bodyLeft + bodyW * 0.02;
      g.fillStyle(0xffaa00, 1);
      g.fillRect(bx, cy - ch * 0.02, cw * 0.07, ch * 0.12);
    }
  }

  // ─────────────────────────────────────────────────────
  // SUV: tall-ish rounded cab, moderate tyres
  // ─────────────────────────────────────────────────────
  private drawSUV(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, cw: number, ch: number,
    color: number, accent: number,
    blinking: boolean, blinkRight: boolean,
  ): void {
    const r = Math.max(2, cw * 0.08);

    // --- Ground shadow ---
    g.fillStyle(0x000000, 0.50);
    g.fillEllipse(cx, cy + ch * 0.52, cw * 1.20, ch * 0.22);

    // --- Rear tyres ---
    const tyreW = cw * 0.16;
    const tyreH = ch * 0.30;
    const tyreY = cy + ch * 0.22;
    g.fillStyle(0x111118, 1);
    g.fillRoundedRect(cx - cw * 0.53, tyreY, tyreW, tyreH, 3);
    g.fillRoundedRect(cx + cw * 0.37, tyreY, tyreW, tyreH, 3);
    // tyre highlight rim
    g.fillStyle(0x333344, 1);
    g.fillEllipse(cx - cw * 0.45, tyreY + tyreH * 0.42, tyreW * 0.7, tyreH * 0.35);
    g.fillEllipse(cx + cw * 0.45, tyreY + tyreH * 0.42, tyreW * 0.7, tyreH * 0.35);

    // --- Main body (rounded, tall cab) ---
    const bodyTop    = cy - ch * 0.48;
    const bodyBottom = cy + ch * 0.34;
    const bodyLeft   = cx - cw * 0.46;
    const bodyRight  = cx + cw * 0.46;
    const bodyW      = bodyRight - bodyLeft;
    const bodyH      = bodyBottom - bodyTop;

    // Roof (slightly narrower)
    g.fillStyle(0x0d0e20, 1);
    g.fillRoundedRect(bodyLeft + bodyW * 0.06, bodyTop, bodyW * 0.88, bodyH * 0.50, r);
    g.fillStyle(color, 0.14);
    g.fillRoundedRect(bodyLeft + bodyW * 0.06, bodyTop, bodyW * 0.88, bodyH * 0.50, r);
    g.lineStyle(Math.max(1.5, cw * 0.04), color, 0.85);
    g.strokeRoundedRect(bodyLeft + bodyW * 0.06, bodyTop, bodyW * 0.88, bodyH * 0.50, r);

    // Lower cladding
    g.fillStyle(0x0a0b18, 1);
    g.fillRoundedRect(bodyLeft, bodyTop + bodyH * 0.46, bodyW, bodyH * 0.54, r);
    g.fillStyle(color, 0.10);
    g.fillRoundedRect(bodyLeft, bodyTop + bodyH * 0.46, bodyW, bodyH * 0.54, r);
    g.lineStyle(Math.max(1.5, cw * 0.04), color, 0.90);
    g.strokeRoundedRect(bodyLeft, bodyTop + bodyH * 0.46, bodyW, bodyH * 0.54, r);

    // --- Rear window ---
    const winL = bodyLeft + bodyW * 0.10;
    const winT = bodyTop + bodyH * 0.06;
    const winW = bodyW * 0.80;
    const winH = bodyH * 0.34;
    g.fillStyle(0x040d20, 1);
    g.fillRoundedRect(winL, winT, winW, winH, Math.max(1, r * 0.7));
    // glass shimmer
    g.fillStyle(accent, 0.15);
    g.fillRoundedRect(winL + winW * 0.08, winT + winH * 0.1, winW * 0.84, winH * 0.30, 1);

    // --- Roof rack bar ---
    g.fillStyle(0x888899, 0.45);
    g.fillRect(bodyLeft + bodyW * 0.12, bodyTop + bodyH * 0.02, bodyW * 0.76, Math.max(2, ch * 0.055));

    // --- Horizontal rear LED taillight bar ---
    g.fillStyle(0xff2233, 1);
    g.fillRoundedRect(bodyLeft + bodyW * 0.04, bodyTop + bodyH * 0.50, bodyW * 0.92, Math.max(3, ch * 0.11), 1);
    // bright inner stripe
    g.fillStyle(0xff8899, 0.8);
    g.fillRect(bodyLeft + bodyW * 0.08, bodyTop + bodyH * 0.52, bodyW * 0.84, Math.max(1.5, ch * 0.04));

    // --- Chrome rear bumper ---
    g.fillStyle(0x9999bb, 0.45);
    g.fillRoundedRect(bodyLeft + bodyW * 0.04, bodyBottom - ch * 0.08, bodyW * 0.92, ch * 0.08, 1);

    // --- Turn blinker ---
    if (blinking) {
      const bx = blinkRight ? bodyRight - bodyW * 0.10 : bodyLeft + bodyW * 0.04;
      g.fillStyle(0xffaa00, 1);
      g.fillRoundedRect(bx, bodyTop + bodyH * 0.50, cw * 0.09, ch * 0.11, 1);
    }
  }

  // ─────────────────────────────────────────────────────
  // SPORTS CAR: low, wide wedge, spoiler, wide tyres
  // ─────────────────────────────────────────────────────
  private drawSportsCar(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number, cw: number, ch: number,
    color: number, accent: number,
    blinking: boolean, blinkRight: boolean,
  ): void {
    const r = Math.max(2, cw * 0.07);

    // --- Ground shadow + underglow ---
    g.fillStyle(0x000000, 0.45);
    g.fillEllipse(cx, cy + ch * 0.54, cw * 1.20, ch * 0.20);
    g.fillStyle(color, 0.12);
    g.fillEllipse(cx, cy + ch * 0.50, cw * 0.90, ch * 0.12);

    // --- Wide low-profile tyres ---
    const tyreW = cw * 0.175;
    const tyreH = ch * 0.28;
    const tyreY = cy + ch * 0.18;
    g.fillStyle(0x111118, 1);
    g.fillRoundedRect(cx - cw * 0.54, tyreY, tyreW, tyreH, 3);
    g.fillRoundedRect(cx + cw * 0.365, tyreY, tyreW, tyreH, 3);
    // alloy rim hint
    g.fillStyle(0x444455, 1);
    g.fillEllipse(cx - cw * 0.455, tyreY + tyreH * 0.45, tyreW * 0.65, tyreH * 0.40);
    g.fillEllipse(cx + cw * 0.453, tyreY + tyreH * 0.45, tyreW * 0.65, tyreH * 0.40);

    // --- GT Wing spoiler (sits above roofline) ---
    const spoilerY = cy - ch * 0.50;
    // legs
    g.fillStyle(0x080810, 1);
    g.fillRect(cx - cw * 0.36, spoilerY, cw * 0.04, ch * 0.12);
    g.fillRect(cx + cw * 0.32, spoilerY, cw * 0.04, ch * 0.12);
    // wing blade
    g.fillStyle(0x0c0c1c, 1);
    g.fillRect(cx - cw * 0.44, spoilerY - ch * 0.07, cw * 0.88, ch * 0.07);
    g.lineStyle(Math.max(1, cw * 0.03), accent, 0.80);
    g.lineBetween(cx - cw * 0.44, spoilerY - ch * 0.035, cx + cw * 0.44, spoilerY - ch * 0.035);

    // --- Low wedge body ---
    const bodyTop    = cy - ch * 0.40;
    const bodyBottom = cy + ch * 0.30;
    const bodyLeft   = cx - cw * 0.48;
    const bodyRight  = cx + cw * 0.48;
    const bodyW      = bodyRight - bodyLeft;
    const bodyH      = bodyBottom - bodyTop;

    // Roof bubble (narrow, low)
    g.fillStyle(0x0a0b1c, 1);
    g.fillRoundedRect(bodyLeft + bodyW * 0.14, bodyTop, bodyW * 0.72, bodyH * 0.56, r * 1.2);
    g.fillStyle(color, 0.14);
    g.fillRoundedRect(bodyLeft + bodyW * 0.14, bodyTop, bodyW * 0.72, bodyH * 0.56, r * 1.2);
    g.lineStyle(Math.max(1.5, cw * 0.045), color, 0.95);
    g.strokeRoundedRect(bodyLeft + bodyW * 0.14, bodyTop, bodyW * 0.72, bodyH * 0.56, r * 1.2);

    // Lower wide sill / skirt
    g.fillStyle(0x090915, 1);
    g.fillRoundedRect(bodyLeft, bodyTop + bodyH * 0.48, bodyW, bodyH * 0.52, r * 0.6);
    g.fillStyle(color, 0.10);
    g.fillRoundedRect(bodyLeft, bodyTop + bodyH * 0.48, bodyW, bodyH * 0.52, r * 0.6);
    g.lineStyle(Math.max(1.5, cw * 0.045), color, 0.95);
    g.strokeRoundedRect(bodyLeft, bodyTop + bodyH * 0.48, bodyW, bodyH * 0.52, r * 0.6);

    // --- Rear glass (small, sporty) ---
    const winL = bodyLeft + bodyW * 0.17;
    const winT = bodyTop + bodyH * 0.05;
    const winW = bodyW * 0.66;
    const winH = bodyH * 0.40;
    g.fillStyle(0x03081a, 1);
    g.fillRoundedRect(winL, winT, winW, winH, r * 0.8);
    g.fillStyle(accent, 0.18);
    g.fillRoundedRect(winL + winW * 0.1, winT + winH * 0.1, winW * 0.80, winH * 0.28, 1);

    // --- Quad round LED tail-lights ---
    const tlY = bodyTop + bodyH * 0.52;
    const tlR = Math.max(2.5, cw * 0.075);
    g.fillStyle(0xff1133, 1);
    g.fillCircle(bodyLeft + bodyW * 0.10, tlY, tlR);
    g.fillCircle(bodyLeft + bodyW * 0.21, tlY, tlR * 0.7);
    g.fillCircle(bodyRight - bodyW * 0.10, tlY, tlR);
    g.fillCircle(bodyRight - bodyW * 0.21, tlY, tlR * 0.7);
    // bright hot centres
    g.fillStyle(0xff8899, 0.9);
    g.fillCircle(bodyLeft + bodyW * 0.10, tlY, tlR * 0.45);
    g.fillCircle(bodyRight - bodyW * 0.10, tlY, tlR * 0.45);

    // --- Diffuser / rear bumper lower ---
    g.fillStyle(0x080810, 1);
    g.fillRoundedRect(bodyLeft + bodyW * 0.04, bodyBottom - ch * 0.10, bodyW * 0.92, ch * 0.10, 1);
    // Diffuser neon stripe
    g.fillStyle(color, 0.35);
    g.fillRect(bodyLeft + bodyW * 0.10, bodyBottom - ch * 0.05, bodyW * 0.80, Math.max(1.5, ch * 0.03));

    // --- Exhaust pipes ---
    g.fillStyle(0x333340, 1);
    g.fillCircle(bodyLeft + bodyW * 0.28, bodyBottom - ch * 0.04, Math.max(2, cw * 0.055));
    g.fillCircle(bodyRight - bodyW * 0.28, bodyBottom - ch * 0.04, Math.max(2, cw * 0.055));
    g.fillStyle(0x888899, 0.6);
    g.fillCircle(bodyLeft + bodyW * 0.28, bodyBottom - ch * 0.04, Math.max(1, cw * 0.03));
    g.fillCircle(bodyRight - bodyW * 0.28, bodyBottom - ch * 0.04, Math.max(1, cw * 0.03));

    // --- Turn blinker ---
    if (blinking) {
      const bx = blinkRight ? bodyRight - bodyW * 0.06 : bodyLeft + bodyW * 0.01;
      g.fillStyle(0xffaa00, 1);
      g.fillCircle(bx, tlY, tlR * 0.85);
    }
  }

  getActiveCars(): TrafficCar[] {
    return this.cars.filter(c => c.active);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}

// ============================================================
// NEON ARCADE RACER — Player Physics & State Machine
// HIGH PRIORITY CHANGES:
//  - Snappier steering (instant response, less float at low speed)
//  - Better drift: speed fully retained, stronger lateral push
//  - Crash timer shortened for faster restart
// ============================================================

import Phaser from 'phaser';
import type { DriftState, PlayerState, PowerUpState } from '../types';
import { PowerUpType } from '../powerups/PowerUpTypes';
import type { RoadGenerator } from '../road/RoadGenerator';
import {
  PLAYER_MAX_SPEED, PLAYER_BOOST_SPEED, PLAYER_ACCEL, PLAYER_DECEL,
  PLAYER_COAST_FACTOR, STEER_FORCE, STEER_DRIFT_FORCE,
  ROAD_CURVE_PUSH, OFF_ROAD_SPEED_PENALTY, MIN_DRIFT_SPEED,
  DRIFT_LEAN_MAX, SEGMENT_LENGTH, ROAD_WIDTH, KEYS
} from '../constants';
import { clamp, lerp } from '../utils/Math';

interface InputState {
  accel:  boolean;
  brake:  boolean;
  left:   boolean;
  right:  boolean;
  drift:  boolean;
  nitro:  boolean;
}

export class Player {
  private scene: Phaser.Scene;

  // Input keys
  private keyUp!:    Phaser.Input.Keyboard.Key;
  private keyDown!:  Phaser.Input.Keyboard.Key;
  private keyLeft!:  Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyW!:     Phaser.Input.Keyboard.Key;
  private keyA!:     Phaser.Input.Keyboard.Key;
  private keyS!:     Phaser.Input.Keyboard.Key;
  private keyD!:     Phaser.Input.Keyboard.Key;
  private keyDrift!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyNitro!: Phaser.Input.Keyboard.Key;

  // Physics state (public for read access by other systems)
  speed:          number = 0;
  lateralPos:     number = 0;     // -1 = left edge, 0 = center, 1 = right edge
  lateralVel:     number = 0;     // Lateral velocity for drift
  cameraZ:        number = 0;     // World Z position (advances as player moves)
  driftState:     DriftState = 'none';
  driftAngle:     number = 0;     // Visual lean (radians)
  driftAccum:     number = 0;     // Total drift time this drift session
  driftJustEnded: boolean = false;

  // Collision / status
  crashed:         boolean = false;
  crashTimer:      number  = 0;
  invincible:      boolean = false;
  invincibleTimer: number  = 0;

  // Active power-up
  activePowerUp: PowerUpState = null;
  shieldActive:  boolean = false;
  scoreMultBonus:number  = 1;
  private nitroCooldown = 0;

  // Near-miss tracking
  nearMissActive: boolean = false;
  nearMissCooldown: number = 0;

  // For scoring
  lastLateralPos: number = 0;

  // Time slow factor (set by TIME_SLOW power-up)
  timeSlowFactor: number = 1;

  // Road query (set from GameScene each frame)
  private currentCurve: number = 0;
  private currentHill:  number = 0;

  // Skin index
  skinIndex: number = 0;

  // Emit events
  private eventTarget: Phaser.Events.EventEmitter;

  constructor(scene: Phaser.Scene, emitter: Phaser.Events.EventEmitter) {
    this.scene = scene;
    this.eventTarget = emitter;
    this.initKeys();
  }

  private initKeys(): void {
    const kb = this.scene.input.keyboard!;
    this.keyUp    = kb.addKey(KEYS.UP);
    this.keyDown  = kb.addKey(KEYS.DOWN);
    this.keyLeft  = kb.addKey(KEYS.LEFT);
    this.keyRight = kb.addKey(KEYS.RIGHT);
    this.keyW     = kb.addKey(KEYS.W);
    this.keyA     = kb.addKey(KEYS.A);
    this.keyS     = kb.addKey(KEYS.S);
    this.keyD     = kb.addKey(KEYS.D);
    this.keyDrift = kb.addKey(KEYS.SPACE);
    this.keyShift = kb.addKey(KEYS.SHIFT);
    this.keyNitro = kb.addKey(KEYS.E);
  }

  private readInput(): InputState {
    return {
      accel: this.keyUp.isDown || this.keyW.isDown,
      brake: this.keyDown.isDown || this.keyS.isDown,
      left:  this.keyLeft.isDown || this.keyA.isDown,
      right: this.keyRight.isDown || this.keyD.isDown,
      drift: this.keyDrift.isDown || this.keyShift.isDown,
      nitro: Phaser.Input.Keyboard.JustDown(this.keyNitro),
    };
  }

  /** Called by GameScene each frame with current road segment data */
  setRoadData(curve: number, hill: number): void {
    this.currentCurve = curve;
    this.currentHill  = hill;
  }

  update(dt: number, worldTimeScale: number = 1): void {
    if (this.crashed) {
      this.updateCrash(dt);
      return;
    }

    const inp = this.readInput();

    this.updatePowerUp(dt);
    this.nitroCooldown = Math.max(0, this.nitroCooldown - dt);
    if (inp.nitro && this.nitroCooldown <= 0 && this.speed > PLAYER_MAX_SPEED * 0.25) {
      this.activateNitro();
      this.nitroCooldown = 6;
    }
    this.updateSpeed(inp, dt);
    this.updateSteering(inp, dt);
    this.updateDrift(inp, dt);
    this.updateCamera(dt);
    this.updateInvincibility(dt);
    this.updateNearMissCooldown(dt);
    this.applyOffRoadPenalty(dt);

    this.lastLateralPos = this.lateralPos;
  }

  private updateSpeed(inp: InputState, dt: number): void {
    const maxSpeed = this.getMaxSpeed();

    if (inp.accel) {
      // SNAPPY: much faster acceleration — reaches top speed in ~2s
      this.speed += PLAYER_ACCEL * 1.6 * dt;
    } else if (inp.brake) {
      // SNAPPY: hard braking
      this.speed -= PLAYER_DECEL * 2.0 * dt;
    } else {
      // Natural coast — bleeds off slowly so speed feels earned
      this.speed -= PLAYER_COAST_FACTOR * 0.8 * dt;
    }

    // Hill physics: climbs cost speed, descents gain it
    this.speed -= this.currentCurve > 0 ? Math.abs(this.currentCurve) * 4 * dt : 0;
    this.speed -= this.currentHill * 7 * dt;

    // DRIFT: fully retain speed — this is the core game-feel reward
    if (this.driftState === 'drifting') {
      this.speed = Math.max(this.speed, maxSpeed * 0.80);
    }

    this.speed = clamp(this.speed, 0, maxSpeed);
  }

  private getMaxSpeed(): number {
    if (this.activePowerUp?.type === PowerUpType.NITRO_SURGE) return PLAYER_BOOST_SPEED * 1.1;
    if (this.activePowerUp?.type === PowerUpType.OVERDRIVE) return PLAYER_BOOST_SPEED;
    return PLAYER_MAX_SPEED;
  }

  private updateSteering(inp: InputState, dt: number): void {
    const steerInput = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const speedFraction = this.speed / PLAYER_MAX_SPEED;

    if (this.driftState === 'drifting' || this.driftState === 'entering') {
      // Drift: strong lateral push, slides freely
      const driftForce = STEER_DRIFT_FORCE * (0.5 + speedFraction * 0.6);
      this.lateralVel += steerInput * driftForce * dt * 5;
      this.lateralVel *= Math.pow(0.88, dt * 60);  // Long, controllable slide
      this.lateralPos += this.lateralVel * dt;
    } else {
      // SNAPPY normal steering: scales stronger at all speeds, no minimum floor needed
      // At 30% speed you still feel responsive; at top speed it's agile not loose
      const steerSpeed = STEER_FORCE * (0.5 + speedFraction * 0.7);
      if (steerInput !== 0) {
        // Direct lateral movement — no momentum, just instant response
        this.lateralPos += steerInput * steerSpeed * dt;
      }
      // Quick return to neutral when no input
      this.lateralVel = lerp(this.lateralVel, 0, dt * 12);
    }

    // Road curve pushes car if not actively correcting — only applies noticeably on actual curves at speed
    if (Math.abs(this.currentCurve) > 0.05) {
      const curveEffect = -this.currentCurve * (speedFraction * speedFraction) * ROAD_CURVE_PUSH * dt * 0.25;
      this.lateralPos += curveEffect;
    }

    // Wall collision
    if (Math.abs(this.lateralPos) > 1.3) {
      this.lateralPos = Math.sign(this.lateralPos) * 1.3;
      this.lateralVel *= -0.3;
      this.triggerCrash();
    }
  }

  private updateDrift(inp: InputState, dt: number): void {
    const speedFraction = this.speed / PLAYER_MAX_SPEED;
    const steerInput = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    // CHANGE: can initiate drift at lower speed threshold
    const canDrift = speedFraction >= MIN_DRIFT_SPEED * 0.85 && Math.abs(steerInput) > 0.1;

    this.driftJustEnded = false;

    switch (this.driftState) {
      case 'none':
        if (inp.drift && canDrift) {
          this.driftState = 'entering';
          this.driftAccum = 0;
          this.eventTarget.emit('playerDriftStart');
        }
        break;

      case 'entering':
        this.driftAccum += dt;
        if (this.driftAccum > 0.12) {  // Slightly faster to enter full drift
          this.driftState = 'drifting';
        }
        if (!inp.drift || !canDrift) {
          this.driftState = 'exiting';
        }
        break;

      case 'drifting':
        this.driftAccum += dt;
        if (!inp.drift) {
          this.driftState = 'exiting';
        }
        break;

      case 'exiting':
        if (this.driftAccum > 0) {
          this.eventTarget.emit('playerDriftEnd', { duration: this.driftAccum });
          this.driftJustEnded = true;
        }
        this.driftAccum = 0;
        this.driftState = 'none';
        break;
    }

    // CHANGE: stronger lean — more visual drama during drift
    const targetLean = this.driftState === 'drifting'
      ? (this.lateralVel > 0 ? -DRIFT_LEAN_MAX : DRIFT_LEAN_MAX) * 2.0   // was 1.5
      : this.lateralVel * DRIFT_LEAN_MAX * 2.5;                           // was 2

    this.driftAngle = lerp(this.driftAngle, targetLean, dt * 10);  // Faster lean response
  }

  private updateCamera(dt: number): void {
    this.cameraZ += this.speed * dt;
  }

  private updateInvincibility(dt: number): void {
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.invincible = false;
        this.invincibleTimer = 0;
      }
    }
  }

  private updateNearMissCooldown(dt: number): void {
    if (this.nearMissCooldown > 0) {
      this.nearMissCooldown -= dt;
    }
  }

  private applyOffRoadPenalty(dt: number): void {
    if (Math.abs(this.lateralPos) > 1.0) {
      this.speed *= Math.pow(OFF_ROAD_SPEED_PENALTY, dt * 60);
      this.lateralPos += -Math.sign(this.lateralPos) * 0.4 * dt;
    }
  }

  private updatePowerUp(dt: number): void {
    if (!this.activePowerUp) return;
    this.activePowerUp.timeLeft -= dt;
    if (this.activePowerUp.timeLeft <= 0) {
      const expiredType = this.activePowerUp.type;
      this.deactivatePowerUp();
      this.eventTarget.emit('powerUpExpire', { type: expiredType });
    }
  }

  private updateCrash(dt: number): void {
    this.crashTimer -= dt;
    this.speed = lerp(this.speed, 0, dt * 8);  // Faster stop on crash
    if (this.crashTimer <= 0) {
      this.eventTarget.emit('playerCrashComplete');
    }
  }

  activateNitro(): void {
    if (this.crashed) return;
    this.activatePowerUp(PowerUpType.NITRO_SURGE, 3.5);
    this.setInvincible(1.5);
    this.eventTarget.emit('boostStart', { type: 'nitro' });
  }

  activatePowerUp(type: PowerUpType, duration: number): void {
    this.activePowerUp = { type, timeLeft: duration, maxTime: duration };
    switch (type) {
      case PowerUpType.SHIELD:
        this.shieldActive = true;
        this.activePowerUp = { type, timeLeft: 999, maxTime: 999 };
        break;
      case PowerUpType.OVERDRIVE:
        this.setInvincible(duration);
        this.eventTarget.emit('boostStart', { type: 'overdrive' });
        break;
      case PowerUpType.TIME_SLOW:
        this.timeSlowFactor = 0.25;
        break;
      case PowerUpType.SCORE_MULTIPLIER:
        this.scoreMultBonus = Math.min(this.scoreMultBonus * 2, 8);
        break;
    }
  }

  deactivatePowerUp(): void {
    if (!this.activePowerUp) return;
    const type = this.activePowerUp.type;
    switch (type) {
      case PowerUpType.TIME_SLOW:
        this.timeSlowFactor = 1;
        break;
      case PowerUpType.SCORE_MULTIPLIER:
        this.scoreMultBonus = Math.max(1, this.scoreMultBonus / 2);
        break;
      case PowerUpType.OVERDRIVE:
        this.eventTarget.emit('boostEnd');
        break;
      case PowerUpType.NITRO_SURGE:
        this.eventTarget.emit('boostEnd');
        break;
    }
    this.activePowerUp = null;
  }

  triggerCrash(fromBarrier = false): void {
    if (this.crashed) return;
    if (this.invincible) return;
    if (this.shieldActive) {
      this.shieldActive = false;
      this.activePowerUp = null;
      this.setInvincible(2);
      return;
    }
    if (this.activePowerUp?.type === PowerUpType.OVERDRIVE) return;
    if (this.activePowerUp?.type === PowerUpType.NITRO_SURGE) return;

    this.crashed = true;
    this.crashTimer = 0.5;  // CHANGE: faster — 0.5s then game over screen
    this.driftState = 'none';
    this.driftAccum = 0;
    this.eventTarget.emit('playerCrash', { pos: this.lateralPos });
  }

  setInvincible(duration: number): void {
    this.invincible = true;
    this.invincibleTimer = Math.max(this.invincibleTimer, duration);
  }

  activateShield(): void {
    this.shieldActive = true;
  }

  reset(): void {
    this.speed = 0;
    this.lateralPos = 0;
    this.lateralVel = 0;
    this.cameraZ = 0;
    this.driftState = 'none';
    this.driftAngle = 0;
    this.driftAccum = 0;
    this.driftJustEnded = false;
    this.crashed = false;
    this.crashTimer = 0;
    this.invincible = false;
    this.invincibleTimer = 0;
    this.activePowerUp = null;
    this.shieldActive = false;
    this.scoreMultBonus = 1;
    this.timeSlowFactor = 1;
    this.nearMissCooldown = 0;
    this.nitroCooldown = 0;
  }

  get speedFraction(): number {
    return this.speed / PLAYER_MAX_SPEED;
  }

  get isDrifting(): boolean {
    return this.driftState === 'drifting';
  }

  get isOnRoad(): boolean {
    return Math.abs(this.lateralPos) <= 1.0;
  }

  get isBoostActive(): boolean {
    return this.activePowerUp?.type === PowerUpType.NITRO_SURGE
      || this.activePowerUp?.type === PowerUpType.OVERDRIVE;
  }
}

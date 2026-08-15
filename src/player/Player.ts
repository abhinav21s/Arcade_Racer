// ============================================================
// NEON ARCADE RACER — Player Physics & State Machine
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
  scoreMultBonus:number  = 1;  // Extra multiplier from SCORE_MULTIPLIER power-up

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

    // Apply time slow for TIME_SLOW power-up — player is NOT slowed
    // dt is already in real time; we apply worldTimeScale only to world simulation elsewhere
    const inp = this.readInput();

    this.updatePowerUp(dt);
    this.updateSpeed(inp, dt);
    this.updateSteering(inp, dt);
    this.updateDrift(inp, dt);
    this.updateCamera(dt);
    this.updateInvincibility(dt);
    this.updateNearMissCooldown(dt);

    // Road-edge feedback
    this.applyOffRoadPenalty(dt);

    this.lastLateralPos = this.lateralPos;
  }

  private updateSpeed(inp: InputState, dt: number): void {
    let targetSpeed: number;

    if (inp.accel) {
      targetSpeed = this.getMaxSpeed();
    } else if (inp.brake) {
      targetSpeed = 0;
    } else {
      // Coasting: decay toward 30% max speed
      targetSpeed = this.getMaxSpeed() * 0.3;
    }

    const accelFactor = inp.brake
      ? PLAYER_DECEL
      : PLAYER_ACCEL;

    this.speed = lerp(this.speed, targetSpeed, Math.min(accelFactor * dt * 3, 0.99));
    this.speed = Math.max(0, this.speed);
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
      // Drift steering: more forceful, lateral velocity-based
      const driftForce = STEER_DRIFT_FORCE * speedFraction;
      this.lateralVel += steerInput * driftForce * dt * 4;
      this.lateralVel *= Math.pow(0.85, dt * 60);  // Friction
      this.lateralPos += this.lateralVel * dt;
    } else {
      // Normal steering: direct lateral movement
      const steerAmount = steerInput * STEER_FORCE * speedFraction * dt;
      this.lateralPos += steerAmount;
      this.lateralVel = lerp(this.lateralVel, 0, dt * 8);
    }

    // Road curve pushes car sideways if not steering against it
    const curveEffect = -this.currentCurve * speedFraction * ROAD_CURVE_PUSH * dt * 0.3;
    this.lateralPos += curveEffect;

    // Soft clamp to road bounds (beyond ±1.0 is off-road, beyond ±1.3 is wall)
    if (Math.abs(this.lateralPos) > 1.3) {
      this.lateralPos = Math.sign(this.lateralPos) * 1.3;
      this.lateralVel *= -0.3;  // Bounce
      this.triggerCrash();
    }
  }

  private updateDrift(inp: InputState, dt: number): void {
    const speedFraction = this.speed / PLAYER_MAX_SPEED;
    const steerInput = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const canDrift = speedFraction >= MIN_DRIFT_SPEED && Math.abs(steerInput) > 0.1;

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
        if (this.driftAccum > 0.15) {
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

    // Visual lean
    const targetLean = this.driftState === 'drifting'
      ? (this.lateralVel > 0 ? -DRIFT_LEAN_MAX : DRIFT_LEAN_MAX) * 1.5
      : this.lateralVel * DRIFT_LEAN_MAX * 2;

    this.driftAngle = lerp(this.driftAngle, targetLean, dt * 8);
  }

  private updateCamera(dt: number): void {
    // Advance camera along road (world Z position)
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
      // Slow down and add lateral bounce-back force
      this.speed *= Math.pow(OFF_ROAD_SPEED_PENALTY, dt * 60);
      // Push back toward road
      this.lateralPos += -Math.sign(this.lateralPos) * 0.3 * dt;
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
    this.speed = lerp(this.speed, 0, dt * 5);
    if (this.crashTimer <= 0) {
      // Signal game-over (handled in GameScene)
      this.eventTarget.emit('playerCrashComplete');
    }
  }

  /** Activate nitro boost (called by PowerUpManager or input) */
  activateNitro(): void {
    if (this.crashed) return;
    this.activatePowerUp(PowerUpType.NITRO_SURGE, 3.5);
    this.setInvincible(1.5);
    this.eventTarget.emit('boostStart', { type: 'nitro' });
  }

  activatePowerUp(type: PowerUpType, duration: number): void {
    this.activePowerUp = { type, timeLeft: duration, maxTime: duration };

    // Immediate effects
    switch (type) {
      case PowerUpType.SHIELD:
        this.shieldActive = true;
        this.activePowerUp = { type, timeLeft: 999, maxTime: 999 }; // Lasts until hit
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

  /** Called when player hits something */
  triggerCrash(fromBarrier = false): void {
    if (this.invincible) return;
    if (this.shieldActive) {
      this.shieldActive = false;
      this.activePowerUp = null;  // Shield consumed
      this.setInvincible(2);
      return;
    }
    if (this.activePowerUp?.type === PowerUpType.OVERDRIVE) return; // Overdrive prevents crash
    if (this.activePowerUp?.type === PowerUpType.NITRO_SURGE) return; // Brief invincibility

    this.crashed = true;
    this.crashTimer = 1.5;  // Wait before game over trigger
    this.driftState = 'none';
    this.driftAccum = 0;
    this.eventTarget.emit('playerCrash', { pos: this.lateralPos });
  }

  setInvincible(duration: number): void {
    this.invincible = true;
    this.invincibleTimer = Math.max(this.invincibleTimer, duration);
  }

  /** Activate shield from power-up */
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

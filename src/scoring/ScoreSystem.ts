// ============================================================
// NEON ARCADE RACER — Score System
// ============================================================

import Phaser from 'phaser';
import type { Player } from '../player/Player';
import {
  SCORE_DISTANCE_RATE, SCORE_NEAR_MISS, SCORE_DRIFT_RATE,
  SCORE_COMBO_STEP, SCORE_MAX_MULTIPLIER, SCORE_COMBO_DECAY_TIME,
  PLAYER_MAX_SPEED,
} from '../constants';
import { clamp, formatNumber } from '../utils/Math';
import { PowerUpType } from '../powerups/PowerUpTypes';

export class ScoreSystem {
  score:      number = 0;
  combo:      number = 0;
  multiplier: number = 1;
  distance:   number = 0;   // World units traveled
  bestCombo:  number = 0;

  private comboDecayTimer: number = 0;
  private extraMultBonus:  number = 1;   // From SCORE_MULTIPLIER power-up
  private emitter: Phaser.Events.EventEmitter;

  // Cached last values for dirty detection (HUD update)
  private lastScore = -1;
  private lastCombo = -1;
  private lastMult  = -1;

  constructor(emitter: Phaser.Events.EventEmitter) {
    this.emitter = emitter;
    this.registerEvents();
  }

  private registerEvents(): void {
    this.emitter.on('playerNearMiss', () => this.onNearMiss());
    this.emitter.on('playerDriftEnd', (data: { duration: number }) => this.onDriftEnd(data.duration));
    this.emitter.on('playerCrash',    () => this.onCrash());
  }

  update(dt: number, player: Player): void {
    if (player.crashed) return;

    const speed = player.speed;
    const speedFraction = speed / PLAYER_MAX_SPEED;

    // Distance-based score (main income)
    const distThisFrame = speed * dt;
    this.distance += distThisFrame;
    this.score += distThisFrame * SCORE_DISTANCE_RATE * this.totalMultiplier;

    // Drift score while actively drifting
    if (player.isDrifting) {
      this.score += SCORE_DRIFT_RATE * dt * this.totalMultiplier * speedFraction;
      this.addCombo(dt * 0.5);  // Slowly builds combo while drifting
    }

    // Combo decay (lose combo if no stylish action for a while)
    if (!player.isDrifting) {
      this.comboDecayTimer += dt;
      if (this.comboDecayTimer >= SCORE_COMBO_DECAY_TIME) {
        this.decayCombo(dt);
      }
    } else {
      this.comboDecayTimer = 0;
    }

    // Sync extra multiplier from player power-up state
    this.extraMultBonus = player.scoreMultBonus;

    // Recalculate multiplier
    this.multiplier = clamp(1 + Math.floor(this.combo / SCORE_COMBO_STEP), 1, SCORE_MAX_MULTIPLIER);

    // Emit combo update if changed
    if (this.multiplier !== this.lastMult || this.combo !== this.lastCombo) {
      this.emitter.emit('comboUpdate', { combo: this.combo, multiplier: this.totalMultiplier });
      this.lastMult  = this.multiplier;
      this.lastCombo = this.combo;
    }
  }

  private onNearMiss(): void {
    this.score += SCORE_NEAR_MISS * this.totalMultiplier;
    this.addCombo(2);
    this.comboDecayTimer = 0;
  }

  private onDriftEnd(duration: number): void {
    if (duration < 0.3) return;
    const bonus = Math.floor(SCORE_DRIFT_RATE * duration * this.totalMultiplier);
    this.score += bonus;
    this.addCombo(Math.ceil(duration / 0.5));
  }

  private onCrash(): void {
    this.combo = Math.max(0, Math.floor(this.combo * 0.1));
    this.comboDecayTimer = 0;
    this.multiplier = clamp(1 + Math.floor(this.combo / SCORE_COMBO_STEP), 1, SCORE_MAX_MULTIPLIER);
    this.emitter.emit('comboUpdate', { combo: this.combo, multiplier: this.totalMultiplier });
  }

  private addCombo(amount: number): void {
    this.combo += amount;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
  }

  private decayCombo(dt: number): void {
    const excessTime = this.comboDecayTimer - SCORE_COMBO_DECAY_TIME;
    if (excessTime > 0 && this.combo > 0) {
      this.combo = Math.max(0, this.combo - dt * 3);
    }
  }

  /** Called externally by power-up SCORE_MULTIPLIER */
  boostMultiplier(factor: number): void {
    // Already handled via player.scoreMultBonus
  }

  /** Total effective multiplier (combo × extra) */
  get totalMultiplier(): number {
    return clamp(this.multiplier * this.extraMultBonus, 1, SCORE_MAX_MULTIPLIER * 4);
  }

  get formattedScore(): string {
    return formatNumber(this.score);
  }

  get formattedDistance(): string {
    return `${(this.distance / 1000).toFixed(2)} km`;
  }

  reset(): void {
    this.score = 0;
    this.combo = 0;
    this.multiplier = 1;
    this.distance = 0;
    this.bestCombo = 0;
    this.comboDecayTimer = 0;
    this.extraMultBonus = 1;
    this.lastScore = -1;
    this.lastCombo = -1;
    this.lastMult  = -1;
  }
}

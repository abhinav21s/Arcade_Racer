// ============================================================
// NEON ARCADE RACER — Power-up Types & Configurations
// ============================================================

export enum PowerUpType {
  NITRO_SURGE     = 'NITRO_SURGE',
  SHOCKWAVE       = 'SHOCKWAVE',
  SHIELD          = 'SHIELD',
  SCORE_MULTIPLIER= 'SCORE_MULTIPLIER',
  MAGNET          = 'MAGNET',
  OVERDRIVE       = 'OVERDRIVE',
}

export interface PowerUpConfig {
  type:        PowerUpType;
  label:       string;
  description: string;
  color:       number;       // Main color (hex)
  glowColor:   number;       // Glow/accent color
  duration:    number;       // Seconds (0 = instant)
  icon:        string;       // Single-char icon
}

export const POWERUP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  [PowerUpType.NITRO_SURGE]: {
    type:        PowerUpType.NITRO_SURGE,
    label:       'NITRO SURGE',
    description: '+80% speed, brief invincibility',
    color:       0x00ffff,
    glowColor:   0x0044ff,
    duration:    3.5,
    icon:        'N',
  },
  [PowerUpType.SHOCKWAVE]: {
    type:        PowerUpType.SHOCKWAVE,
    label:       'SHOCKWAVE',
    description: 'Push all traffic away',
    color:       0xffff00,
    glowColor:   0xff8800,
    duration:    0,   // Instant effect
    icon:        'W',
  },
  [PowerUpType.SHIELD]: {
    type:        PowerUpType.SHIELD,
    label:       'SHIELD',
    description: 'Absorb one collision',
    color:       0x00ffaa,
    glowColor:   0x00ccff,
    duration:    0,   // Until hit
    icon:        'S',
  },
  [PowerUpType.SCORE_MULTIPLIER]: {
    type:        PowerUpType.SCORE_MULTIPLIER,
    label:       'SCORE BOOST',
    description: 'Double score for 10s (stackable)',
    color:       0xff00cc,
    glowColor:   0xffff00,
    duration:    10.0,
    icon:        'X',
  },
  [PowerUpType.MAGNET]: {
    type:        PowerUpType.MAGNET,
    label:       'MAGNET',
    description: 'Attract power-ups to you',
    color:       0xff6600,
    glowColor:   0xffcc00,
    duration:    8.0,
    icon:        'M',
  },
  [PowerUpType.OVERDRIVE]: {
    type:        PowerUpType.OVERDRIVE,
    label:       'OVERDRIVE',
    description: 'Max speed, smash through cars',
    color:       0xff0055,
    glowColor:   0x9900ff,
    duration:    5.0,
    icon:        'O',
  },
};

/** Ordered list for spawning (weighted) */
export const POWERUP_SPAWN_POOL: PowerUpType[] = [
  PowerUpType.NITRO_SURGE,
  PowerUpType.NITRO_SURGE,
  PowerUpType.SHOCKWAVE,
  PowerUpType.SHIELD,
  PowerUpType.SHIELD,
  PowerUpType.SCORE_MULTIPLIER,
  PowerUpType.SCORE_MULTIPLIER,
  PowerUpType.MAGNET,
  PowerUpType.OVERDRIVE,
];

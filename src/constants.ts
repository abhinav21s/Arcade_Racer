// ============================================================
// NEON ARCADE RACER — Constants
// ============================================================
import Phaser from 'phaser';

// ---- Screen ----
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// ---- Road / Camera ----
export const SEGMENT_LENGTH   = 200;      // World units per road segment
export const ROAD_WIDTH       = 2000;     // World units, total half-width (±1000)
export const CAMERA_HEIGHT    = 1000;     // Camera height above road in world units
export const CAMERA_DEPTH     = 0.84;     // 1/tan(FOV/2), ~70° FOV
export const DRAW_LENGTH      = 150;      // Number of road segments to render
export const NUM_LANES        = 4;        // Driving lanes

// ---- Road Colors (neon dark palette) ----
export const COLORS = {
  // Sky gradient
  SKY_TOP:        0x050510,
  SKY_BOTTOM:     0x0d0030,
  // Road alternating stripes
  GRASS_A:        0x051a0d,
  GRASS_B:        0x071f10,
  ROAD_A:         0x1a0040,
  ROAD_B:         0x150038,
  RUMBLE_A:       0xff00cc,   // magenta
  RUMBLE_B:       0x00ccff,   // cyan
  LANE_MARK:      0x442266,   // dim purple dash
  // Road edge neon barriers
  BARRIER_NEAR:   0x00ffff,
  BARRIER_FAR:    0x6600ff,
  // Player
  NEON_CYAN:      0x00ffff,
  NEON_MAGENTA:   0xff00ff,
  NEON_PURPLE:    0x9900ff,
  NEON_BLUE:      0x0066ff,
  NEON_ORANGE:    0xff6600,
  NEON_YELLOW:    0xffff00,
  NEON_WHITE:     0xffffff,
  NEON_GREEN:     0x00ff88,
};

// ---- Player Physics ----
export const PLAYER_MAX_SPEED       = 320;   // World units / second (max)
export const PLAYER_BOOST_SPEED     = 500;   // Speed during nitro/overdrive
export const PLAYER_ACCEL           = 760;   // World units / sec² — immediate arcade response
export const PLAYER_DECEL           = 1050;  // Braking force (world units / sec²)
export const PLAYER_COAST_FACTOR    = 115;   // Natural speed loss (world units / sec²)
export const STEER_FORCE            = 2.85;  // Direct lateral response
export const STEER_DRIFT_FORCE      = 5.1;   // Lateral force while drifting
export const ROAD_CURVE_PUSH        = 1.05;  // Curves require active counter-steering
export const OFF_ROAD_SPEED_PENALTY = 0.6;   // Speed multiplier when off road
export const MIN_DRIFT_SPEED        = 0.45;  // Fraction of max speed to allow drift
export const DRIFT_LEAN_MAX         = 0.30;  // Max visual lean (degrees factor)

// ---- Traffic ----
export const TRAFFIC_SPAWN_INTERVAL = 1.2;   // Seconds between spawns at base speed
export const TRAFFIC_POOL_SIZE      = 30;
export const NEAR_MISS_LATERAL_MIN  = 0.035; // Generous close-pass window
export const NEAR_MISS_LATERAL_MAX  = 0.34;  // Max lateral gap for near-miss
export const COLLISION_LATERAL      = 0.07;  // Lateral gap for collision

// ---- Power-ups ----
export const POWERUP_SPAWN_INTERVAL = 8;     // Seconds between power-up spawns
export const POWERUP_COLLECT_RADIUS = 0.18;  // Lateral fraction of road width to collect

// ---- Scoring ----
export const SCORE_DISTANCE_RATE    = 0.05;  // Points per world unit * speed
export const SCORE_NEAR_MISS        = 500;
export const SCORE_DRIFT_RATE       = 200;   // Per second of drifting
export const SCORE_COMBO_STEP       = 5;     // Combos per multiplier step
export const SCORE_MAX_MULTIPLIER   = 8;
export const SCORE_COMBO_DECAY_TIME = 4;     // Seconds of inactivity to lose combo

// ---- Style Rank thresholds (multiplier) ----
export const STYLE_RANKS = [
  { min: 8, label: 'LEGENDARY', color: 0xffdd00 },
  { min: 6, label: 'INSANE',    color: 0xff00ff },
  { min: 4, label: 'SICK',      color: 0x00ffff },
  { min: 2, label: 'COOL',      color: 0x00ff88 },
  { min: 1, label: 'GOOD',      color: 0x9977ff },
];

// ---- Unlockable Skins ----
export const CAR_SKINS = [
  { id: 0, name: 'NEON PINK',  carColor: 0xff00cc, trailColor: 0x00ffff, unlockScore: 0 },
  { id: 1, name: 'GHOST CYAN', carColor: 0x00ffff, trailColor: 0xffffff, unlockScore: 10000 },
  { id: 2, name: 'SOLAR FLARE',carColor: 0xff6600, trailColor: 0xffff00, unlockScore: 25000 },
  { id: 3, name: 'VOID RUNNER', carColor: 0x220033, trailColor: 0x9900ff, unlockScore: 50000 },
  { id: 4, name: 'AURORA',     carColor: 0xffffff, trailColor: 0x00ff88, unlockScore: 100000 },
];

// ---- Key Codes (raw integer values — safe to use before Phaser init) ----
export const KEYS = {
  UP:     Phaser.Input.Keyboard.KeyCodes.UP,
  DOWN:   Phaser.Input.Keyboard.KeyCodes.DOWN,
  LEFT:   Phaser.Input.Keyboard.KeyCodes.LEFT,
  RIGHT:  Phaser.Input.Keyboard.KeyCodes.RIGHT,
  W:      Phaser.Input.Keyboard.KeyCodes.W,
  A:      Phaser.Input.Keyboard.KeyCodes.A,
  S:      Phaser.Input.Keyboard.KeyCodes.S,
  D:      Phaser.Input.Keyboard.KeyCodes.D,
  SPACE:  Phaser.Input.Keyboard.KeyCodes.SPACE,
  SHIFT:  Phaser.Input.Keyboard.KeyCodes.SHIFT,
  E:      Phaser.Input.Keyboard.KeyCodes.E,
  R:      Phaser.Input.Keyboard.KeyCodes.R,
  ENTER:  Phaser.Input.Keyboard.KeyCodes.ENTER,
  ESC:    Phaser.Input.Keyboard.KeyCodes.ESC,
};

// ---- Phaser Texture Keys ----
export const TEX = {
  PLAYER_CAR:    'player_car',
  TRAFFIC_A:     'traffic_a',
  TRAFFIC_B:     'traffic_b',
  TRAFFIC_C:     'traffic_c',
  PARTICLE_GLOW: 'particle_glow',
  PARTICLE_SPARK:'particle_spark',
  POWERUP_ORB:   'powerup_orb',
  BUILDING_A:    'building_a',
  BUILDING_B:    'building_b',
  LAMP:          'lamp',
};

// ---- Scene Keys ----
export const SCENE = {
  BOOT:      'BootScene',
  MENU:      'MenuScene',
  GAME:      'GameScene',
  GAME_OVER: 'GameOverScene',
};


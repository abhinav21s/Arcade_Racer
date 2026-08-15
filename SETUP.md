# Setup Guide

## Prerequisites

- **Node.js** 18+ and npm

## Installation

```bash
# In the project directory:
npm install

# Start development server:
npm run dev
# Open http://localhost:5173 in your browser

# Production build:
npm run build
```

## Project Structure

```
src/
├── main.ts                  # Phaser game entry point
├── constants.ts             # All game constants & config
├── types.ts                 # Shared TypeScript interfaces
├── scenes/
│   ├── BootScene.ts         # Asset/texture generation
│   ├── MenuScene.ts         # Main menu & skin selector
│   ├── GameScene.ts         # Main gameplay orchestrator
│   └── GameOverScene.ts     # Score display & restart
├── road/
│   ├── RoadGenerator.ts     # Procedural infinite road
│   └── RoadRenderer.ts      # OutRun pseudo-3D projection
├── player/
│   ├── Player.ts            # Physics & state machine
│   └── PlayerCar.ts         # Car visuals & trail
├── traffic/
│   ├── TrafficCar.ts        # AI car data & configs
│   └── TrafficManager.ts    # Spawning, collision, rendering
├── powerups/
│   ├── PowerUpTypes.ts      # 7 power-up definitions
│   └── PowerUpManager.ts    # Spawn, collect, apply effects
├── scoring/
│   └── ScoreSystem.ts       # Distance, drift, combo scoring
├── effects/
│   ├── ParticleManager.ts   # Drift sparks, crash debris, etc.
│   ├── ScreenEffects.ts     # Shake, time-slow, overlays
│   └── NeonTrail.ts         # Expanding ring trail effect
├── audio/
│   └── AudioEngine.ts       # Procedural Web Audio synthesis
├── ui/
│   ├── HUD.ts               # Speed bar, score, power-up bar
│   └── StyleRank.ts         # Rank label & popup events
└── utils/
    ├── Math.ts              # lerp, clamp, project, etc.
    ├── SaveData.ts          # localStorage high scores & skins
    └── ObjectPool.ts        # Generic object pool
```

## Notes

- **No audio files** — music and SFX are synthesized in real-time via Web Audio API
- **No sprite files** — all visuals drawn procedurally via Phaser Graphics
- Desktop only — no touch/mobile support

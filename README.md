# Neon Arcade Racer

A blazing-fast OutRun-style pseudo-3D arcade racer built with **Phaser 3 + TypeScript + Vite**.

Play it online: [arcade-racer-jade.vercel.app](https://arcade-racer-jade.vercel.app/)

## Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake |
| `A` / `←` | Steer Left |
| `D` / `→` | Steer Right |
| `Space` / `Shift` | Drift |
| `E` | Nitro Surge |
| `ESC` | Pause |
| `Enter` | Restart (from Game Over) |

## Features

- **Pseudo-3D road** (OutRun-style perspective with curves and hills)
- **7 unique power-ups**: Nitro Surge, Shockwave, Time Slow, Shield, Score Multiplier, Magnet, Overdrive
- **Drift mechanic** with maintained speed and visual lean
- **Near-miss detection** with score bonuses
- **Combo / multiplier system** (up to ×8)
- **Style Ranks**: GOOD → COOL → SICK → INSANE → LEGENDARY
- **5 unlockable car skins** (unlock by score threshold)
- **Local high scores** (top 5 saved to localStorage)
- **Procedural synthwave audio** (no audio files — pure Web Audio API)
- **Neon visual effects**: trails, drift sparks, speed lines, screen shake, chromatic aberration
- **Stable 60 FPS** at 1280×720, scales to fill any screen

## Quick Start

```bash
npm install
npm run dev
```

See [SETUP.md](SETUP.md) for full setup instructions.

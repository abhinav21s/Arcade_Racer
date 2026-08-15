# Features Reference

## Road System
- **OutRun-style pseudo-3D** projection (scale = cameraDepth / depth)
- Trapezoid road segments rendered far→near (painter's algorithm)
- **Procedural curves**: smooth sinusoidal blending between curve sections
- **Procedural hills**: independent Y-offset accumulation
- **Alternating road stripes**: magenta/cyan rumble strips, purple dashes
- **4 driving lanes** with perspective lane markings
- **Roadside sprites**: neon lamp posts, Building A (cyan/purple), Building B (magenta)
- **Neon city skyline** behind the horizon with procedural buildings and neon windows
- **Parallax stars** in sky

## Player Car
- **Responsive acceleration** (lerp toward target speed, 60ms feel)
- **Top speed**: 320 units/sec normal, 500 during boost
- **Drift mechanic**: hold Space/Shift while turning — speed maintained, sharper turning, visual lean
- **Drift scoring**: points accumulate continuously while drifting
- **Off-road penalty**: speed decay + push-back when beyond lane edges
- **Visual effects**: neon glow, lean/tilt, headlight beams, tail lights, boost exhaust flames
- **Invincibility flicker** after taking a hit

## Traffic
- **3 car types**: Slow (cyan), Mid (orange), Fast (yellow)
- **Object pooling**: 30-car pool, zero garbage collection
- **Dynamic spawn rate**: increases with player speed
- **Near-miss detection**: scored when player passes within 8–22% road width
- **Shockwave interaction**: all nearby cars ejected off-road

## Power-ups (all 7)
| Power-up | Duration | Effect |
|----------|----------|--------|
| **Nitro Surge** | 3.5s | +80% speed, brief invincibility |
| **Shockwave** | Instant | Pushes all visible traffic off road |
| **Time Slow** | 4s | World at 25% speed, player unaffected |
| **Shield** | Until hit | Absorbs 1 collision |
| **Score Multiplier** | 10s | Doubles score multiplier (stackable) |
| **Magnet** | 8s | Attracts power-ups at 2.5× radius |
| **Overdrive** | 5s | Max speed, plows through cars |

## Scoring
| Event | Points |
|-------|--------|
| Distance | 0.05 × speed × multiplier per unit |
| Drifting | 200 pts/sec × multiplier |
| Near-miss | 500 × multiplier |
| Combo steps | Every 5 combo events = +1× multiplier |
| Max multiplier | ×8 (×32 with Score Multiplier stacked) |

## Style Ranks
- **GOOD** (×1+)
- **COOL** (×2+)  
- **SICK** (×4+)
- **INSANE** (×6+)
- **LEGENDARY** (×8+)

## Unlockable Skins
| Skin | Unlock Score | Car Color | Trail |
|------|-------------|-----------|-------|
| Neon Pink | Default | Magenta | Cyan |
| Ghost Cyan | 10,000 | Cyan | White |
| Solar Flare | 25,000 | Orange | Yellow |
| Void Runner | 50,000 | Near-black | Purple |
| Aurora | 100,000 | White | Green |

## Visual Effects
- **Neon trail** (30-point trail with fade, drift = wider/brighter)
- **Expanding rings** on drift/boost
- **Speed lines** at >55% max speed, intensify toward max
- **Chromatic aberration** at >80% max speed
- **Drift sparks**: magenta/cyan particles
- **Boost flames**: yellow/orange exhaust
- **Crash debris**: 40 particles in all neon colors
- **Near-miss vignette**: cyan edge flash
- **Crash flash**: red screen flash
- **Camera shake**: crash (350ms, 0.018), boost (150ms, 0.006), shockwave (400ms, 0.022)
- **Time Slow overlay**: blue-purple desaturation + scanlines
- **Overdrive overlay**: red edge glow with pulsing inner border

## Audio (Procedural — No Files)
- **Engine hum**: sawtooth oscillator, 70–290 Hz mapped to speed
- **Engine filter**: lowpass opens at high speed (200→1000 Hz)
- **Drift screech**: bandpass-filtered noise burst (600 Hz)
- **Background music**: 
  - Bass layer: sawtooth root note (A-minor pentatonic)
  - Pad layer: 3× detuned square waves chord
  - Arpeggiator: triangle wave fast arpeggio (unlocks at 40% speed)
  - Chord progression: Am → F → C → G (4 second cycle)
  - Intensity scales with speed × multiplier
- **SFX**: near-miss arpeggio, crash thud+noise, power-up collect chord sweep, boost whoosh, shockwave

## Technical
- **Renderer**: WebGL (Phaser 3.80+)
- **Target**: 60 FPS stable
- **Resolution**: 1280×720, scales to fill any screen (FIT mode)
- **Object pooling**: traffic cars, particles (400-pool)
- **No external assets**: all textures and audio generated at runtime
- **localStorage**: top 5 high scores, skin unlocks, selected skin

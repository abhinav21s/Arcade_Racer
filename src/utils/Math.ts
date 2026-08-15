// ============================================================
// NEON ARCADE RACER — Math Utilities
// ============================================================

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value between min and max */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Map value from one range to another */
export function mapRange(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + (outMax - outMin) * ((val - inMin) / (inMax - inMin));
}

/** Smooth step (ease in-out) */
export function smoothStep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/** Percent (0→1) with smooth falloff */
export function percent(val: number, total: number): number {
  return total > 0 ? clamp(val / total, 0, 1) : 0;
}

/** Increase target toward max, lerp speed */
export function accelerate(current: number, target: number, accel: number, dt: number): number {
  return current + (target - current) * Math.min(accel * dt, 1);
}

/** Project 3D world point to 2D screen coordinates (OutRun-style) */
export function projectToScreen(
  worldX: number,   // Lateral world offset from road center
  worldY: number,   // Vertical world offset (road Y level)
  depth: number,    // Z distance from camera (must be > 0)
  camHeight: number,// Camera height above road
  camDepth: number, // Perspective depth factor (cameraDepth constant)
  screenW: number,
  screenH: number,
  roadWidth: number,
) {
  const scale = camDepth / depth;
  const screenX = Math.round((screenW / 2) + scale * (worldX) * (screenW / 2));
  const screenY = Math.round((screenH / 2) + scale * (camHeight - worldY) * (screenH / 2));
  const screenHalfW = Math.round(scale * roadWidth * (screenW / 2));
  return { x: screenX, y: screenY, w: screenHalfW, scale };
}

/** Random float in [min, max] */
export function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random int in [min, max] inclusive */
export function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}

/** Random item from array */
export function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Wrap value within [0, max) */
export function wrap(val: number, max: number): number {
  while (val < 0) val += max;
  return val % max;
}

/** Ease out cubic */
export function easeOut(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

/** Ease in cubic */
export function easeIn(t: number): number {
  return clamp(t, 0, 1) ** 3;
}

/** Convert hex color to rgb components (0-1 range) */
export function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >>  8) & 0xff) / 255,
    b: ((hex      ) & 0xff) / 255,
  };
}

/** Format large number with commas */
export function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

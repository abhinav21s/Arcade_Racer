// ============================================================
// NEON ARCADE RACER — Road Data Types
// ============================================================

export interface SegmentColors {
  grass:  number;
  road:   number;
  rumble: number;
  lane:   number;
}

export interface RoadSprite {
  type:       'building_a' | 'building_b' | 'lamp' | 'barrier' | 'billboard' | 'arch' | 'beacon';
  side:       'left' | 'right' | 'center';
  offset:     number;    // Lateral offset beyond road edge (normalized, 0=edge, 1=far offscreen)
  scale:      number;    // Visual scale factor
}

export interface RoadSegment {
  index:   number;        // Absolute segment index (monotonic)
  curve:   number;        // Lateral curve delta for this segment (world units)
  hill:    number;        // Vertical hill delta for this segment (world units)
  colors:  SegmentColors; // Color pair for alternating stripes
  sprites: RoadSprite[];  // Roadside decorations at this segment
}

export interface ProjectedPoint {
  x:     number;   // Screen X (road center)
  y:     number;   // Screen Y
  w:     number;   // Half-width of road in screen pixels
  scale: number;   // Perspective scale factor (useful for sprite sizing)
}

// ============================================================
// NEON ARCADE RACER — LocalStorage Save Data
// ============================================================

import type { HighScoreEntry } from '../types';
import { CAR_SKINS } from '../constants';

const KEYS = {
  HIGH_SCORES:    'nar_highscores',
  UNLOCKED_SKINS: 'nar_skins',
  SELECTED_SKIN:  'nar_skin_selected',
};

const MAX_HIGH_SCORES = 5;

// ---- High Scores ----
export function getHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEYS.HIGH_SCORES);
    if (!raw) return [];
    return JSON.parse(raw) as HighScoreEntry[];
  } catch {
    return [];
  }
}

export function saveHighScore(entry: HighScoreEntry): boolean {
  const scores = getHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, MAX_HIGH_SCORES);
  try {
    localStorage.setItem(KEYS.HIGH_SCORES, JSON.stringify(trimmed));
    return trimmed.indexOf(entry) !== -1;
  } catch {
    return false;
  }
}

export function isNewHighScore(score: number): boolean {
  const scores = getHighScores();
  if (scores.length < MAX_HIGH_SCORES) return true;
  return score > (scores[scores.length - 1]?.score ?? 0);
}

// ---- Skin Unlocks ----
export function getUnlockedSkins(): number[] {
  try {
    const raw = localStorage.getItem(KEYS.UNLOCKED_SKINS);
    if (!raw) return [0]; // Default skin always unlocked
    const parsed = JSON.parse(raw) as number[];
    if (!parsed.includes(0)) parsed.unshift(0);
    return parsed;
  } catch {
    return [0];
  }
}

export function unlockSkin(id: number): void {
  const unlocked = getUnlockedSkins();
  if (!unlocked.includes(id)) {
    unlocked.push(id);
    try {
      localStorage.setItem(KEYS.UNLOCKED_SKINS, JSON.stringify(unlocked));
    } catch { /* ignore */ }
  }
}

/** Check score against unlock thresholds, unlock new skins, return newly unlocked IDs */
export function checkAndUnlockSkins(score: number): number[] {
  const currentlyUnlocked = getUnlockedSkins();
  const newlyUnlocked: number[] = [];
  for (const skin of CAR_SKINS) {
    if (skin.unlockScore > 0 && score >= skin.unlockScore && !currentlyUnlocked.includes(skin.id)) {
      unlockSkin(skin.id);
      newlyUnlocked.push(skin.id);
    }
  }
  return newlyUnlocked;
}

// ---- Selected Skin ----
export function getSelectedSkin(): number {
  try {
    const raw = localStorage.getItem(KEYS.SELECTED_SKIN);
    return raw !== null ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function setSelectedSkin(id: number): void {
  try {
    localStorage.setItem(KEYS.SELECTED_SKIN, String(id));
  } catch { /* ignore */ }
}

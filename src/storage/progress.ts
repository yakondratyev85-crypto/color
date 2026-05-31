import type { IconId, ItemSlot, PlayerProgress } from '../game/types';

const STORAGE_KEY = 'math-knight-progress-v1';

export const defaultProgress: PlayerProgress = {
  xp: 0,
  coins: 60,
  heroLevel: 1,
  hearts: 3,
  unlockedLocations: ['greenwood'],
  purchasedItems: ['sword_wood'],
  equipped: { weapon: 'sword_wood' },
  collection: ['hero_basic', 'slime', 'sword_wood', 'shield_wood', 'chest_free', 'coin', 'xp', 'heart'],
  stats: { correct: 0, wrong: 0, bestStreak: 0, currentStreak: 0, wrongStreak: 0, battlesWon: 0, perfectBattles: 0 },
};

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress;
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      ...defaultProgress,
      ...parsed,
      stats: { ...defaultProgress.stats, ...parsed.stats },
      equipped: { ...defaultProgress.equipped, ...parsed.equipped } as Partial<Record<ItemSlot, string>>,
      collection: Array.from(new Set([...(defaultProgress.collection as IconId[]), ...((parsed.collection ?? []) as IconId[])])),
    };
  } catch {
    return defaultProgress;
  }
}

export function saveProgress(progress: PlayerProgress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function xpForLevel(level: number) {
  return 80 + (level - 1) * 45;
}

export function normalizeProgress(progress: PlayerProgress): PlayerProgress {
  let next = { ...progress, stats: { ...progress.stats } };
  while (next.xp >= xpForLevel(next.heroLevel)) {
    next = {
      ...next,
      xp: next.xp - xpForLevel(next.heroLevel),
      heroLevel: next.heroLevel + 1,
      hearts: Math.min(8, next.hearts + 1),
    };
  }
  return next;
}

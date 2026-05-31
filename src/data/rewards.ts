import type { Chest } from '../game/types';

export const chests: Chest[] = [
  { id: 'chest_free', name: 'Свободный сундук', icon: 'chest_free', coinMin: 8, coinMax: 18, xpMin: 4, xpMax: 10, itemChance: 0.08 },
  { id: 'chest_magic', name: 'Магический сундук', icon: 'chest_magic', coinMin: 18, coinMax: 36, xpMin: 10, xpMax: 20, itemChance: 0.18 },
  { id: 'chest_gold', name: 'Золотой ларец', icon: 'chest_gold', coinMin: 35, coinMax: 70, xpMin: 18, xpMax: 34, itemChance: 0.32 },
  { id: 'chest_boss', name: 'Босс-сундук', icon: 'chest_boss', coinMin: 70, coinMax: 130, xpMin: 35, xpMax: 60, itemChance: 0.55 },
];

export const chestById = Object.fromEntries(chests.map((chest) => [chest.id, chest])) as Record<string, Chest>;

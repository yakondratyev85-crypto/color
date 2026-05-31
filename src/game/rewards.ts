import { chests, chestById } from '../data/rewards';
import { items } from '../data/items';
import type { Chest, IconId, PlayerProgress, VictoryReward } from './types';

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rollVictoryReward(difficulty: number, perfect: boolean, isBoss: boolean): VictoryReward {
  const xp = 10 + difficulty * 5 + (perfect ? 6 : 0);
  const coins = 12 + difficulty * 6 + (perfect ? 8 : 0);
  const chestChance = Math.min(0.18 + difficulty * 0.04 + (perfect ? 0.18 : 0) + (isBoss ? 0.35 : 0), 0.9);
  let chestId: string | undefined;
  if (Math.random() < chestChance) {
    chestId = isBoss ? 'chest_boss' : difficulty > 5 ? 'chest_gold' : difficulty > 2 ? 'chest_magic' : 'chest_free';
  }
  return { xp, coins, chestId };
}

export function openChest(chestId: string, progress: PlayerProgress): { reward: VictoryReward; chest: Chest } {
  const chest = chestById[chestId] ?? chests[0];
  const reward: VictoryReward = {
    coins: rand(chest.coinMin, chest.coinMax),
    xp: rand(chest.xpMin, chest.xpMax),
  };
  if (Math.random() < chest.itemChance) {
    const locked = items.filter((item) => !progress.purchasedItems.includes(item.id));
    const item = locked[rand(0, Math.max(0, locked.length - 1))];
    if (item) {
      reward.itemId = item.id;
      reward.unlockedIcon = item.icon as IconId;
    }
  }
  return { reward, chest };
}

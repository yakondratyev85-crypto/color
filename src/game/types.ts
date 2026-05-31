export type Screen = 'home' | 'map' | 'mode' | 'battle' | 'victory' | 'chest' | 'shop' | 'collection';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemSlot = 'weapon' | 'shield' | 'helmet';
export type MathModeId = 'add10' | 'add20' | 'subtract' | 'missing' | 'compare' | 'multiply' | 'divide' | 'boss';
export type IconId =
  | 'hero_basic' | 'hero_paladin' | 'hero_dark' | 'mage' | 'ranger' | 'assassin'
  | 'slime' | 'wolf' | 'goblin' | 'skeleton' | 'golem' | 'bat' | 'ghost' | 'mushroom' | 'boss'
  | 'sword_wood' | 'sword_iron' | 'sword_crystal' | 'staff_fire'
  | 'shield_wood' | 'shield_round' | 'shield_knight' | 'shield_paladin'
  | 'helmet' | 'helmet_steel' | 'helmet_dragon'
  | 'chest_free' | 'chest_magic' | 'chest_gold' | 'chest_boss'
  | 'coin' | 'xp' | 'heart' | 'timer' | 'key' | 'lock'
  | 'math_add' | 'math_subtract' | 'math_missing' | 'math_compare' | 'math_multiply' | 'math_divide' | 'math_boss' | 'achievement';

export interface Hero { id: string; name: string; icon: IconId; }
export interface Enemy { id: string; name: string; icon: IconId; baseHp: number; }
export interface Location { id: string; name: string; subtitle: string; age: string; math: string; icon: IconId; difficulty: number; enemyIds: string[]; unlockLevel: number; }
export interface MathMode { id: MathModeId; title: string; description: string; icon: IconId; action: string; minLocation: number; }
export interface Item { id: string; name: string; slot: ItemSlot; price: number; rarity: Rarity; bonus: string; power: number; icon: IconId; }
export interface Chest { id: string; name: string; icon: IconId; coinMin: number; coinMax: number; xpMin: number; xpMax: number; itemChance: number; }
export interface Question { prompt: string; answer: number | string; options: Array<number | string>; action: string; }
export interface BattleState { heroHp: number; monsterHp: number; maxHeroHp: number; maxMonsterHp: number; question: Question; message: string; mistakes: number; correct: number; perfect: boolean; }
export interface VictoryReward { xp: number; coins: number; chestId?: string; itemId?: string; unlockedIcon?: IconId; }
export interface PlayerProgress {
  xp: number;
  coins: number;
  heroLevel: number;
  hearts: number;
  unlockedLocations: string[];
  purchasedItems: string[];
  equipped: Partial<Record<ItemSlot, string>>;
  collection: IconId[];
  stats: { correct: number; wrong: number; bestStreak: number; currentStreak: number; wrongStreak: number; battlesWon: number; perfectBattles: number; };
}

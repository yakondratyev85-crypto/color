import type { Item } from '../game/types';

export const items: Item[] = [
  { id: 'sword_wood', name: 'Деревянный меч', slot: 'weapon', price: 25, rarity: 'common', bonus: '+2 к удару', power: 2, icon: 'sword_wood' },
  { id: 'sword_iron', name: 'Железный меч', slot: 'weapon', price: 80, rarity: 'rare', bonus: '+5 к удару', power: 5, icon: 'sword_iron' },
  { id: 'sword_crystal', name: 'Алмазный клинок', slot: 'weapon', price: 180, rarity: 'epic', bonus: '+9 к удару', power: 9, icon: 'sword_crystal' },
  { id: 'staff_fire', name: 'Огненный посох', slot: 'weapon', price: 220, rarity: 'legendary', bonus: '+12 к магии', power: 12, icon: 'staff_fire' },
  { id: 'shield_wood', name: 'Деревянный щит', slot: 'shield', price: 30, rarity: 'common', bonus: '+8 HP', power: 8, icon: 'shield_wood' },
  { id: 'shield_round', name: 'Круглый щит', slot: 'shield', price: 70, rarity: 'rare', bonus: '+14 HP', power: 14, icon: 'shield_round' },
  { id: 'shield_knight', name: 'Рыцарский щит', slot: 'shield', price: 130, rarity: 'epic', bonus: '+22 HP', power: 22, icon: 'shield_knight' },
  { id: 'shield_paladin', name: 'Щит паладина', slot: 'shield', price: 240, rarity: 'legendary', bonus: '+32 HP', power: 32, icon: 'shield_paladin' },
  { id: 'helmet', name: 'Кожаный шлем', slot: 'helmet', price: 35, rarity: 'common', bonus: '+1 сердце', power: 1, icon: 'helmet' },
  { id: 'helmet_steel', name: 'Стальной шлем', slot: 'helmet', price: 100, rarity: 'rare', bonus: '+2 сердца', power: 2, icon: 'helmet_steel' },
  { id: 'helmet_dragon', name: 'Драконий шлем', slot: 'helmet', price: 260, rarity: 'legendary', bonus: '+4 сердца', power: 4, icon: 'helmet_dragon' },
];

export const itemById = Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, Item>;

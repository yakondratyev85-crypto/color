import type { Enemy } from '../game/types';

export const enemies: Enemy[] = [
  { id: 'slime', name: 'Липкий слизень', icon: 'slime', baseHp: 18 },
  { id: 'mushroom', name: 'Гриб-прыгучка', icon: 'mushroom', baseHp: 20 },
  { id: 'wolf', name: 'Серый волк', icon: 'wolf', baseHp: 24 },
  { id: 'goblin', name: 'Гоблин-счётчик', icon: 'goblin', baseHp: 28 },
  { id: 'bat', name: 'Ночная мышь', icon: 'bat', baseHp: 30 },
  { id: 'skeleton', name: 'Скелет с абаком', icon: 'skeleton', baseHp: 34 },
  { id: 'golem', name: 'Каменный голем', icon: 'golem', baseHp: 42 },
  { id: 'ghost', name: 'Призрак ошибок', icon: 'ghost', baseHp: 38 },
  { id: 'boss', name: 'Дракон деления', icon: 'boss', baseHp: 56 },
];

export const enemyById = Object.fromEntries(enemies.map((enemy) => [enemy.id, enemy])) as Record<string, Enemy>;

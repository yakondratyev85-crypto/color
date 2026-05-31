import type { Location } from '../game/types';

export const locations: Location[] = [
  { id: 'greenwood', name: 'Зеленая Опушка', subtitle: 'Первые удары мечом', age: '5+', math: 'Сложение до 10', icon: 'slime', difficulty: 1, enemyIds: ['slime', 'mushroom'], unlockLevel: 1 },
  { id: 'griffon', name: 'Грифонова Опушка', subtitle: 'Быстрые руны', age: '6+', math: 'Сложение до 20', icon: 'wolf', difficulty: 2, enemyIds: ['wolf', 'mushroom'], unlockLevel: 2 },
  { id: 'stone', name: 'Каменные Чертоги', subtitle: 'Щит и вычитание', age: '6+', math: 'Вычитание', icon: 'golem', difficulty: 3, enemyIds: ['goblin', 'golem'], unlockLevel: 3 },
  { id: 'fear', name: 'Пещера Страха', subtitle: 'Пропавшие числа', age: '7+', math: 'Пропущенное число', icon: 'bat', difficulty: 4, enemyIds: ['bat', 'skeleton'], unlockLevel: 4 },
  { id: 'ice', name: 'Ледяное Ущелье', subtitle: 'Дуэль силы', age: '7+', math: 'Сравнение чисел', icon: 'ghost', difficulty: 5, enemyIds: ['ghost', 'golem'], unlockLevel: 5 },
  { id: 'shadow', name: 'Теневой Шпиль', subtitle: 'Комбо-умножение', age: '8+', math: 'Умножение', icon: 'skeleton', difficulty: 6, enemyIds: ['skeleton', 'ghost'], unlockLevel: 6 },
  { id: 'storm', name: 'Грозовая Свита', subtitle: 'Дракон деления', age: '9+', math: 'Деление и босс', icon: 'boss', difficulty: 7, enemyIds: ['boss'], unlockLevel: 7 },
];

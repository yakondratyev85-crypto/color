import type { MathMode } from '../game/types';

export const mathModes: MathMode[] = [
  { id: 'add10', title: 'Сложение до 10', description: 'Удар мечом по простым суммам.', icon: 'math_add', action: 'Сложение = удар мечом', minLocation: 1 },
  { id: 'add20', title: 'Сложение до 20', description: 'Сильный выпад с большими числами.', icon: 'math_add', action: 'Сложение = двойной удар', minLocation: 2 },
  { id: 'subtract', title: 'Вычитание', description: 'Поставь щит и посчитай остаток HP.', icon: 'math_subtract', action: 'Вычитание = блок щитом', minLocation: 2 },
  { id: 'missing', title: 'Пропущенное число', description: 'Найди магическую руну в примере.', icon: 'math_missing', action: 'Пропуск = найти руну', minLocation: 3 },
  { id: 'compare', title: 'Сравнение чисел', description: 'Выбери, чья сила больше.', icon: 'math_compare', action: 'Сравнение = дуэль силы', minLocation: 3 },
  { id: 'multiply', title: 'Умножение', description: 'Собери комбо-удар.', icon: 'math_multiply', action: 'Умножение = комбо-удар', minLocation: 5 },
  { id: 'divide', title: 'Деление', description: 'Раздели добычу честно.', icon: 'math_divide', action: 'Деление = разделить добычу', minLocation: 6 },
  { id: 'boss', title: 'Босс-бой', description: 'Пять задач подряд против босса.', icon: 'math_boss', action: 'Босс = серия вопросов', minLocation: 7 },
];

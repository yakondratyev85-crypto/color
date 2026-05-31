import type { MathModeId, Question } from '../game/types';

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function optionsFor(answer: number | string, spread = 8): Array<number | string> {
  if (typeof answer === 'string') {
    return shuffle(['>', '<', '=', answer].filter((value, index, arr) => arr.indexOf(value) === index)).slice(0, 4);
  }
  const options = new Set<number>([answer]);
  while (options.size < 4) {
    const delta = rand(-spread, spread) || 1;
    options.add(Math.max(0, answer + delta));
  }
  return shuffle([...options]);
}

export function generateQuestion(mode: MathModeId, difficulty: number, wrongStreak: number): Question {
  const d = Math.max(1, difficulty - (wrongStreak >= 3 ? 1 : 0));
  const cap10 = 10;
  const cap20 = 14 + d * 3;
  const addCap = mode === 'add10' ? cap10 : Math.min(35, cap20);

  if (mode === 'subtract') {
    const a = rand(6, 10 + d * 4);
    const b = rand(1, Math.max(2, a - 1));
    const answer = a - b;
    return { prompt: `${a} − ${b} = ?`, answer, options: optionsFor(answer), action: 'Блок щитом: сколько HP осталось?' };
  }

  if (mode === 'missing') {
    const a = rand(1, 6 + d * 2);
    const answer = rand(1, 6 + d * 2);
    const total = a + answer;
    return { prompt: `${a} + ? = ${total}`, answer, options: optionsFor(answer), action: 'Найди магическую руну.' };
  }

  if (mode === 'compare') {
    const a = rand(1, 12 + d * 5);
    const b = rand(1, 12 + d * 5);
    const answer = a === b ? '=' : a > b ? '>' : '<';
    return { prompt: `${a} ? ${b}`, answer, options: shuffle(['>', '<', '=', String(Math.max(a, b))]), action: 'Дуэль силы: выбери знак.' };
  }

  if (mode === 'multiply') {
    const a = rand(2, Math.min(10, 3 + d));
    const b = rand(2, Math.min(10, 4 + d));
    const answer = a * b;
    return { prompt: `${a} × ${b} = ?`, answer, options: optionsFor(answer, 14), action: 'Комбо-удар умножения!' };
  }

  if (mode === 'divide') {
    const b = rand(2, Math.min(10, 4 + d));
    const answer = rand(2, Math.min(10, 4 + d));
    const a = b * answer;
    return { prompt: `${a} ÷ ${b} = ?`, answer, options: optionsFor(answer, 8), action: 'Раздели добычу честно.' };
  }

  if (mode === 'boss') {
    const modes: MathModeId[] = ['add20', 'subtract', 'missing', 'compare', 'multiply', 'divide'];
    return generateQuestion(modes[rand(0, modes.length - 1)], difficulty + 1, wrongStreak);
  }

  const a = rand(1, addCap);
  const b = rand(1, addCap);
  const answer = a + b;
  return { prompt: `${a} + ${b} = ?`, answer, options: optionsFor(answer), action: 'Удар мечом: реши сумму!' };
}

import type { IconId } from '../game/types';

export interface GameIcon {
  label: string;
  emoji: string;
  gradient: string;
  outline?: string;
}

export const icons: Record<IconId, GameIcon> = {
  hero_basic: { label: 'Рыцарь', emoji: '🛡️', gradient: 'linear-gradient(135deg,#dbeafe,#60a5fa)' },
  hero_paladin: { label: 'Паладин', emoji: '⚔️', gradient: 'linear-gradient(135deg,#fef3c7,#f59e0b)' },
  hero_dark: { label: 'Тёмный герой', emoji: '🦇', gradient: 'linear-gradient(135deg,#c4b5fd,#4c1d95)' },
  mage: { label: 'Маг', emoji: '🧙', gradient: 'linear-gradient(135deg,#e9d5ff,#a855f7)' },
  ranger: { label: 'Лучник', emoji: '🏹', gradient: 'linear-gradient(135deg,#bbf7d0,#22c55e)' },
  assassin: { label: 'Разбойник', emoji: '🗡️', gradient: 'linear-gradient(135deg,#e5e7eb,#64748b)' },
  slime: { label: 'Слизень', emoji: '🟢', gradient: 'linear-gradient(135deg,#dcfce7,#22c55e)' },
  wolf: { label: 'Волк', emoji: '🐺', gradient: 'linear-gradient(135deg,#e5e7eb,#94a3b8)' },
  goblin: { label: 'Гоблин', emoji: '👺', gradient: 'linear-gradient(135deg,#fde68a,#84cc16)' },
  skeleton: { label: 'Скелет', emoji: '💀', gradient: 'linear-gradient(135deg,#f8fafc,#94a3b8)' },
  golem: { label: 'Голем', emoji: '🪨', gradient: 'linear-gradient(135deg,#d6d3d1,#78716c)' },
  bat: { label: 'Летучая мышь', emoji: '🦇', gradient: 'linear-gradient(135deg,#ddd6fe,#312e81)' },
  ghost: { label: 'Призрак', emoji: '👻', gradient: 'linear-gradient(135deg,#cffafe,#67e8f9)' },
  mushroom: { label: 'Гриб', emoji: '🍄', gradient: 'linear-gradient(135deg,#fecaca,#ef4444)' },
  boss: { label: 'Босс', emoji: '🐲', gradient: 'linear-gradient(135deg,#fecaca,#7f1d1d)' },
  sword_wood: { label: 'Деревянный меч', emoji: '🪵', gradient: 'linear-gradient(135deg,#fed7aa,#92400e)' },
  sword_iron: { label: 'Железный меч', emoji: '⚔️', gradient: 'linear-gradient(135deg,#e2e8f0,#64748b)' },
  sword_crystal: { label: 'Алмазный клинок', emoji: '💎', gradient: 'linear-gradient(135deg,#ccfbf1,#06b6d4)' },
  staff_fire: { label: 'Огненный посох', emoji: '🔥', gradient: 'linear-gradient(135deg,#fed7aa,#dc2626)' },
  shield_wood: { label: 'Деревянный щит', emoji: '🛡️', gradient: 'linear-gradient(135deg,#fde68a,#a16207)' },
  shield_round: { label: 'Круглый щит', emoji: '🔘', gradient: 'linear-gradient(135deg,#bfdbfe,#2563eb)' },
  shield_knight: { label: 'Рыцарский щит', emoji: '🛡️', gradient: 'linear-gradient(135deg,#dbeafe,#1d4ed8)' },
  shield_paladin: { label: 'Щит паладина', emoji: '🌟', gradient: 'linear-gradient(135deg,#fef08a,#f97316)' },
  helmet: { label: 'Кожаный шлем', emoji: '⛑️', gradient: 'linear-gradient(135deg,#fed7aa,#7c2d12)' },
  helmet_steel: { label: 'Стальной шлем', emoji: '🪖', gradient: 'linear-gradient(135deg,#f1f5f9,#64748b)' },
  helmet_dragon: { label: 'Драконий шлем', emoji: '🐉', gradient: 'linear-gradient(135deg,#fecaca,#b91c1c)' },
  chest_free: { label: 'Свободный сундук', emoji: '🎁', gradient: 'linear-gradient(135deg,#fde68a,#f59e0b)' },
  chest_magic: { label: 'Магический сундук', emoji: '🔮', gradient: 'linear-gradient(135deg,#e9d5ff,#8b5cf6)' },
  chest_gold: { label: 'Золотой ларец', emoji: '🧰', gradient: 'linear-gradient(135deg,#fef3c7,#f59e0b)' },
  chest_boss: { label: 'Босс-сундук', emoji: '🏆', gradient: 'linear-gradient(135deg,#fecaca,#f97316)' },
  coin: { label: 'Монеты', emoji: '🪙', gradient: 'linear-gradient(135deg,#fef08a,#f59e0b)' },
  xp: { label: 'XP', emoji: '⭐', gradient: 'linear-gradient(135deg,#dbeafe,#4f46e5)' },
  heart: { label: 'HP', emoji: '❤️', gradient: 'linear-gradient(135deg,#fecaca,#ef4444)' },
  timer: { label: 'Таймер', emoji: '⏱️', gradient: 'linear-gradient(135deg,#e0f2fe,#0284c7)' },
  key: { label: 'Ключ', emoji: '🔑', gradient: 'linear-gradient(135deg,#fef3c7,#ca8a04)' },
  lock: { label: 'Замок', emoji: '🔒', gradient: 'linear-gradient(135deg,#e5e7eb,#64748b)' },
  math_add: { label: 'Сложение', emoji: '➕', gradient: 'linear-gradient(135deg,#dcfce7,#22c55e)' },
  math_subtract: { label: 'Вычитание', emoji: '➖', gradient: 'linear-gradient(135deg,#fee2e2,#ef4444)' },
  math_missing: { label: 'Руна', emoji: '❔', gradient: 'linear-gradient(135deg,#fef3c7,#f97316)' },
  math_compare: { label: 'Дуэль', emoji: '⚖️', gradient: 'linear-gradient(135deg,#dbeafe,#2563eb)' },
  math_multiply: { label: 'Комбо', emoji: '✖️', gradient: 'linear-gradient(135deg,#ede9fe,#7c3aed)' },
  math_divide: { label: 'Деление', emoji: '➗', gradient: 'linear-gradient(135deg,#ccfbf1,#0f766e)' },
  math_boss: { label: 'Босс-бой', emoji: '👑', gradient: 'linear-gradient(135deg,#fecaca,#991b1b)' },
  achievement: { label: 'Достижение', emoji: '🏅', gradient: 'linear-gradient(135deg,#fef9c3,#eab308)' },
};

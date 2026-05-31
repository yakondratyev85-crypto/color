import { icons } from '../assets/iconRegistry';
import type { IconId } from '../game/types';

interface Props {
  id: IconId;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  locked?: boolean;
}

export function GameIcon({ id, size = 'md', locked = false }: Props) {
  const icon = icons[id];
  return (
    <span className={`game-icon game-icon--${size} ${locked ? 'game-icon--locked' : ''}`} style={{ background: icon.gradient }} aria-label={icon.label} role="img">
      <span>{locked ? '🔒' : icon.emoji}</span>
    </span>
  );
}

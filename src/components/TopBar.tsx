import type { PlayerProgress } from '../game/types';
import { GameIcon } from './GameIcon';

export function TopBar({ progress }: { progress: PlayerProgress }) {
  return (
    <div className="topbar">
      <div className="pill"><GameIcon id="coin" size="sm" /> {progress.coins}</div>
      <div className="pill"><GameIcon id="xp" size="sm" /> XP {progress.xp}</div>
      <div className="pill"><GameIcon id="heart" size="sm" /> {progress.hearts}</div>
      <div className="pill level-pill">Lv {progress.heroLevel}</div>
    </div>
  );
}

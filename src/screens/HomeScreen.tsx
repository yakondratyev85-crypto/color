import type { PlayerProgress } from '../game/types';
import { BigButton } from '../components/BigButton';
import { GameIcon } from '../components/GameIcon';
import { TopBar } from '../components/TopBar';

export function HomeScreen({ progress, onStart, onShop, onCollection }: { progress: PlayerProgress; onStart: () => void; onShop: () => void; onCollection: () => void }) {
  return (
    <section className="screen home-screen">
      <TopBar progress={progress} />
      <div className="hero-card">
        <div className="sparkle">✦ ✧ ✦</div>
        <h1>Math Knight</h1>
        <p>Математический рыцарь</p>
        <GameIcon id="hero_basic" size="hero" />
        <div className="mini-banner">Решай примеры — бей монстров — собирай награды!</div>
      </div>
      <div className="button-stack">
        <BigButton onClick={onStart}>Начать приключение</BigButton>
        <BigButton onClick={onCollection} variant="secondary">Коллекция</BigButton>
        <BigButton onClick={onShop} variant="ghost">Магазин</BigButton>
      </div>
    </section>
  );
}

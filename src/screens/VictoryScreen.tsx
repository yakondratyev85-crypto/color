import { BigButton } from '../components/BigButton';
import { GameIcon } from '../components/GameIcon';
import type { Enemy, VictoryReward } from '../game/types';

export function VictoryScreen({ enemy, reward, onContinue, onOpenChest }: { enemy: Enemy; reward: VictoryReward; onContinue: () => void; onOpenChest: () => void }) {
  return (
    <section className="screen victory-screen">
      <div className="hero-card reward-card">
        <h2>Победа!</h2>
        <p>{enemy.name} побеждён</p>
        <GameIcon id={enemy.icon} size="hero" />
        <div className="reward-row"><span>⭐ +{reward.xp} XP</span><span>🪙 +{reward.coins}</span></div>
        <div className="mini-banner">Шанс сундука выше, если бой без ошибок.</div>
      </div>
      <div className="button-stack">
        {reward.chestId && <BigButton onClick={onOpenChest}>Открыть сундук</BigButton>}
        <BigButton onClick={onContinue} variant={reward.chestId ? 'secondary' : 'primary'}>Продолжить</BigButton>
      </div>
    </section>
  );
}

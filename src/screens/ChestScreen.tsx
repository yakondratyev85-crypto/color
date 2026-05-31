import { BigButton } from '../components/BigButton';
import { GameIcon } from '../components/GameIcon';
import { chestById } from '../data/rewards';
import { itemById } from '../data/items';
import type { VictoryReward } from '../game/types';

export function ChestScreen({ chestId, reward, onDone }: { chestId: string; reward: VictoryReward; onDone: () => void }) {
  const chest = chestById[chestId];
  const item = reward.itemId ? itemById[reward.itemId] : undefined;
  return (
    <section className="screen victory-screen">
      <div className="hero-card reward-card chest-pop">
        <h2>{chest.name}</h2>
        <GameIcon id={chest.icon} size="hero" />
        <div className="reward-row"><span>⭐ +{reward.xp}</span><span>🪙 +{reward.coins}</span></div>
        {item ? <div className="loot"><GameIcon id={item.icon} size="lg" /><b>{item.name}</b><span>{item.bonus}</span></div> : <p>В сундуке только монеты и XP — тоже полезно!</p>}
      </div>
      <BigButton onClick={onDone}>Забрать награду</BigButton>
    </section>
  );
}

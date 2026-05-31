import { BigButton } from '../components/BigButton';
import { Card } from '../components/Card';
import { GameIcon } from '../components/GameIcon';
import { TopBar } from '../components/TopBar';
import { items } from '../data/items';
import type { Item, PlayerProgress } from '../game/types';

export function ShopScreen({ progress, onBack, onBuy, onEquip }: { progress: PlayerProgress; onBack: () => void; onBuy: (item: Item) => void; onEquip: (item: Item) => void }) {
  return (
    <section className="screen">
      <TopBar progress={progress} />
      <div className="screen-title"><button className="back" onClick={onBack}>←</button><div><h2>Магазин</h2><p>Купи и надень fantasy-снаряжение</p></div></div>
      <div className="list">
        {items.map((item) => {
          const owned = progress.purchasedItems.includes(item.id);
          const equipped = progress.equipped[item.slot] === item.id;
          return (
            <Card key={item.id} className={`shop-card rarity-${item.rarity}`}>
              <GameIcon id={item.icon} size="lg" />
              <div className="card-copy"><h3>{item.name}</h3><p>{item.bonus}</p><span>{item.rarity} · 🪙 {item.price}</span></div>
              {owned ? <BigButton variant={equipped ? 'ghost' : 'secondary'} onClick={() => onEquip(item)}>{equipped ? 'Надето' : 'Надеть'}</BigButton> : <BigButton onClick={() => onBuy(item)} disabled={progress.coins < item.price}>Купить</BigButton>}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

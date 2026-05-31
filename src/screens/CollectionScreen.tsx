import { GameIcon } from '../components/GameIcon';
import { TopBar } from '../components/TopBar';
import type { IconId, PlayerProgress } from '../game/types';

const sections: Array<{ title: string; ids: IconId[] }> = [
  { title: 'Герои', ids: ['hero_basic', 'hero_paladin', 'hero_dark', 'mage', 'ranger', 'assassin'] },
  { title: 'Враги', ids: ['slime', 'wolf', 'goblin', 'skeleton', 'golem', 'bat', 'ghost', 'mushroom', 'boss'] },
  { title: 'Предметы', ids: ['sword_wood', 'sword_iron', 'sword_crystal', 'staff_fire', 'shield_wood', 'shield_knight', 'helmet', 'helmet_dragon'] },
  { title: 'Сундуки', ids: ['chest_free', 'chest_magic', 'chest_gold', 'chest_boss'] },
  { title: 'Достижения', ids: ['achievement', 'coin', 'xp', 'heart', 'timer', 'key'] },
];

export function CollectionScreen({ progress, onBack }: { progress: PlayerProgress; onBack: () => void }) {
  return (
    <section className="screen">
      <TopBar progress={progress} />
      <div className="screen-title"><button className="back" onClick={onBack}>←</button><div><h2>Коллекция</h2><p>Открывай иконки, героев и добычу</p></div></div>
      {sections.map((section) => (
        <div className="collection-section" key={section.title}>
          <h3>{section.title}</h3>
          <div className="icon-grid">
            {section.ids.map((id) => <GameIcon key={id} id={progress.collection.includes(id) ? id : 'lock'} size="lg" locked={!progress.collection.includes(id)} />)}
          </div>
        </div>
      ))}
    </section>
  );
}

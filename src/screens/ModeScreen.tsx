import { Card } from '../components/Card';
import { GameIcon } from '../components/GameIcon';
import { mathModes } from '../data/mathModes';
import type { Location, MathMode, PlayerProgress } from '../game/types';
import { TopBar } from '../components/TopBar';

export function ModeScreen({ progress, location, onSelect, onBack }: { progress: PlayerProgress; location: Location; onSelect: (mode: MathMode) => void; onBack: () => void }) {
  return (
    <section className="screen">
      <TopBar progress={progress} />
      <div className="screen-title"><button className="back" onClick={onBack}>←</button><div><h2>{location.name}</h2><p>{location.math}: математика как действие</p></div></div>
      <div className="list mode-grid">
        {mathModes.map((mode) => {
          const available = location.difficulty >= mode.minLocation || mode.id === 'add10';
          return (
            <Card key={mode.id} locked={!available} onClick={() => available && onSelect(mode)} className="mode-card">
              <GameIcon id={available ? mode.icon : 'lock'} size="lg" locked={!available} />
              <div className="card-copy">
                <h3>{mode.title}</h3>
                <p>{mode.description}</p>
                <span>{mode.action}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

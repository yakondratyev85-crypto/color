import { Card } from '../components/Card';
import { GameIcon } from '../components/GameIcon';
import { TopBar } from '../components/TopBar';
import { locations } from '../data/locations';
import type { Location, PlayerProgress } from '../game/types';

export function MapScreen({ progress, onSelect, onBack }: { progress: PlayerProgress; onSelect: (location: Location) => void; onBack: () => void }) {
  return (
    <section className="screen">
      <TopBar progress={progress} />
      <div className="screen-title"><button className="back" onClick={onBack}>←</button><div><h2>Карта мира</h2><p>Выбери локацию для приключения</p></div></div>
      <div className="list">
        {locations.map((location) => {
          const unlocked = progress.unlockedLocations.includes(location.id) || progress.heroLevel >= location.unlockLevel;
          return (
            <Card key={location.id} locked={!unlocked} onClick={() => unlocked && onSelect(location)} className="location-card">
              <GameIcon id={unlocked ? location.icon : 'lock'} size="lg" locked={!unlocked} />
              <div className="card-copy">
                <h3>{location.name}</h3>
                <p>{location.subtitle}</p>
                <span>{location.age} · {location.math}</span>
              </div>
              <strong>{unlocked ? `Сложн. ${location.difficulty}` : `Lv ${location.unlockLevel}`}</strong>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

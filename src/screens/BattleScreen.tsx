import { GameIcon } from '../components/GameIcon';
import type { BattleState, Enemy, MathMode, PlayerProgress } from '../game/types';
import { TopBar } from '../components/TopBar';

export function BattleScreen({ progress, battle, enemy, mode, onAnswer, onBack }: { progress: PlayerProgress; battle: BattleState; enemy: Enemy; mode: MathMode; onAnswer: (answer: string | number) => void; onBack: () => void }) {
  const heroPercent = Math.max(0, (battle.heroHp / battle.maxHeroHp) * 100);
  const monsterPercent = Math.max(0, (battle.monsterHp / battle.maxMonsterHp) * 100);
  return (
    <section className="screen battle-screen">
      <TopBar progress={progress} />
      <div className="screen-title"><button className="back" onClick={onBack}>←</button><div><h2>Бой</h2><p>{mode.action}</p></div></div>
      <div className="hp-row">
        <div><span>Герой</span><div className="hp"><i style={{ width: `${heroPercent}%` }} /></div></div>
        <div><span>{enemy.name}</span><div className="hp hp--monster"><i style={{ width: `${monsterPercent}%` }} /></div></div>
      </div>
      <div className="arena">
        <div className="fighter"><GameIcon id="hero_basic" size="hero" /><b>Рыцарь</b></div>
        <div className="versus">⚡</div>
        <div className="fighter monster"><GameIcon id={enemy.icon} size="hero" /><b>{enemy.name}</b></div>
      </div>
      <div className="question-card">
        <small>{battle.question.action}</small>
        <div className="question">{battle.question.prompt}</div>
        <p>{battle.message}</p>
      </div>
      <div className="answers">
        {battle.question.options.map((option) => <button key={String(option)} onClick={() => onAnswer(option)}>{option}</button>)}
      </div>
    </section>
  );
}

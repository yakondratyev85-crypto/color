import { useEffect, useMemo, useState } from 'react';
import { enemies, enemyById } from '../data/enemies';
import { itemById } from '../data/items';
import { locations } from '../data/locations';
import { mathModes } from '../data/mathModes';
import { generateQuestion } from '../data/questions';
import { openChest, rollVictoryReward } from '../game/rewards';
import type { BattleState, Enemy, Item, Location, MathMode, PlayerProgress, Screen, VictoryReward } from '../game/types';
import { loadProgress, normalizeProgress, saveProgress } from '../storage/progress';
import { BattleScreen } from '../screens/BattleScreen';
import { ChestScreen } from '../screens/ChestScreen';
import { CollectionScreen } from '../screens/CollectionScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { ModeScreen } from '../screens/ModeScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { VictoryScreen } from '../screens/VictoryScreen';

function randomEnemy(location: Location): Enemy {
  const id = location.enemyIds[Math.floor(Math.random() * location.enemyIds.length)];
  return enemyById[id] ?? enemies[0];
}

function collectionAdd(progress: PlayerProgress, ids: string[]) {
  return Array.from(new Set([...progress.collection, ...ids])) as PlayerProgress['collection'];
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [location, setLocation] = useState<Location>(locations[0]);
  const [mode, setMode] = useState<MathMode>(mathModes[0]);
  const [enemy, setEnemy] = useState<Enemy>(enemies[0]);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [victory, setVictory] = useState<VictoryReward | null>(null);
  const [chestReward, setChestReward] = useState<VictoryReward | null>(null);
  const [openedChestId, setOpenedChestId] = useState<string>('chest_free');

  useEffect(() => saveProgress(progress), [progress]);

  const heroPower = useMemo(() => {
    const weapon = progress.equipped.weapon ? itemById[progress.equipped.weapon] : undefined;
    return 8 + progress.heroLevel * 2 + (weapon?.power ?? 0);
  }, [progress.equipped.weapon, progress.heroLevel]);

  function chooseLocation(nextLocation: Location) {
    setLocation(nextLocation);
    setScreen('mode');
  }

  function startBattle(nextMode: MathMode) {
    const nextEnemy = randomEnemy(location);
    const shield = progress.equipped.shield ? itemById[progress.equipped.shield] : undefined;
    const helmet = progress.equipped.helmet ? itemById[progress.equipped.helmet] : undefined;
    const maxHeroHp = 48 + progress.heroLevel * 8 + (shield?.power ?? 0) + (helmet?.power ?? 0) * 5;
    const maxMonsterHp = nextEnemy.baseHp + location.difficulty * 8 + (nextMode.id === 'boss' ? 30 : 0);
    setMode(nextMode);
    setEnemy(nextEnemy);
    setBattle({
      heroHp: maxHeroHp,
      monsterHp: maxMonsterHp,
      maxHeroHp,
      maxMonsterHp,
      question: generateQuestion(nextMode.id, location.difficulty, progress.stats.wrongStreak),
      message: 'Выбери ответ и начни атаку!',
      mistakes: 0,
      correct: 0,
      perfect: true,
    });
    setScreen('battle');
  }

  function finishBattle(finalBattle: BattleState) {
    const reward = rollVictoryReward(location.difficulty, finalBattle.perfect, mode.id === 'boss');
    setVictory(reward);
    setProgress((prev) => {
      const unlockedLocations = locations.filter((loc) => loc.unlockLevel <= prev.heroLevel + 1).map((loc) => loc.id);
      return normalizeProgress({
        ...prev,
        xp: prev.xp + reward.xp + (prev.stats.currentStreak >= 5 ? 5 : 0),
        coins: prev.coins + reward.coins,
        unlockedLocations: Array.from(new Set([...prev.unlockedLocations, ...unlockedLocations])),
        collection: collectionAdd(prev, [enemy.icon]),
        stats: {
          ...prev.stats,
          battlesWon: prev.stats.battlesWon + 1,
          perfectBattles: prev.stats.perfectBattles + (finalBattle.perfect ? 1 : 0),
        },
      });
    });
    setScreen('victory');
  }

  function answer(option: string | number) {
    if (!battle) return;
    const isCorrect = String(option) === String(battle.question.answer);
    const nextProgress = { ...progress, stats: { ...progress.stats } };
    let nextBattle = { ...battle };

    if (isCorrect) {
      const damage = heroPower + (progress.stats.currentStreak >= 4 ? 4 : 0);
      nextBattle.monsterHp = Math.max(0, nextBattle.monsterHp - damage);
      nextBattle.correct += 1;
      nextBattle.message = progress.stats.currentStreak >= 4 ? 'Комбо! Бонус XP уже близко!' : 'Отличный удар!';
      nextProgress.stats.correct += 1;
      nextProgress.stats.currentStreak += 1;
      nextProgress.stats.wrongStreak = 0;
      nextProgress.stats.bestStreak = Math.max(nextProgress.stats.bestStreak, nextProgress.stats.currentStreak);
    } else {
      const damage = Math.max(5, 7 + location.difficulty * 2 - (progress.equipped.shield ? 2 : 0));
      nextBattle.heroHp = Math.max(0, nextBattle.heroHp - damage);
      nextBattle.mistakes += 1;
      nextBattle.perfect = false;
      nextBattle.message = nextProgress.stats.wrongStreak >= 2 ? 'Попробуй ещё! Следующий пример проще.' : 'Щит выдержал, но монстр атаковал!';
      nextProgress.stats.wrong += 1;
      nextProgress.stats.currentStreak = 0;
      nextProgress.stats.wrongStreak += 1;
    }

    if (nextBattle.monsterHp <= 0 || (mode.id === 'boss' && nextBattle.correct >= 5)) {
      setProgress(nextProgress);
      finishBattle(nextBattle);
      return;
    }

    if (nextBattle.heroHp <= 0) {
      nextBattle = { ...nextBattle, heroHp: Math.ceil(nextBattle.maxHeroHp * 0.55), message: 'Сердце героя вспыхнуло! Продолжаем легче.' };
      nextProgress.stats.wrongStreak = 3;
    }

    nextBattle.question = generateQuestion(mode.id, location.difficulty, nextProgress.stats.wrongStreak);
    setProgress(nextProgress);
    setBattle(nextBattle);
  }

  function applyReward(reward: VictoryReward) {
    setProgress((prev) => normalizeProgress({
      ...prev,
      xp: prev.xp + reward.xp,
      coins: prev.coins + reward.coins,
      purchasedItems: reward.itemId ? Array.from(new Set([...prev.purchasedItems, reward.itemId])) : prev.purchasedItems,
      collection: collectionAdd(prev, [reward.unlockedIcon ?? 'chest_free'].filter(Boolean) as string[]),
    }));
  }

  function openRewardChest() {
    if (!victory?.chestId) return;
    const { reward } = openChest(victory.chestId, progress);
    setOpenedChestId(victory.chestId);
    setChestReward(reward);
    applyReward(reward);
    setScreen('chest');
  }

  function buy(item: Item) {
    if (progress.coins < item.price || progress.purchasedItems.includes(item.id)) return;
    setProgress((prev) => ({
      ...prev,
      coins: prev.coins - item.price,
      purchasedItems: [...prev.purchasedItems, item.id],
      collection: collectionAdd(prev, [item.icon]),
    }));
  }

  function equip(item: Item) {
    if (!progress.purchasedItems.includes(item.id)) return;
    setProgress((prev) => ({ ...prev, equipped: { ...prev.equipped, [item.slot]: item.id } }));
  }

  return (
    <main className="app-shell">
      {screen === 'home' && <HomeScreen progress={progress} onStart={() => setScreen('map')} onShop={() => setScreen('shop')} onCollection={() => setScreen('collection')} />}
      {screen === 'map' && <MapScreen progress={progress} onSelect={chooseLocation} onBack={() => setScreen('home')} />}
      {screen === 'mode' && <ModeScreen progress={progress} location={location} onSelect={startBattle} onBack={() => setScreen('map')} />}
      {screen === 'battle' && battle && <BattleScreen progress={progress} battle={battle} enemy={enemy} mode={mode} onAnswer={answer} onBack={() => setScreen('mode')} />}
      {screen === 'victory' && victory && <VictoryScreen enemy={enemy} reward={victory} onOpenChest={openRewardChest} onContinue={() => setScreen('map')} />}
      {screen === 'chest' && chestReward && <ChestScreen chestId={openedChestId} reward={chestReward} onDone={() => setScreen('map')} />}
      {screen === 'shop' && <ShopScreen progress={progress} onBack={() => setScreen('home')} onBuy={buy} onEquip={equip} />}
      {screen === 'collection' && <CollectionScreen progress={progress} onBack={() => setScreen('home')} />}
    </main>
  );
}

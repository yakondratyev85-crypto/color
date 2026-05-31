# Math Knight PWA

Math Knight — мобильная браузерная PWA-игра в стиле детской fantasy RPG для тренировки математики у детей 5–10 лет. Проект сделан как чистое React/Vite/TypeScript-приложение, которое можно запускать в браузере и позднее упаковать в Android через Capacitor.

## Стек

- React
- Vite
- TypeScript
- localStorage
- vite-plugin-pwa
- PWA manifest + offline-ready service worker
- Обычный CSS, mobile-first max-width 430px

## Установка

```bash
npm install
```

## Запуск разработки

```bash
npm run dev
```

Откройте URL из терминала, обычно:

```text
http://localhost:5173
```

## Сборка

```bash
npm run build
```

Проверка production-сборки:

```bash
npm run preview
```

## Что уже есть в прототипе

- Главный экран с героем, монетами, XP, уровнем и сердцами.
- Карта мира с 7 локациями и блокировками по уровню.
- Выбор математического режима.
- RPG-бой: герой, монстр, HP, пример, 4 варианта ответа.
- Генератор заданий для сложения, вычитания, пропущенного числа, сравнения, умножения, деления и босс-боя.
- Награды за победу: XP, монеты, шанс сундука.
- Сундуки с шансом предмета/иконки.
- Магазин с оружием, щитами и шлемами.
- Коллекция героев, врагов, предметов, сундуков и достижений.
- Прогресс в `localStorage`.
- Централизованный реестр временных иконок в `src/assets/iconRegistry.ts`.

## Структура проекта

```text
public/                 PWA-иконки и публичные ассеты
src/
  App.tsx               React entry point re-export для приложения
  main.tsx              Монтирует React в DOM
  app/                  Основной state-machine приложения
  assets/               iconRegistry.ts и будущие иконки
  components/           Переиспользуемые UI-блоки
  data/                 heroes, enemies, locations, items, math modes, rewards, questions
  game/                 Типы и reward logic
  screens/              Home, Map, Mode, Battle, Victory, Chest, Shop, Collection
  storage/              localStorage progress
  styles/               Global mobile-first game CSS
index.html              HTML-точка входа Vite
package.json            npm scripts и зависимости
vite.config.ts          Vite + PWA config
tsconfig.json           TypeScript project references
tsconfig.app.json       TypeScript config приложения
```

## Иконки

Сейчас используются временные emoji/SVG-style заглушки, но все они подключены через один файл:

```text
src/assets/iconRegistry.ts
```

Позже можно положить настоящие PNG/SVG в:

```text
src/assets/icons/
```

и заменить значения в реестре, не переписывая экраны.

## Математика как действие

- Сложение = удар мечом.
- Вычитание = блок щитом / остаток HP.
- Пропущенное число = поиск магической руны.
- Сравнение = дуэль силы.
- Умножение = комбо-удар.
- Деление = разделить добычу.
- Босс-бой = серия вопросов подряд.

## Android

Проект уже сделан как PWA. Следующий шаг для Android — добавить Capacitor:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
npx cap add android
npm run build
npx cap sync android
```

Backend, регистрация, реклама и реальные платежи не используются.

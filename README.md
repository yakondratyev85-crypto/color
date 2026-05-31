# Раскраска по номерам — оффлайн

Локальное веб-приложение, которое превращает изображение в шаблон «раскраски по номерам» без нейросетей и без отправки файлов на сервер. Вся обработка выполняется в браузере через Canvas API.

## Установка

Зависимости не требуются. Нужен браузер и локальный статический сервер.

```bash
npm install
```

Команда не устанавливает сторонние библиотеки: проект намеренно dependency-free.

## Запуск

```bash
npm start
```

Откройте страницу:

```text
http://localhost:4173
```

Можно запустить и без npm:

```bash
python3 -m http.server 4173
```

## Как пользоваться

1. Нажмите «Загрузить изображение» и выберите PNG/JPEG/WebP.
2. Настройте параметры:
   - количество цветов: 8–30, по умолчанию 18;
   - режим обработки: Auto / Photo / Flat Illustration;
   - цветовое пространство: Lab по умолчанию, RGB как быстрый режим;
   - уровень детализации: Clean Poster / Coloring Book / Detailed Art;
   - минимальную площадь области в процентах от изображения: 0.15–0.50%;
   - силу объединения похожих регионов;
   - силу сглаживания контуров;
   - сохранение важных границ и углов/прямых линий;
   - удаление текстурного шума и тонких sliver-регионов;
   - debug mode с метриками качества;
   - толщину контура и размер цифр.
3. Нажмите «Создать раскраску».
4. Проверьте исходник, цветовую карту и финальную раскраску.
5. Скачайте результат как PNG или SVG.

## Новый pipeline обработки

1. **Загрузка и масштабирование** — изображение уменьшается до 1200 px по длинной стороне.
2. **Image analysis** — оцениваются округленная палитра, покрытие доминирующих цветов, edge density и texture score.
3. **Mode selection** — Auto выбирает Photo или Flat Illustration. Flat-режим сохраняет исходные плоские формы и избегает агрессивной переквантизации, если палитра уже ограничена.
4. **Edge map** — строится Sobel-карта сильных границ. Она помогает сохранить глаза, нос, рот, силуэты и другие важные переходы.
5. **Preprocessing** — для Photo используется bilateral edge-preserving smoothing; для Flat Illustration используется мягкая median edge cleanup, чтобы не ломать архитектуру и плоские заливки.
6. **Color segmentation** — K-Means в Lab/RGB или rounded-palette segmentation для flat-изображений с ограниченной палитрой.
7. **Superpixel-like grouping** — несколько проходов edge-aware majority relaxation группируют соседние пиксели в крупные зоны без пересечения сильных границ.
8. **Region Adjacency Graph** — для connected components считаются id, color id, area, perimeter, bounding box, neighbors, compactness, bboxFillRatio и thinnessScore.
9. **Region cleanup / merge** — micro-regions, slivers и тонкие паразитные формы объединяются с лучшим соседом по color similarity, shared boundary, neighbor size, shape compatibility и important-edge penalty.
10. **Boundary graph** — строится промежуточный граф границ и оцениваются дублирующиеся ребра.
11. **Geometry reconstruction** — контуры извлекаются marching squares, упрощаются Ramer–Douglas–Peucker, выпрямляются почти горизонтальные/вертикальные участки, затем сглаживаются Chaikin-подобным методом с сохранением углов.
12. **Number placement** — номер ставится в visual center через distance transform и пропускается для узких/маленьких областей, чтобы цифры не пересекали контуры.
13. **SVG export** — контуры экспортируются как path, номера как text, а SVG группирует слои `contours`, `numbers`, `palette`, `debug`.

## Режимы и детализация

- **Auto** — анализирует изображение и выбирает Photo или Flat Illustration.
- **Photo** — сильнее подавляет текстуру и шерсть через bilateral filtering и более агрессивное объединение похожих областей.
- **Flat Illustration** — сохраняет крупные исходные плоские формы, меньше трогает четкие края и не переквантизирует агрессивно изображения с уже ограниченной палитрой.
- **Clean Poster** — максимально чистый печатный результат с крупными областями.
- **Coloring Book** — баланс детализации и чистоты, подходит по умолчанию.
- **Detailed Art** — сохраняет больше внутренних деталей, но может оставлять больше линий на текстурных изображениях.

## Debug mode и метрики качества

Debug mode показывает JSON-метрики:

- `totalRegions`;
- `microRegionCount`;
- `mergedRegionCount`;
- `sliverRegionCount`;
- `regionsWithoutNumbers`;
- `averageRegionArea`;
- `averageCompactness`;
- `averageContourPointCount`;
- `estimatedDuplicateEdges`;
- `staircaseScore`;
- `jitterScore`;
- `contourPointReduction`;
- признаки Auto-анализа изображения.

## Аудит текущей архитектуры

- Загрузка изображения: `loadImage` читает файл через `createImageBitmap`, масштабирует его до рабочего размера и кладет данные в Canvas.
- Анализ и preprocessing: `analyzeImage`, `buildEdgeMap`, `preprocessImage`, `bilateralFilter`, `medianEdgeCleanup`.
- Color segmentation: `segmentColors`, `roundedPaletteQuantize`, `kMeansQuantize`.
- Цветовая карта: `drawColorMap`, а в debug mode — `drawDebugRegionMap`.
- Области и RAG: `findComponents`, `buildRegionModel`, `cleanupRegionsWithRag`.
- Контуры: `marchingSquares`, `reconstructContour`, `straightenContour`, `smoothPathPreserveCorners`.
- Номера: `findVisualCenter`, `shouldPlaceNumber`.
- Экспорт: `downloadPng`, `downloadSvg`, `makeSvg`.

## Ограничения первой версии

- Bilateral filter и K-Means считаются в главном потоке браузера, поэтому большие фото могут обрабатываться несколько секунд.
- Алгоритм не распознает семантику объектов: «важность» границ определяется по контрасту и edge map, а не по пониманию лица или глаз.
- В очень шумных фотографиях с шерстью оптимальный результат обычно требует Detail level = Low и повышенного Merge similar regions.
- SVG экспортирует чистый шаблон с группами `contours`, `numbers`, `palette`, `debug`; палитра также остается видимой в интерфейсе.

## Что можно улучшить дальше

- Перенести тяжелые этапы в Web Worker.
- Добавить настоящий SLIC-superpixels или mean-shift segmentation.
- Добавить adaptive threshold для edge map и отдельный предпросмотр важных границ.
- Реализовать cubic Bézier fitting с контролем ошибки вместо текущих квадратичных кривых поверх Chaikin smoothing.
- Добавить экспорт PDF для печати и отдельный лист с палитрой.

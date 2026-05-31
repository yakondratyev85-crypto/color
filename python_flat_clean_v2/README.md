# FlatCleanV2 Python prototype

Локальный Python/OpenCV-прототип для **structure-preserving simplification**: сохранить структуру исходника, красиво упростить цвета, очистить области, построить чистые контуры и экспортировать раскраску по номерам в PNG/SVG.

Старое JS-приложение в корне репозитория считается Legacy и этим прототипом не изменяется.

## Установка Python

Нужен Python 3.10+.

```bash
python --version
# или
python3 --version
```

## Виртуальное окружение

```bash
cd python_flat_clean_v2
python -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\Activate.ps1   # Windows PowerShell
```

## Установка зависимостей

```bash
pip install -r requirements.txt
```

Зависимости: Flask, OpenCV, NumPy, svgwrite.

## Запуск

```bash
python app.py
```

Открыть в браузере:

```text
http://127.0.0.1:5000
```

## Как пользоваться

1. Загрузите изображение.
2. Выберите режим:
   - **Auto** — анализирует картинку и выбирает режим;
   - **Flat Exact** — для постеров/AI-art/vector-like картинок, старается не портить исходные формы;
   - **Photo Simplify** — для фото, использует edge-preserving smoothing и упрощает текстуру;
   - **Coloring Book Clean** — коммерческий режим: меньше деталей, крупнее области, чище лист для печати.
3. Настройте colors, detail level, color tolerance, min region area, merge strength, morph cleanup, smoothing, contour simplify, preserve corners/straight lines, numbering и debug.
4. Нажмите «Создать раскраску».
5. Скачайте PNG/SVG или изучите debug outputs.

## Pipeline

1. **Load image** — загрузка через Flask.
2. **Image analysis** — rounded unique colors, flatness score, texture score, edge density, contrast map, large region ratio.
3. **Mode selection** — Auto выбирает Flat Exact / Photo Simplify / Coloring Book Clean.
4. **Structure-preserving preprocessing**:
   - Flat Exact: минимальный median cleanup без сильного blur;
   - Photo Simplify: `cv2.bilateralFilter` + умеренный `cv2.pyrMeanShiftFiltering`;
   - Coloring Book Clean: более сильная bilateral/mean-shift simplification.
5. **Color grouping / quantization**:
   - Flat Exact: tolerance grouping в RGB с мягким Lab merge только при избытке цветов;
   - Photo/Clean: K-Means в Lab.
6. **Label map** — каждый пиксель получает color id.
7. **Connected components** — 8-связность, region id, color id, area, bbox, mask, neighbors.
8. **Region cleanup / merge** — считаются perimeter, compactness, thinness, bbox fill, local width, can_place_number. Micro/sliver/noisy regions объединяются с лучшим соседом по цвету, общей границе, размеру, форме и important-edge penalty.
9. **Important edge preservation** — Canny/gradient map защищает сильные структурные границы, особенно в Flat Exact.
10. **Contours** — `cv2.findContours`, upscale 2x/3x перед контуризацией, adaptive `approxPolyDP`.
11. **Straight-line preservation** — почти горизонтальные/вертикальные/диагональные серии точек выпрямляются line fitting/snapping.
12. **Organic curve smoothing** — resampling + Chaikin-like smoothing с сохранением углов.
13. **Number placement** — visual center через `cv2.distanceTransform`, номера только в подходящих областях.
14. **PNG/SVG export** — PNG с белым фоном, черными контурами и номерами; SVG с path/text.
15. **Debug outputs** — промежуточные карты для диагностики качества.

## Debug outputs

Все результаты сохраняются в:

```text
python_flat_clean_v2/static/outputs/
```

Файлы:

- `01_original.png`
- `02_preprocessed.png`
- `03_color_map.png`
- `04_regions_debug.png`
- `05_edges_debug.png`
- `06_contours_before.png`
- `07_contours_after.png`
- `08_final_coloring.png`
- `09_final_coloring.svg`

Для обратной совместимости также создаются старые имена `source.png`, `color_map.png`, `regions_debug.png`, `contours_debug.png`, `final_coloring.png`, `final_coloring.svg`.

## Проверка

```bash
pip install -r requirements.txt
python app.py
```

Затем открыть `http://127.0.0.1:5000` и протестировать минимум:

1. Flat illustration: горы, лодка, небо, вода — режим Flat Exact.
2. Фото животного/человека/предмета — режим Photo Simplify.
3. Детальная картинка с фоном — режим Coloring Book Clean или Auto.

Проверьте, что создаются `03_color_map.png`, `04_regions_debug.png`, `08_final_coloring.png`, `09_final_coloring.svg`.

## Ограничения первой версии

- Это прототип, не Photoshop-level редактор.
- Семантического распознавания лиц/глаз нет: важность деталей определяется edge/contrast heuristics.
- SVG пока рисует контуры областей отдельными paths; полноценный single-boundary graph можно добавить позже.
- Для очень сложных фото лучше использовать Coloring Book Clean и повышенный min region area / merge strength.
- Слишком сильная morphology может убрать тонкий декор; уменьшайте morph cleanup для деликатных flat illustrations.

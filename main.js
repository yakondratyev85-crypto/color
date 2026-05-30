'use strict';

const MAX_SIDE = 1200;
const KMEANS_ITERATIONS = 16;
const KMEANS_SAMPLE_LIMIT = 22000;
const DETAIL_PRESETS = {
  low: { labelPasses: 5, minMultiplier: 1.7, mergeBoost: 1.45, rdp: 3.0, minContourMultiplier: 1.15, edgeCutoff: 0.46 },
  medium: { labelPasses: 3, minMultiplier: 1.0, mergeBoost: 1.0, rdp: 2.0, minContourMultiplier: 0.8, edgeCutoff: 0.38 },
  high: { labelPasses: 2, minMultiplier: 0.65, mergeBoost: 0.7, rdp: 1.2, minContourMultiplier: 0.45, edgeCutoff: 0.30 }
};

const els = {
  input: document.getElementById('imageInput'),
  generate: document.getElementById('generateBtn'),
  png: document.getElementById('downloadPng'),
  svg: document.getElementById('downloadSvg'),
  status: document.getElementById('status'),
  source: document.getElementById('sourceCanvas'),
  map: document.getElementById('mapCanvas'),
  final: document.getElementById('finalCanvas'),
  palette: document.getElementById('palette'),
  colorCount: document.getElementById('colorCount'),
  colorSpace: document.getElementById('colorSpace'),
  detailLevel: document.getElementById('detailLevel'),
  minAreaPct: document.getElementById('minAreaPct'),
  mergeStrength: document.getElementById('mergeStrength'),
  contourSmoothing: document.getElementById('contourSmoothing'),
  strokeWidth: document.getElementById('strokeWidth'),
  fontSize: document.getElementById('fontSize'),
  preserveEdges: document.getElementById('preserveEdges'),
  removeTexture: document.getElementById('removeTexture')
};

let sourceImageData = null;
let result = null;

bindRange('colorCount', 'colorsOut');
bindRange('minAreaPct', 'minAreaPctOut');
bindRange('mergeStrength', 'mergeOut');
bindRange('contourSmoothing', 'contourOut');
bindRange('strokeWidth', 'strokeOut');
bindRange('fontSize', 'fontOut');

els.input.addEventListener('change', loadImage);
els.generate.addEventListener('click', generatePainting);
els.png.addEventListener('click', downloadPng);
els.svg.addEventListener('click', downloadSvg);

function bindRange(id, outputId) {
  const input = document.getElementById(id);
  const output = document.getElementById(outputId);
  const sync = () => { output.value = input.value; };
  input.addEventListener('input', sync);
  sync();
}

function setStatus(message) { els.status.textContent = message; }

async function loadImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setStatus('Загружаю изображение...');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = prepareCanvas(els.source, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  sourceImageData = ctx.getImageData(0, 0, width, height);
  result = null;
  els.generate.disabled = false;
  els.png.disabled = true;
  els.svg.disabled = true;
  prepareCanvas(els.map, width, height).clearRect(0, 0, width, height);
  prepareCanvas(els.final, width, height).clearRect(0, 0, width, height);
  els.palette.className = 'palette empty';
  els.palette.textContent = 'Палитра появится после генерации.';
  setStatus(`Изображение готово: ${width}×${height}px. Нажмите «Создать раскраску».`);
}

async function generatePainting() {
  if (!sourceImageData) return;
  els.generate.disabled = true;
  els.png.disabled = true;
  els.svg.disabled = true;
  await nextFrame();

  try {
    const settings = readSettings(sourceImageData.width, sourceImageData.height);
    setStatus('1/9 Строю edge map для важных границ...');
    await nextFrame();
    const edgeMap = buildEdgeMap(sourceImageData);

    setStatus('2/9 Выполняю edge-preserving smoothing (bilateral filter)...');
    await nextFrame();
    const smoothed = bilateralFilter(sourceImageData, edgeMap, settings);

    setStatus(`3/9 Квантизирую цвета K-Means в ${settings.colorSpace.toUpperCase()}...`);
    await nextFrame();
    let { labels, palette } = kMeansQuantize(smoothed, settings.colorCount, settings.colorSpace);

    setStatus('4/9 Группирую соседние пиксели в крупные зоны...');
    await nextFrame();
    labels = edgeAwareLabelSmoothing(labels, palette, edgeMap, smoothed.width, smoothed.height, settings);

    setStatus('5/9 Объединяю похожие соседние регионы...');
    await nextFrame();
    ({ labels, palette } = mergeSimilarPaletteRegions(labels, palette, edgeMap, smoothed.width, smoothed.height, settings));

    setStatus('6/9 Удаляю мелкие пятна и текстурную грязь...');
    await nextFrame();
    labels = mergeSmallComponents(labels, smoothed.width, smoothed.height, palette, edgeMap, settings);
    labels = edgeAwareLabelSmoothing(labels, palette, edgeMap, smoothed.width, smoothed.height, { ...settings, labelPasses: Math.max(1, Math.floor(settings.labelPasses / 2)) });

    setStatus('7/9 Ищу связные области...');
    await nextFrame();
    const components = findComponents(labels, smoothed.width, smoothed.height, Math.max(6, Math.floor(settings.minArea * 0.25)));

    setStatus('8/9 Строю marching-squares контуры и сглаживаю их...');
    await nextFrame();
    const regions = buildRegions(components, labels, smoothed.width, smoothed.height, settings, edgeMap, palette);

    setStatus('9/9 Рисую предпросмотр и экспортные данные...');
    await nextFrame();
    drawColorMap(els.map, labels, palette, smoothed.width, smoothed.height);
    result = { width: smoothed.width, height: smoothed.height, palette, regions, settings };
    renderFinal();
    renderPalette(palette);

    const numbered = regions.filter(region => shouldPlaceNumber(region, settings)).length;
    setStatus(`Готово: ${palette.length} цветов, ${regions.length} чистых областей, ${numbered} номеров.`);
    els.png.disabled = false;
    els.svg.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(`Ошибка: ${error.message}`);
  } finally {
    els.generate.disabled = false;
  }
}

function readSettings(width, height) {
  const detail = DETAIL_PRESETS[els.detailLevel.value] || DETAIL_PRESETS.medium;
  const minAreaPct = Number(els.minAreaPct.value) / 100;
  return {
    colorCount: Number(els.colorCount.value),
    colorSpace: els.colorSpace.value,
    detailLevel: els.detailLevel.value,
    minAreaPct,
    minArea: Math.max(18, Math.round(width * height * minAreaPct * detail.minMultiplier)),
    mergeStrength: Number(els.mergeStrength.value) / 100,
    contourSmoothing: Number(els.contourSmoothing.value),
    strokeWidth: Number(els.strokeWidth.value),
    fontSize: Number(els.fontSize.value),
    preserveEdges: els.preserveEdges.checked,
    removeTexture: els.removeTexture.checked,
    labelPasses: detail.labelPasses,
    mergeBoost: detail.mergeBoost,
    rdp: detail.rdp,
    minContourArea: 0,
    minContourMultiplier: detail.minContourMultiplier,
    edgeCutoff: detail.edgeCutoff
  };
}

function prepareCanvas(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true });
}

function nextFrame() { return new Promise(resolve => requestAnimationFrame(resolve)); }

function buildEdgeMap(imageData) {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = (data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722) / 255;
  }
  const strength = new Float32Array(gray.length);
  let max = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const value = Math.hypot(gx, gy);
      strength[i] = value;
      if (value > max) max = value;
    }
  }
  if (max > 0) {
    for (let i = 0; i < strength.length; i++) strength[i] = Math.min(1, strength[i] / (max * 0.55));
  }
  return { width, height, strength };
}

function bilateralFilter(imageData, edgeMap, settings) {
  const { width, height, data } = imageData;
  const radius = settings.removeTexture ? 3 : 2;
  const sigmaSpatial = radius * 0.75 + 0.85;
  const sigmaColor = settings.removeTexture ? 34 : 26;
  const out = new Uint8ClampedArray(data.length);
  const spatial = new Map();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      const cr = data[p], cg = data[p + 1], cb = data[p + 2];
      let sr = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clamp(x + dx, 0, width - 1);
          const n = yy * width + xx;
          const q = n * 4;
          const key = `${dx},${dy}`;
          let sws = spatial.get(key);
          if (sws === undefined) {
            sws = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpatial * sigmaSpatial));
            spatial.set(key, sws);
          }
          const dr = cr - data[q], dg = cg - data[q + 1], db = cb - data[q + 2];
          const colorW = Math.exp(-(dr * dr + dg * dg + db * db) / (2 * sigmaColor * sigmaColor));
          const edgeBarrier = settings.preserveEdges ? 1 - Math.max(edgeMap.strength[i], edgeMap.strength[n]) * 0.55 : 1;
          const w = sws * colorW * edgeBarrier;
          sr += data[q] * w; sg += data[q + 1] * w; sb += data[q + 2] * w; sw += w;
        }
      }
      const keepOriginal = settings.preserveEdges ? edgeMap.strength[i] * 0.35 : 0;
      out[p] = (sr / sw) * (1 - keepOriginal) + cr * keepOriginal;
      out[p + 1] = (sg / sw) * (1 - keepOriginal) + cg * keepOriginal;
      out[p + 2] = (sb / sw) * (1 - keepOriginal) + cb * keepOriginal;
      out[p + 3] = data[p + 3];
    }
  }
  return new ImageData(out, width, height);
}

function kMeansQuantize(imageData, k, colorSpace) {
  const { width, height, data } = imageData;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / KMEANS_SAMPLE_LIMIT));
  const samples = [];
  for (let i = 0; i < total; i += step) {
    const p = i * 4;
    const rgb = [data[p], data[p + 1], data[p + 2]];
    samples.push({ vector: toColorVector(rgb, colorSpace), rgb });
  }

  const centers = initKMeansPlusPlus(samples.map(s => s.vector), k);
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const sample of samples) {
      const idx = nearestVector(sample.vector, centers);
      sums[idx][0] += sample.vector[0]; sums[idx][1] += sample.vector[1]; sums[idx][2] += sample.vector[2]; sums[idx][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3]) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }

  const labels = new Uint16Array(total);
  const counts = new Uint32Array(k);
  const rgbSums = Array.from({ length: k }, () => [0, 0, 0]);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const rgb = [data[p], data[p + 1], data[p + 2]];
    const idx = nearestVector(toColorVector(rgb, colorSpace), centers);
    labels[i] = idx;
    counts[idx]++;
    rgbSums[idx][0] += rgb[0]; rgbSums[idx][1] += rgb[1]; rgbSums[idx][2] += rgb[2];
  }

  const paletteRaw = centers.map((center, i) => {
    const rgb = counts[i] ? rgbSums[i].map(v => Math.round(v / counts[i])) : fromColorVector(center, colorSpace);
    return { rgb, lab: rgbToLab(rgb), hex: rgbToHex(rgb), count: counts[i], sourceLabels: [i] };
  });
  const order = [...paletteRaw.keys()].sort((a, b) => luminance(paletteRaw[a].rgb) - luminance(paletteRaw[b].rgb));
  const remap = new Uint16Array(k);
  order.forEach((oldIndex, newIndex) => { remap[oldIndex] = newIndex; });
  for (let i = 0; i < labels.length; i++) labels[i] = remap[labels[i]];
  return { labels, palette: order.map(oldIndex => paletteRaw[oldIndex]) };
}

function initKMeansPlusPlus(vectors, k) {
  const centers = [vectors[Math.floor(vectors.length / 2)] || [0, 0, 0]];
  while (centers.length < k) {
    let best = vectors[0] || centers[0];
    let bestDistance = -1;
    const stride = Math.max(1, Math.floor(vectors.length / 3000));
    for (let i = (centers.length * 997) % stride; i < vectors.length; i += stride) {
      const d = vectorDistanceSq(vectors[i], centers[nearestVector(vectors[i], centers)]);
      if (d > bestDistance) { bestDistance = d; best = vectors[i]; }
    }
    centers.push([...best]);
  }
  return centers;
}

function edgeAwareLabelSmoothing(labels, palette, edgeMap, width, height, settings) {
  let current = new Uint16Array(labels);
  const passes = settings.labelPasses ?? 2;
  const offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint16Array(current);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (settings.preserveEdges && edgeMap.strength[i] > 0.74 && pass === 0) continue;
        const scores = new Map([[current[i], 1.8]]);
        for (const offset of offsets) {
          const n = i + offset;
          const label = current[n];
          const edgePenalty = settings.preserveEdges ? Math.max(edgeMap.strength[i], edgeMap.strength[n]) : 0;
          const colorPenalty = labDistance(palette[current[i]].lab, palette[label].lab) / 45;
          const w = 1 / (1 + colorPenalty + edgePenalty * 2.8);
          scores.set(label, (scores.get(label) || 0) + w);
        }
        let best = current[i];
        let bestScore = -Infinity;
        for (const [label, score] of scores) {
          if (score > bestScore) { best = label; bestScore = score; }
        }
        if (best !== current[i] && bestScore > (settings.removeTexture ? 3.6 : 4.2)) next[i] = best;
      }
    }
    current = next;
  }
  return current;
}

function mergeSimilarPaletteRegions(labels, palette, edgeMap, width, height, settings) {
  const parent = new Uint16Array(palette.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const boundary = collectLabelBoundaries(labels, edgeMap, width, height);
  const baseThreshold = (10 + settings.mergeStrength * 22) * settings.mergeBoost;
  for (const item of boundary.values()) {
    const a = findParent(parent, item.a);
    const b = findParent(parent, item.b);
    if (a === b) continue;
    const colorDelta = labDistance(palette[a].lab, palette[b].lab);
    const weakBoundary = item.edge / item.count < settings.edgeCutoff;
    const enoughContact = item.count > Math.sqrt(width * height) * 0.12;
    if (colorDelta < baseThreshold && weakBoundary && enoughContact) parent[Math.max(a, b)] = Math.min(a, b);
  }
  return compactPalette(labels, palette, parent);
}

function collectLabelBoundaries(labels, edgeMap, width, height) {
  const map = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x < width - 1) add(labels[i], labels[i + 1], Math.max(edgeMap.strength[i], edgeMap.strength[i + 1]));
      if (y < height - 1) add(labels[i], labels[i + width], Math.max(edgeMap.strength[i], edgeMap.strength[i + width]));
    }
  }
  function add(a, b, edge) {
    if (a === b) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    const item = map.get(key) || { a: lo, b: hi, count: 0, edge: 0 };
    item.count++;
    item.edge += edge;
    map.set(key, item);
  }
  return map;
}

function mergeSmallComponents(labels, width, height, palette, edgeMap, settings) {
  const out = new Uint16Array(labels);
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 6) {
    changed = false;
    const components = findComponents(out, width, height, 1);
    const sizeByLabel = new Uint32Array(palette.length);
    for (const component of components) sizeByLabel[component.label] += component.area;
    for (const component of components) {
      const boundary = componentBoundaryStats(component, out, width, height, edgeMap, palette);
      const importantDetail = settings.preserveEdges && component.area >= settings.minArea * 0.16 && boundary.edge > 0.42 && boundary.colorContrast > 22;
      if (importantDetail) continue;
      const forceTiny = component.area < settings.minArea;
      const weakTexture = settings.removeTexture && component.area < settings.minArea * 2.2 && boundary.edge < 0.52;
      if (!forceTiny && !weakTexture) continue;
      const replacement = bestNeighborForComponent(component, out, width, height, palette, edgeMap, sizeByLabel, settings);
      if (replacement === null || replacement === component.label) continue;
      for (const pixel of component.pixels) out[pixel] = replacement;
      changed = true;
    }
  }
  return out;
}

function bestNeighborForComponent(component, labels, width, height, palette, edgeMap, sizeByLabel, settings) {
  const scores = new Map();
  for (const p of component.pixels) {
    const x = p % width, y = (p / width) | 0;
    const neighbors = [];
    if (x > 0) neighbors.push(p - 1);
    if (x < width - 1) neighbors.push(p + 1);
    if (y > 0) neighbors.push(p - width);
    if (y < height - 1) neighbors.push(p + width);
    for (const n of neighbors) {
      const label = labels[n];
      if (label === component.label) continue;
      const colorScore = 1 / (1 + labDistance(palette[component.label].lab, palette[label].lab) / 18);
      const edgeScore = settings.preserveEdges ? 1 / (1 + Math.max(edgeMap.strength[p], edgeMap.strength[n]) * 4) : 1;
      const sizeScore = 1 + Math.log1p(sizeByLabel[label]) / 8;
      scores.set(label, (scores.get(label) || 0) + colorScore * edgeScore * sizeScore);
    }
  }
  let best = null, bestScore = -1;
  for (const [label, score] of scores) {
    if (score > bestScore) { best = label; bestScore = score; }
  }
  return best;
}

function componentBoundaryStats(component, labels, width, height, edgeMap, palette) {
  let count = 0, edge = 0, contrast = 0;
  for (const p of component.pixels) {
    const x = p % width, y = (p / width) | 0;
    const neighbors = [];
    if (x > 0) neighbors.push(p - 1);
    if (x < width - 1) neighbors.push(p + 1);
    if (y > 0) neighbors.push(p - width);
    if (y < height - 1) neighbors.push(p + width);
    for (const n of neighbors) {
      if (labels[n] === component.label) continue;
      count++;
      edge += Math.max(edgeMap.strength[p], edgeMap.strength[n]);
      contrast += labDistance(palette[component.label].lab, palette[labels[n]].lab);
    }
  }
  return { edge: count ? edge / count : 0, colorContrast: count ? contrast / count : 0, count };
}

function findComponents(labels, width, height, keepArea) {
  const visited = new Uint8Array(labels.length);
  const components = [];
  const queue = new Uint32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if (visited[start]) continue;
    const label = labels[start];
    let head = 0, tail = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const pixels = [];
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const p = queue[head++];
      pixels.push(p);
      const x = p % width, y = (p / width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
    if (pixels.length >= keepArea) components.push({ label, pixels, area: pixels.length, minX, minY, maxX, maxY });
    function visit(n) {
      if (!visited[n] && labels[n] === label) { visited[n] = 1; queue[tail++] = n; }
    }
  }
  return components;
}

function buildRegions(components, labels, width, height, settings, edgeMap, palette) {
  settings.minContourArea = Math.max(8, Math.floor(settings.minArea * settings.minContourMultiplier));
  const regions = [];
  for (const component of components) {
    const boundary = componentBoundaryStats(component, labels, width, height, edgeMap, palette);
    const importantDetail = settings.preserveEdges && component.area >= settings.minArea * 0.16 && boundary.edge > 0.42 && boundary.colorContrast > 22;
    if (component.area < settings.minContourArea && !importantDetail) continue;
    const rawLoops = marchingSquares(component, labels, width, height);
    const loops = rawLoops
      .map(loop => closeLoop(smoothPath(simplifyRdp(loop, settings.rdp), settings.contourSmoothing)))
      .filter(loop => loop.length >= 5 && Math.abs(polygonArea(loop)) > settings.minContourArea * 0.35);
    if (!loops.length) continue;
    const labelPoint = findVisualCenter(component, labels, width, height);
    regions.push({ ...component, loops, labelPoint });
  }
  regions.sort((a, b) => b.area - a.area);
  return regions;
}

function marchingSquares(component, labels, width, height) {
  const pad = 2;
  const mw = component.maxX - component.minX + 1 + pad * 2;
  const mh = component.maxY - component.minY + 1 + pad * 2;
  const ox = component.minX - pad;
  const oy = component.minY - pad;
  const mask = new Uint8Array(mw * mh);
  for (const p of component.pixels) {
    const x = p % width, y = (p / width) | 0;
    mask[(y - oy) * mw + (x - ox)] = 1;
  }
  const segs = [];
  for (let y = 0; y < mh - 1; y++) {
    for (let x = 0; x < mw - 1; x++) {
      const tl = mask[y * mw + x];
      const tr = mask[y * mw + x + 1];
      const br = mask[(y + 1) * mw + x + 1];
      const bl = mask[(y + 1) * mw + x];
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      addCaseSegments(segs, code, ox + x, oy + y);
    }
  }
  return connectSegments(segs);
}

function addCaseSegments(segs, code, x, y) {
  const top = [x + 0.5, y], right = [x + 1, y + 0.5], bottom = [x + 0.5, y + 1], left = [x, y + 0.5];
  const add = (a, b) => segs.push([a, b]);
  switch (code) {
    case 1: add(left, bottom); break;
    case 2: add(bottom, right); break;
    case 3: add(left, right); break;
    case 4: add(top, right); break;
    case 5: add(top, left); add(bottom, right); break;
    case 6: add(top, bottom); break;
    case 7: add(left, top); break;
    case 8: add(left, top); break;
    case 9: add(top, bottom); break;
    case 10: add(top, right); add(left, bottom); break;
    case 11: add(top, right); break;
    case 12: add(left, right); break;
    case 13: add(bottom, right); break;
    case 14: add(left, bottom); break;
  }
}

function connectSegments(segs) {
  const adjacency = new Map();
  segs.forEach(([a, b], index) => {
    addAdj(a, b, index);
    addAdj(b, a, index);
  });
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const loop = [segs[i][0], segs[i][1]];
    let current = segs[i][1];
    let safety = 0;
    while (safety++ < segs.length + 4) {
      const list = adjacency.get(pointKey(current)) || [];
      const nextItem = list.find(item => !used[item.index]);
      if (!nextItem) break;
      used[nextItem.index] = 1;
      current = nextItem.point;
      loop.push(current);
      if (samePoint(current, loop[0])) break;
    }
    if (loop.length > 4) loops.push(closeLoop(loop));
  }
  return loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));

  function addAdj(a, b, index) {
    const key = pointKey(a);
    if (!adjacency.has(key)) adjacency.set(key, []);
    adjacency.get(key).push({ point: b, index });
  }
}

function simplifyRdp(points, epsilon) {
  if (points.length < 4 || epsilon <= 0) return points;
  const closed = samePoint(points[0], points.at(-1));
  const work = closed ? points.slice(0, -1) : points;
  const simplified = rdpOpen(work, epsilon);
  return closed ? closeLoop(simplified) : simplified;
}

function rdpOpen(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDistance = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points.at(-1));
    if (d > maxDistance) { index = i; maxDistance = d; }
  }
  if (maxDistance > epsilon) {
    const left = rdpOpen(points.slice(0, index + 1), epsilon);
    const right = rdpOpen(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points.at(-1)];
}

function smoothPath(points, iterations) {
  let current = closeLoop(points);
  for (let it = 0; it < iterations; it++) {
    const next = [];
    const n = current.length - 1;
    for (let i = 0; i < n; i++) {
      const a = current[i], b = current[(i + 1) % n];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    current = closeLoop(next);
  }
  return current;
}

function findVisualCenter(component, labels, width, height) {
  const localW = component.maxX - component.minX + 1;
  const localH = component.maxY - component.minY + 1;
  const size = localW * localH;
  const inside = new Uint8Array(size);
  const dist = new Int32Array(size);
  dist.fill(1 << 20);
  const queue = new Uint32Array(size);
  let head = 0, tail = 0;
  for (const p of component.pixels) {
    const x = p % width, y = (p / width) | 0;
    inside[(y - component.minY) * localW + (x - component.minX)] = 1;
  }
  for (const p of component.pixels) {
    const x = p % width, y = (p / width) | 0;
    const li = (y - component.minY) * localW + (x - component.minX);
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1 || labels[p - 1] !== component.label || labels[p + 1] !== component.label || labels[p - width] !== component.label || labels[p + width] !== component.label;
    if (border) { dist[li] = 0; queue[tail++] = li; }
  }
  while (head < tail) {
    const li = queue[head++];
    const x = li % localW, y = (li / localW) | 0;
    const nd = dist[li] + 1;
    visit(x - 1, y, nd); visit(x + 1, y, nd); visit(x, y - 1, nd); visit(x, y + 1, nd);
  }
  let best = -1, bestDistance = -1;
  for (let i = 0; i < size; i++) if (inside[i] && dist[i] > bestDistance) { best = i; bestDistance = dist[i]; }
  return { x: component.minX + (best % localW) + 0.5, y: component.minY + ((best / localW) | 0) + 0.5, radius: bestDistance };
  function visit(x, y, nd) {
    if (x < 0 || y < 0 || x >= localW || y >= localH) return;
    const i = y * localW + x;
    if (!inside[i] || dist[i] <= nd) return;
    dist[i] = nd;
    queue[tail++] = i;
  }
}

function drawColorMap(canvas, labels, palette, width, height) {
  const ctx = prepareCanvas(canvas, width, height);
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < labels.length; i++) {
    const rgb = palette[labels[i]].rgb;
    const p = i * 4;
    imageData.data[p] = rgb[0]; imageData.data[p + 1] = rgb[1]; imageData.data[p + 2] = rgb[2]; imageData.data[p + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function renderFinal() {
  if (!result) return;
  const ctx = prepareCanvas(els.final, result.width, result.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, result.width, result.height);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = result.settings.strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const region of result.regions) {
    for (const loop of region.loops) {
      drawBezierLoop(ctx, loop);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${result.settings.fontSize}px Arial, sans-serif`;
  for (const region of result.regions) {
    if (!shouldPlaceNumber(region, result.settings)) continue;
    ctx.fillText(String(region.label + 1), region.labelPoint.x, region.labelPoint.y);
  }
}

function drawBezierLoop(ctx, points) {
  const pts = points.slice(0, -1);
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length; i++) {
    const current = pts[i];
    const next = pts[(i + 1) % pts.length];
    const mid = [(current[0] + next[0]) / 2, (current[1] + next[1]) / 2];
    ctx.quadraticCurveTo(current[0], current[1], mid[0], mid[1]);
  }
  ctx.closePath();
}

function shouldPlaceNumber(region, settings) {
  const minRadius = Math.max(5, settings.fontSize * 0.52);
  return region.area >= settings.minArea * 1.15 && region.labelPoint.radius >= minRadius;
}

function renderPalette(palette) {
  els.palette.className = 'palette';
  els.palette.innerHTML = '';
  palette.forEach((item, i) => {
    const node = document.createElement('div');
    node.className = 'swatch';
    node.innerHTML = `<span class="swatch-color" style="background:${item.hex}"></span><span><strong>${i + 1}</strong><code>${item.hex}</code></span>`;
    els.palette.appendChild(node);
  });
}

function downloadPng() {
  if (!result) return;
  els.final.toBlob(blob => saveBlob(blob, 'paint-by-numbers.png'), 'image/png');
}

function downloadSvg() {
  if (!result) return;
  saveBlob(new Blob([makeSvg(result)], { type: 'image/svg+xml' }), 'paint-by-numbers.svg');
}

function makeSvg({ width, height, regions, settings }) {
  const paths = [];
  for (const region of regions) {
    for (const loop of region.loops) {
      paths.push(`<path d="${pointsToBezierPath(loop)}" fill="none" stroke="#111" stroke-width="${settings.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
  }
  const labels = regions
    .filter(region => shouldPlaceNumber(region, settings))
    .map(region => `<text x="${round(region.labelPoint.x)}" y="${round(region.labelPoint.y)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="${settings.fontSize}" font-weight="700" fill="#111">${region.label + 1}</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<rect width="100%" height="100%" fill="#fff"/>\n${paths.join('\n')}\n${labels.join('\n')}\n</svg>\n`;
}

function pointsToBezierPath(points) {
  const pts = points.slice(0, -1);
  if (!pts.length) return '';
  let d = `M${round(pts[0][0])} ${round(pts[0][1])}`;
  for (let i = 0; i < pts.length; i++) {
    const current = pts[i];
    const next = pts[(i + 1) % pts.length];
    d += ` Q${round(current[0])} ${round(current[1])} ${round((current[0] + next[0]) / 2)} ${round((current[1] + next[1]) / 2)}`;
  }
  return d + ' Z';
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compactPalette(labels, palette, parent) {
  for (let i = 0; i < parent.length; i++) parent[i] = findParent(parent, i);
  const groups = new Map();
  for (let i = 0; i < palette.length; i++) {
    const root = parent[i];
    if (!groups.has(root)) groups.set(root, { rgb: [0, 0, 0], count: 0, labels: [] });
    const group = groups.get(root);
    group.rgb[0] += palette[i].rgb[0] * palette[i].count;
    group.rgb[1] += palette[i].rgb[1] * palette[i].count;
    group.rgb[2] += palette[i].rgb[2] * palette[i].count;
    group.count += palette[i].count;
    group.labels.push(i);
  }
  const sorted = [...groups.values()].sort((a, b) => luminance(avgRgb(a)) - luminance(avgRgb(b)));
  const oldToNew = new Uint16Array(palette.length);
  const newPalette = sorted.map((group, index) => {
    for (const label of group.labels) oldToNew[label] = index;
    const rgb = avgRgb(group);
    return { rgb, lab: rgbToLab(rgb), hex: rgbToHex(rgb), count: group.count, sourceLabels: group.labels };
  });
  for (let i = 0; i < labels.length; i++) labels[i] = oldToNew[labels[i]];
  return { labels, palette: newPalette };
}

function avgRgb(group) {
  return group.count ? group.rgb.map(v => Math.round(v / group.count)) : [255, 255, 255];
}

function findParent(parent, i) {
  while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
  return i;
}

function toColorVector(rgb, colorSpace) { return colorSpace === 'lab' ? rgbToLab(rgb) : rgb; }
function fromColorVector(vector, colorSpace) { return colorSpace === 'lab' ? labToRgb(vector) : vector.map(Math.round); }
function nearestVector(vector, centers) {
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = vectorDistanceSq(vector, centers[i]);
    if (d < bestDistance) { best = i; bestDistance = d; }
  }
  return best;
}
function vectorDistanceSq(a, b) {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}
function labDistance(a, b) { return Math.sqrt(vectorDistanceSq(a, b)); }
function luminance(rgb) { return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; }

function rgbToLab(rgb) {
  let [r, g, b] = rgb.map(v => v / 255).map(v => v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);
  r *= 100; g *= 100; b *= 100;
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const fx = labPivot(x / 95.047), fy = labPivot(y / 100), fz = labPivot(z / 108.883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function labPivot(v) { return v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116; }
function labToRgb(lab) {
  const [l, a, b] = lab;
  const fy = (l + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  let x = 95.047 * invLabPivot(fx), y = 100 * invLabPivot(fy), z = 108.883 * invLabPivot(fz);
  x /= 100; y /= 100; z /= 100;
  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let bl = x * 0.0557 + y * -0.2040 + z * 1.0570;
  return [r, g, bl].map(v => clamp(Math.round(255 * (v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v)), 0, 255));
}
function invLabPivot(v) { const v3 = v ** 3; return v3 > 0.008856 ? v3 : (v - 16 / 116) / 7.787; }

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy);
}
function closeLoop(points) {
  if (!points.length) return points;
  return samePoint(points[0], points.at(-1)) ? points : [...points, points[0]];
}
function samePoint(a, b) { return a && b && Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001; }
function pointKey(p) { return `${Math.round(p[0] * 2) / 2},${Math.round(p[1] * 2) / 2}`; }
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  return area / 2;
}
function rgbToHex(rgb) { return '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function round(value) { return Math.round(value * 10) / 10; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

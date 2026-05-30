'use strict';

const MAX_SIDE = 1200;
const KMEANS_ITERATIONS = 14;
const KMEANS_SAMPLE_LIMIT = 18000;

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
  minArea: document.getElementById('minArea'),
  blurRadius: document.getElementById('blurRadius'),
  smoothness: document.getElementById('smoothness'),
  strokeWidth: document.getElementById('strokeWidth'),
  fontSize: document.getElementById('fontSize')
};

let sourceImageData = null;
let result = null;

bindRange('colorCount', 'colorsOut');
bindRange('minArea', 'minAreaOut');
bindRange('blurRadius', 'blurOut');
bindRange('smoothness', 'smoothOut');
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

function setStatus(message) {
  els.status.textContent = message;
}

async function loadImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setStatus('Загружаю изображение...');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = prepareCanvas(els.source, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  sourceImageData = ctx.getImageData(0, 0, width, height);
  els.generate.disabled = false;
  result = null;
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
    const settings = readSettings();
    setStatus('1/7 Сглаживаю шум...');
    await nextFrame();
    const smoothed = boxBlur(sourceImageData, settings.blurRadius);

    setStatus('2/7 Подбираю основные цвета K-Means...');
    await nextFrame();
    const { labels, palette } = kMeansQuantize(smoothed, settings.colorCount);

    setStatus('3/7 Укрупняю области и убираю мелкую грязь...');
    await nextFrame();
    const cleanLabels = majoritySmooth(labels, smoothed.width, smoothed.height, 1);
    const mergedLabels = mergeSmallComponents(cleanLabels, smoothed.width, smoothed.height, palette, settings.minArea);

    setStatus('4/7 Строю связные области...');
    await nextFrame();
    const components = findComponents(mergedLabels, smoothed.width, smoothed.height, settings.minArea);

    setStatus('5/7 Трассирую и сглаживаю контуры...');
    await nextFrame();
    const regions = buildRegions(components, mergedLabels, smoothed.width, smoothed.height, settings);

    setStatus('6/7 Рисую предпросмотры...');
    await nextFrame();
    drawColorMap(els.map, mergedLabels, palette, smoothed.width, smoothed.height);
    result = { width: smoothed.width, height: smoothed.height, palette, regions, settings };
    renderFinal();
    renderPalette(palette);

    setStatus(`Готово: ${palette.length} цветов, ${regions.length} пронумерованных/контурных областей.`);
    els.png.disabled = false;
    els.svg.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(`Ошибка: ${error.message}`);
  } finally {
    els.generate.disabled = false;
  }
}

function readSettings() {
  return {
    colorCount: Number(els.colorCount.value),
    minArea: Number(els.minArea.value),
    blurRadius: Number(els.blurRadius.value),
    smoothness: Number(els.smoothness.value),
    strokeWidth: Number(els.strokeWidth.value),
    fontSize: Number(els.fontSize.value)
  };
}

function prepareCanvas(canvas, width, height) {
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true });
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function boxBlur(imageData, radius) {
  if (radius <= 0) return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  // A separable box blur is intentionally used instead of a heavier bilateral filter:
  // it removes camera noise reliably in a small offline app and keeps the pipeline dependency-free.
  const { width, height, data } = imageData;
  const temp = new Float32Array(data.length);
  const out = new Uint8ClampedArray(data.length);
  const diameter = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const acc = [0, 0, 0, 0];
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = clamp(x + dx, 0, width - 1);
        const i = (y * width + sx) * 4;
        acc[0] += data[i]; acc[1] += data[i + 1]; acc[2] += data[i + 2]; acc[3] += data[i + 3];
      }
      const j = (y * width + x) * 4;
      temp[j] = acc[0] / diameter; temp[j + 1] = acc[1] / diameter; temp[j + 2] = acc[2] / diameter; temp[j + 3] = acc[3] / diameter;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const acc = [0, 0, 0, 0];
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = clamp(y + dy, 0, height - 1);
        const i = (sy * width + x) * 4;
        acc[0] += temp[i]; acc[1] += temp[i + 1]; acc[2] += temp[i + 2]; acc[3] += temp[i + 3];
      }
      const j = (y * width + x) * 4;
      out[j] = acc[0] / diameter; out[j + 1] = acc[1] / diameter; out[j + 2] = acc[2] / diameter; out[j + 3] = acc[3] / diameter;
    }
  }
  return new ImageData(out, width, height);
}

function kMeansQuantize(imageData, k) {
  const { width, height, data } = imageData;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / KMEANS_SAMPLE_LIMIT));
  const samples = [];
  for (let i = 0; i < total; i += step) {
    const p = i * 4;
    if (data[p + 3] > 10) samples.push([data[p], data[p + 1], data[p + 2]]);
  }

  const centers = initKMeansPlusPlus(samples, k);
  const assignments = new Int16Array(samples.length);
  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const idx = nearestColor(samples[i], centers);
      assignments[i] = idx;
      sums[idx][0] += samples[i][0]; sums[idx][1] += samples[i][1]; sums[idx][2] += samples[i][2]; sums[idx][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3]) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }

  const labels = new Uint16Array(total);
  const counts = new Uint32Array(k);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const color = [data[p], data[p + 1], data[p + 2]];
    const idx = nearestColor(color, centers);
    labels[i] = idx;
    counts[idx]++;
  }

  const order = [...centers.keys()].sort((a, b) => luminance(centers[a]) - luminance(centers[b]));
  const remap = new Uint16Array(k);
  order.forEach((oldIndex, newIndex) => { remap[oldIndex] = newIndex; });
  const palette = order.map(oldIndex => ({ rgb: centers[oldIndex].map(Math.round), hex: rgbToHex(centers[oldIndex]), count: counts[oldIndex] }));
  for (let i = 0; i < labels.length; i++) labels[i] = remap[labels[i]];
  return { labels, palette };
}

function initKMeansPlusPlus(samples, k) {
  const centers = [samples[Math.floor(samples.length / 2)] || [255, 255, 255]];
  while (centers.length < k) {
    let best = samples[0] || centers[0];
    let bestDistance = -1;
    const stride = Math.max(1, Math.floor(samples.length / 2000));
    for (let i = (centers.length * 997) % stride; i < samples.length; i += stride) {
      const d = colorDistanceSq(samples[i], centers[nearestColor(samples[i], centers)]);
      if (d > bestDistance) { bestDistance = d; best = samples[i]; }
    }
    centers.push([...best]);
  }
  return centers;
}

function nearestColor(rgb, centers) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = colorDistanceSq(rgb, centers[i]);
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  return best;
}

function colorDistanceSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

function luminance(rgb) {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function majoritySmooth(labels, width, height, passes) {
  let current = new Uint16Array(labels);
  const neighbors = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint16Array(current);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const counts = new Map();
        for (const offset of neighbors) counts.set(current[i + offset], (counts.get(current[i + offset]) || 0) + 1);
        let best = current[i];
        let bestCount = 0;
        for (const [label, count] of counts) {
          if (count > bestCount) { best = label; bestCount = count; }
        }
        if (bestCount >= 5) next[i] = best;
      }
    }
    current = next;
  }
  return current;
}

function mergeSmallComponents(labels, width, height, palette, minArea) {
  const out = new Uint16Array(labels);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 5) {
    changed = false;
    const components = findComponents(out, width, height, 1);
    for (const component of components) {
      if (component.area >= minArea) continue;
      const replacement = bestNeighborLabel(component, out, width, height, palette);
      if (replacement === null || replacement === component.label) continue;
      for (const pixel of component.pixels) out[pixel] = replacement;
      changed = true;
    }
  }
  return out;
}

function bestNeighborLabel(component, labels, width, height, palette) {
  const scores = new Map();
  for (const p of component.pixels) {
    const x = p % width;
    const y = (p / width) | 0;
    const ns = [];
    if (x > 0) ns.push(p - 1);
    if (x < width - 1) ns.push(p + 1);
    if (y > 0) ns.push(p - width);
    if (y < height - 1) ns.push(p + width);
    for (const n of ns) {
      const label = labels[n];
      if (label === component.label) continue;
      const colorPenalty = Math.sqrt(colorDistanceSq(palette[component.label].rgb, palette[label].rgb)) / 18;
      scores.set(label, (scores.get(label) || 0) + 1 / (1 + colorPenalty));
    }
  }
  let best = null;
  let bestScore = -1;
  for (const [label, score] of scores) {
    if (score > bestScore) { best = label; bestScore = score; }
  }
  return best;
}

function findComponents(labels, width, height, keepArea) {
  const visited = new Uint8Array(labels.length);
  const components = [];
  const queue = new Uint32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if (visited[start]) continue;
    const label = labels[start];
    let head = 0;
    let tail = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const pixels = [];
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const p = queue[head++];
      pixels.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
    if (pixels.length >= keepArea) components.push({ label, pixels, area: pixels.length, minX, minY, maxX, maxY });

    function visit(n) {
      if (!visited[n] && labels[n] === label) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  return components;
}

function buildRegions(components, labels, width, height, settings) {
  const regions = [];
  for (const component of components) {
    const loops = traceComponentLoops(component, labels, width, height)
      .map(points => smoothPath(simplifyRdp(points, 1.4), settings.smoothness))
      .filter(points => points.length >= 4);
    if (!loops.length) continue;
    const labelPoint = findVisualCenter(component, labels, width, height);
    regions.push({ ...component, loops, labelPoint });
  }
  regions.sort((a, b) => b.area - a.area);
  return regions;
}

function traceComponentLoops(component, labels, width, height) {
  const edgeMap = new Map();
  for (const p of component.pixels) {
    const x = p % width;
    const y = (p / width) | 0;
    const label = component.label;
    if (y === 0 || labels[p - width] !== label) addEdge(edgeMap, x, y, x + 1, y);
    if (x === width - 1 || labels[p + 1] !== label) addEdge(edgeMap, x + 1, y, x + 1, y + 1);
    if (y === height - 1 || labels[p + width] !== label) addEdge(edgeMap, x + 1, y + 1, x, y + 1);
    if (x === 0 || labels[p - 1] !== label) addEdge(edgeMap, x, y + 1, x, y);
  }

  const loops = [];
  while (edgeMap.size) {
    const firstKey = edgeMap.keys().next().value;
    const [sx, sy] = firstKey.split(',').map(Number);
    let key = firstKey;
    const points = [[sx, sy]];
    let safety = 0;
    while (edgeMap.has(key) && safety++ < component.area * 8 + 1000) {
      const bucket = edgeMap.get(key);
      const next = bucket.pop();
      if (!bucket.length) edgeMap.delete(key);
      points.push(next);
      key = pointKey(next[0], next[1]);
      if (key === firstKey) break;
    }
    if (points.length > 4) loops.push(points);
  }
  return loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
}

function addEdge(map, x1, y1, x2, y2) {
  const key = pointKey(x1, y1);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push([x2, y2]);
}
function pointKey(x, y) { return `${x},${y}`; }

function simplifyRdp(points, epsilon) {
  if (points.length < 4) return points;
  const closed = points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1];
  const work = closed ? points.slice(0, -1) : points;
  const simplified = rdpOpen(work, epsilon);
  return closed ? [...simplified, simplified[0]] : simplified;
}

function rdpOpen(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) { index = i; maxDistance = d; }
  }
  if (maxDistance > epsilon) {
    const left = rdpOpen(points.slice(0, index + 1), epsilon);
    const right = rdpOpen(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function perpendicularDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy);
}

function smoothPath(points, iterations) {
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next = [];
    const closed = current[0][0] === current.at(-1)[0] && current[0][1] === current.at(-1)[1];
    const limit = closed ? current.length - 1 : current.length - 1;
    for (let i = 0; i < limit; i++) {
      const a = current[i];
      const b = current[(i + 1) % (closed ? current.length - 1 : current.length)];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (closed) next.push(next[0]);
    current = next;
  }
  return current;
}

function findVisualCenter(component, labels, width, height) {
  // Distance-transform visual center: faster than full polylabel on many raster components and guaranteed to stay inside the region.
  const localW = component.maxX - component.minX + 1;
  const localH = component.maxY - component.minY + 1;
  const size = localW * localH;
  const inside = new Uint8Array(size);
  const dist = new Int32Array(size);
  dist.fill(1 << 20);
  const queue = new Uint32Array(size);
  let head = 0, tail = 0;

  for (const p of component.pixels) {
    const x = p % width;
    const y = (p / width) | 0;
    const li = (y - component.minY) * localW + (x - component.minX);
    inside[li] = 1;
  }
  for (const p of component.pixels) {
    const x = p % width;
    const y = (p / width) | 0;
    const li = (y - component.minY) * localW + (x - component.minX);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || labels[p - 1] !== component.label || labels[p + 1] !== component.label || labels[p - width] !== component.label || labels[p + width] !== component.label) {
      dist[li] = 0;
      queue[tail++] = li;
    }
  }
  while (head < tail) {
    const li = queue[head++];
    const x = li % localW;
    const y = (li / localW) | 0;
    const nd = dist[li] + 1;
    visitLocal(x - 1, y, nd); visitLocal(x + 1, y, nd); visitLocal(x, y - 1, nd); visitLocal(x, y + 1, nd);
  }
  let best = -1;
  let bestDistance = -1;
  for (let i = 0; i < size; i++) {
    if (inside[i] && dist[i] > bestDistance) { best = i; bestDistance = dist[i]; }
  }
  return { x: component.minX + (best % localW) + 0.5, y: component.minY + ((best / localW) | 0) + 0.5, radius: bestDistance };

  function visitLocal(x, y, nd) {
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
      drawLoop(ctx, loop);
      ctx.stroke();
    }
  }

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${result.settings.fontSize}px Arial, sans-serif`;
  for (const region of result.regions) {
    const minRadius = Math.max(4, result.settings.fontSize * 0.42);
    if (region.area < result.settings.minArea * 1.25 || region.labelPoint.radius < minRadius) continue;
    ctx.fillText(String(region.label + 1), region.labelPoint.x, region.labelPoint.y);
  }
}

function drawLoop(ctx, loop) {
  ctx.beginPath();
  ctx.moveTo(loop[0][0], loop[0][1]);
  for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i][0], loop[i][1]);
  ctx.closePath();
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
      paths.push(`<path d="${pointsToPath(loop)}" fill="none" stroke="#111" stroke-width="${settings.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
  }
  const labels = regions
    .filter(region => region.area >= settings.minArea * 1.25 && region.labelPoint.radius >= Math.max(4, settings.fontSize * 0.42))
    .map(region => `<text x="${round(region.labelPoint.x)}" y="${round(region.labelPoint.y)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="${settings.fontSize}" font-weight="700" fill="#111">${region.label + 1}</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<rect width="100%" height="100%" fill="#fff"/>\n${paths.join('\n')}\n${labels.join('\n')}\n</svg>\n`;
}

function pointsToPath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${round(p[0])} ${round(p[1])}`).join(' ') + ' Z';
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

function rgbToHex(rgb) {
  return '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function round(value) { return Math.round(value * 10) / 10; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  return area / 2;
}

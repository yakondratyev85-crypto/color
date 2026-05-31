from __future__ import annotations

import cv2
import numpy as np


def _to_lab(rgb: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(rgb.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB)
    return lab.reshape(-1, 3).astype(np.float32)


def _assign_in_chunks(vectors: np.ndarray, centers: np.ndarray, chunk_size: int = 180_000) -> np.ndarray:
    labels = np.empty((vectors.shape[0],), dtype=np.int32)
    for start in range(0, vectors.shape[0], chunk_size):
        chunk = vectors[start:start + chunk_size]
        distances = ((chunk[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels[start:start + chunk_size] = np.argmin(distances, axis=1)
    return labels


def group_colors(rgb: np.ndarray, mode: str, color_count: int, color_tolerance: int, detail_level: str) -> tuple[np.ndarray, np.ndarray]:
    if mode == "flat":
        return tolerance_group_flat_colors(rgb, color_count, color_tolerance)
    k = color_count
    if mode == "clean":
        k = max(8, min(color_count, 14 if detail_level == "low" else 16))
    return kmeans_lab_colors(rgb, k, sample_limit=70_000 if mode == "photo" else 55_000)


def tolerance_group_flat_colors(rgb: np.ndarray, color_count: int = 18, tolerance: int = 18) -> tuple[np.ndarray, np.ndarray]:
    """Flat Preserve grouping: merge close colors without global K-Means.

    This mode intentionally avoids aggressive K-Means because flat/poster inputs
    already contain meaningful color regions. We first bucket close RGB values,
    then union only perceptually close bucket means in Lab. If the palette still
    exceeds the requested count, the smallest/rarest groups are merged into their
    nearest neighbour. That final cap is local and count-aware rather than a full
    image-wide recoloring.
    """
    h, w, _ = rgb.shape
    tol = max(4, int(tolerance))
    pixels = rgb.reshape(-1, 3).astype(np.uint8)
    buckets = np.floor_divide(pixels.astype(np.int32) + tol // 2, tol).astype(np.int32)
    packed = buckets[:, 0] * 1_000_000 + buckets[:, 1] * 1_000 + buckets[:, 2]
    _unique, inverse, counts = np.unique(packed, return_inverse=True, return_counts=True)
    sums = np.zeros((len(counts), 3), dtype=np.float64)
    for channel in range(3):
        sums[:, channel] = np.bincount(inverse, weights=pixels[:, channel], minlength=len(counts))
    bucket_palette = np.rint(sums / np.maximum(counts[:, None], 1)).clip(0, 255).astype(np.uint8)

    bucket_labels = _merge_close_flat_buckets(bucket_palette, counts, max(2, int(color_count)), tol)
    pixel_labels = bucket_labels[inverse]
    palette = _palette_from_labels(pixels, pixel_labels, int(pixel_labels.max()) + 1)
    return _stable_remap(pixel_labels.reshape(h, w), palette)


def _merge_close_flat_buckets(bucket_palette: np.ndarray, counts: np.ndarray, target_count: int, tolerance: int) -> np.ndarray:
    n = len(bucket_palette)
    if n == 0:
        return np.zeros((0,), dtype=np.int32)
    parent = np.arange(n, dtype=np.int32)
    lab = cv2.cvtColor(bucket_palette.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    close_threshold = max(7.5, 8.5 + tolerance * 0.42)

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = int(parent[i])
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    # Close-color union. For very large bucket counts, compare each bucket only
    # with nearby colours after luminance sorting to keep this prototype local.
    order = np.argsort(lab[:, 0])
    window = 96 if n > 1200 else n
    for pos, i in enumerate(order):
        stop = min(len(order), pos + window)
        candidates = order[pos + 1:stop]
        if len(candidates) == 0:
            continue
        distances = np.linalg.norm(lab[candidates] - lab[i], axis=1)
        for j in candidates[distances <= close_threshold]:
            union(int(i), int(j))

    labels = _compact_labels(np.array([find(i) for i in range(n)], dtype=np.int32))
    labels = _merge_until_palette_cap(labels, lab, counts, target_count, close_threshold)
    return labels


def _merge_until_palette_cap(labels: np.ndarray, lab: np.ndarray, counts: np.ndarray, target_count: int, close_threshold: float) -> np.ndarray:
    labels = labels.copy()
    while len(np.unique(labels)) > target_count:
        groups = np.unique(labels)
        group_counts = np.array([counts[labels == group].sum() for group in groups], dtype=np.float64)
        group_labs = np.array([
            np.average(lab[labels == group], axis=0, weights=counts[labels == group])
            for group in groups
        ], dtype=np.float32)
        smallest_pos = int(np.argmin(group_counts))
        source_group = groups[smallest_pos]
        distances = np.linalg.norm(group_labs - group_labs[smallest_pos], axis=1)
        distances[smallest_pos] = np.inf
        target_pos = int(np.argmin(distances))
        # Preserve significant, clearly distinct flat colors. If the remaining
        # excess groups are all strong distinct colors, stop instead of damaging
        # the source illustration.
        rare = group_counts[smallest_pos] < counts.sum() * 0.006
        close = distances[target_pos] <= close_threshold * 2.2
        if not rare and not close:
            break
        labels[labels == source_group] = groups[target_pos]
        labels = _compact_labels(labels)
    return labels


def _compact_labels(labels: np.ndarray) -> np.ndarray:
    unique = np.unique(labels)
    remap = {old: new for new, old in enumerate(unique)}
    return np.array([remap[value] for value in labels], dtype=np.int32)

def kmeans_lab_colors(rgb: np.ndarray, color_count: int = 18, sample_limit: int = 60_000) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = rgb.shape
    pixels_rgb = rgb.reshape(-1, 3).astype(np.uint8)
    vectors = _to_lab(rgb)
    total = vectors.shape[0]
    sample = vectors[::max(1, total // sample_limit)].copy() if total > sample_limit else vectors.copy()
    k = max(2, min(int(color_count), len(sample)))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 34, 0.32)
    _compactness, _sample_labels, centers = cv2.kmeans(sample.astype(np.float32), k, None, criteria, 4, cv2.KMEANS_PP_CENTERS)
    flat_labels = _assign_in_chunks(vectors, centers.astype(np.float32))
    palette = _palette_from_labels(pixels_rgb, flat_labels, k)
    return _stable_remap(flat_labels.reshape(h, w), palette)


def group_flat_colors(rgb: np.ndarray, color_count: int = 18, sample_limit: int = 60_000) -> tuple[np.ndarray, np.ndarray]:
    """Backward-compatible alias used by older prototype code/tests."""
    return kmeans_lab_colors(rgb, color_count, sample_limit)


def _palette_from_labels(pixels_rgb: np.ndarray, labels: np.ndarray, k: int) -> np.ndarray:
    palette = np.zeros((k, 3), dtype=np.float32)
    counts = np.bincount(labels, minlength=k).astype(np.float32)
    for channel in range(3):
        palette[:, channel] = np.bincount(labels, weights=pixels_rgb[:, channel], minlength=k)
    return np.rint(palette / np.maximum(counts[:, None], 1.0)).clip(0, 255).astype(np.uint8)


def _stable_remap(label_map: np.ndarray, palette: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    palette_lab = cv2.cvtColor(palette.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3)
    order = sorted(range(len(palette)), key=lambda i: (int(palette_lab[i, 0]), int(palette_lab[i, 1]), int(palette_lab[i, 2])))
    remap = np.zeros((len(palette),), dtype=np.int32)
    for new_id, old_id in enumerate(order):
        remap[old_id] = new_id
    return remap[label_map].astype(np.int32), palette[order]

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
    """Flat Exact grouping: preserve poster geometry and merge only close colors.

    Pixels are first bucketed by tolerance in RGB. If there are still too many
    buckets, only then a mild Lab K-Means is used on bucket representatives rather
    than on every pixel, reducing aggressive recoloring.
    """
    h, w, _ = rgb.shape
    tol = max(4, int(tolerance))
    pixels = rgb.reshape(-1, 3).astype(np.uint8)
    buckets = np.floor_divide(pixels.astype(np.int32) + tol // 2, tol).astype(np.int32)
    packed = buckets[:, 0] * 1_000_000 + buckets[:, 1] * 1_000 + buckets[:, 2]
    unique, inverse, counts = np.unique(packed, return_inverse=True, return_counts=True)
    sums = np.zeros((len(unique), 3), dtype=np.float64)
    for channel in range(3):
        sums[:, channel] = np.bincount(inverse, weights=pixels[:, channel], minlength=len(unique))
    bucket_palette = np.rint(sums / np.maximum(counts[:, None], 1)).clip(0, 255).astype(np.uint8)

    if len(bucket_palette) <= color_count:
        labels = inverse.astype(np.int32)
        palette = bucket_palette
    else:
        reps_lab = cv2.cvtColor(bucket_palette.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
        k = max(2, min(color_count, len(bucket_palette)))
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.3)
        _compactness, rep_labels, centers = cv2.kmeans(reps_lab, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
        rep_labels = rep_labels.reshape(-1).astype(np.int32)
        labels = rep_labels[inverse]
        palette = _palette_from_labels(pixels, labels, k)

    return _stable_remap(labels.reshape(h, w), palette)


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

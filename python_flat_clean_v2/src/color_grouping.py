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


def group_flat_colors(rgb: np.ndarray, color_count: int = 18, sample_limit: int = 60_000) -> tuple[np.ndarray, np.ndarray]:
    """Group close flat-illustration colors without blurring geometry.

    The clustering is done in OpenCV Lab space for perceptual stability. K-Means is
    trained on a deterministic sample and then every pixel is assigned to the
    nearest center. Palette colors are recomputed as RGB means of full-resolution
    assignments so exported HEX/preview colors match the actual label map.
    """
    h, w, _ = rgb.shape
    pixels_rgb = rgb.reshape(-1, 3).astype(np.uint8)
    vectors = _to_lab(rgb)
    total = vectors.shape[0]

    if total > sample_limit:
        # Deterministic grid-like sample: avoids random UI-to-UI differences.
        step = max(1, total // sample_limit)
        sample = vectors[::step].copy()
    else:
        sample = vectors.copy()

    k = max(2, min(int(color_count), len(sample)))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 28, 0.35)
    _compactness, _sample_labels, centers = cv2.kmeans(
        sample.astype(np.float32),
        k,
        None,
        criteria,
        3,
        cv2.KMEANS_PP_CENTERS,
    )

    flat_labels = _assign_in_chunks(vectors, centers.astype(np.float32))

    palette = np.zeros((k, 3), dtype=np.float32)
    counts = np.bincount(flat_labels, minlength=k).astype(np.float32)
    for channel in range(3):
        palette[:, channel] = np.bincount(flat_labels, weights=pixels_rgb[:, channel], minlength=k)
    counts_safe = np.maximum(counts[:, None], 1.0)
    palette = np.rint(palette / counts_safe).clip(0, 255).astype(np.uint8)

    # Stable number order: dark to light, then hue-ish Lab a/b values.
    palette_lab = cv2.cvtColor(palette.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3)
    order = sorted(range(k), key=lambda i: (int(palette_lab[i, 0]), int(palette_lab[i, 1]), int(palette_lab[i, 2])))
    remap = np.zeros((k,), dtype=np.int32)
    for new_id, old_id in enumerate(order):
        remap[old_id] = new_id

    label_map = remap[flat_labels].reshape(h, w).astype(np.int32)
    ordered_palette = palette[order]
    return label_map, ordered_palette

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class ImageAnalysis:
    rounded_unique_colors: int
    flatness_score: float
    texture_score: float
    edge_density: float
    large_region_ratio: float
    contrast_mean: float
    suggested_mode: str


def build_contrast_and_edges(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(gx, gy)
    scale = float(np.percentile(magnitude, 98))
    if float(magnitude.max()) > 0 and scale > 1e-6:
        contrast = np.clip(magnitude / scale, 0, 1)
    else:
        contrast = np.zeros_like(magnitude, dtype=np.float32)
    median = float(np.median(gray))
    lower = int(max(0, 0.66 * median))
    upper = int(min(255, 1.33 * median + 20))
    canny = cv2.Canny(gray, lower, upper)
    important_edges = cv2.dilate(canny, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1)
    return contrast.astype(np.float32), canny, important_edges


def analyze_image(rgb: np.ndarray) -> ImageAnalysis:
    h, w = rgb.shape[:2]
    total = h * w
    step = max(1, total // 90_000)
    sampled = rgb.reshape(-1, 3)[::step]
    rounded = (sampled // 16).astype(np.uint8)
    rounded_unique = int(np.unique(rounded, axis=0).shape[0])

    contrast, canny, _important = build_contrast_and_edges(rgb)
    edge_density = float(np.count_nonzero(canny) / total)
    contrast_mean = float(np.mean(contrast))

    # Texture is high-frequency residual after a structure-preserving median base.
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    base = cv2.medianBlur(gray, 7)
    residual = cv2.absdiff(gray, base)
    texture_score = float(np.clip(np.mean(residual) / 32.0, 0, 1))

    # Estimate large region ratio by coarse quantization and connected components.
    coarse = ((rgb // 32).astype(np.int32)[:, :, 0] * 64 + (rgb // 32).astype(np.int32)[:, :, 1] * 8 + (rgb // 32).astype(np.int32)[:, :, 2])
    large_pixels = 0
    for value in np.unique(coarse):
        mask = (coarse == value).astype(np.uint8)
        count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        if count > 1:
            large_pixels += int(stats[1:, cv2.CC_STAT_AREA][stats[1:, cv2.CC_STAT_AREA] > total * 0.02].sum())
    large_region_ratio = large_pixels / max(1, total)

    color_complexity = min(1.0, rounded_unique / 220.0)
    flatness_score = float(np.clip(large_region_ratio * 0.55 + edge_density * 1.2 - texture_score * 0.55 - color_complexity * 0.35, 0, 1))
    if flatness_score > 0.46 and texture_score < 0.33:
        suggested = "flat"
    elif texture_score > 0.48 or rounded_unique > 180:
        suggested = "photo"
    else:
        suggested = "clean"
    return ImageAnalysis(rounded_unique, flatness_score, texture_score, edge_density, large_region_ratio, contrast_mean, suggested)


def edge_debug_rgb(contrast: np.ndarray, important_edges: np.ndarray) -> np.ndarray:
    gray = np.clip(contrast * 255, 0, 255).astype(np.uint8)
    rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
    rgb[important_edges > 0] = np.array([255, 40, 30], dtype=np.uint8)
    return rgb

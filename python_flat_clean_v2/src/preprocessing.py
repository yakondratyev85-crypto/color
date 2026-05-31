from __future__ import annotations

import cv2
import numpy as np


def preprocess_structure(rgb: np.ndarray, mode: str, detail_level: str, smoothing_strength: int) -> np.ndarray:
    strength = int(max(0, min(10, smoothing_strength)))
    if mode == "flat":
        if strength <= 1:
            return rgb.copy()
        # Small median only: removes isolated pixels but keeps flat poster edges.
        k = 3 if strength < 5 else 5
        return cv2.medianBlur(rgb, k)

    if mode == "clean":
        # Commercial coloring-book mode: stronger structure-preserving simplification.
        d = 7 + strength * 2
        sigma_color = 35 + strength * 8
        sigma_space = 9 + strength * 2
        smooth = cv2.bilateralFilter(rgb, d=d, sigmaColor=sigma_color, sigmaSpace=sigma_space)
        spatial_radius = 10 + strength * 2
        color_radius = 18 + strength * 3
        return cv2.pyrMeanShiftFiltering(smooth, sp=spatial_radius, sr=color_radius, maxLevel=1)

    # Photo Structure Preserve: use bilateral + moderate mean-shift to remove texture while
    # keeping high-contrast structure. This is intentionally not a plain blur.
    d = 5 + strength * 2
    smooth = cv2.bilateralFilter(rgb, d=d, sigmaColor=28 + strength * 7, sigmaSpace=7 + strength * 2)
    if detail_level == "high":
        return smooth
    sp = 8 + strength
    sr = 14 + strength * 2
    return cv2.pyrMeanShiftFiltering(smooth, sp=sp, sr=sr, maxLevel=1)

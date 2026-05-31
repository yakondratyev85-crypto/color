from __future__ import annotations

import cv2
import numpy as np

from .regions import Region


def visual_center(region: Region, min_radius: float = 8.0) -> tuple[int, int, float] | None:
    x, y, w, h = region.bbox
    if w <= 2 or h <= 2:
        return None
    local = region.mask[y:y + h, x:x + w].astype(np.uint8)
    if local.sum() == 0:
        return None
    dist = cv2.distanceTransform(local, cv2.DIST_L2, 5)
    _min_val, max_val, _min_loc, max_loc = cv2.minMaxLoc(dist)
    if max_val < min_radius:
        return None
    return (x + int(max_loc[0]), y + int(max_loc[1]), float(max_val))


def place_numbers(regions: list[Region], min_area: int, show_numbers: bool = True, number_size: int = 14) -> list[dict]:
    if not show_numbers:
        return []
    numbers: list[dict] = []
    required_radius = max(7.0, number_size * 0.48)
    for region in regions:
        if region.area < max(min_area * 1.20, 90) or not region.can_place_number:
            continue
        center = visual_center(region, min_radius=required_radius)
        if center is None:
            continue
        x, y, radius = center
        numbers.append({
            "region_id": region.id,
            "color_id": region.color_id,
            "number": int(region.color_id) + 1,
            "x": x,
            "y": y,
            "radius": radius,
        })
    return numbers
